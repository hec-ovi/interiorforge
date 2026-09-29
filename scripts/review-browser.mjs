/** Disposable browser tooling for building review captures. Adapted from compose/play-probe.mjs. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
const BROWSERS = [ '/opt/brave.com/brave/brave', 'brave-browser', 'google-chrome', 'chromium', 'chromium-browser' ];
const PAGE_MS = 60000;
const FLAGS = [ '--headless', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--mute-audio', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-gl=angle',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--window-size=1600,900', '--remote-debugging-pipe' ];
export const sleep = ms => new Promise( done => setTimeout( done, ms ) );
/** The Chromium-family binary: the one requested, else URBE_BROWSER, else Brave, Chrome or Chromium on PATH. */
export function browserPath( requested ) {
  const named = requested ?? process.env.URBE_BROWSER;
  const onPath = name => ( process.env.PATH ?? '' ).split( delimiter ).map( dir => join( dir, name ) ).find( existsSync );
  const found = named ? ( existsSync( named ) ? named : onPath( named ) )
    : BROWSERS.map( name => name.includes( '/' ) ? ( existsSync( name ) ? name : null ) : onPath( name ) ).find( Boolean );
  if ( ! found ) throw new Error( named ? `no browser at ${named}` : 'no Chromium-family browser found; pass --browser or set URBE_BROWSER' );
  return found;
}
function within( promise, milliseconds ) {
  let timer;
  return Promise.race( [ promise, new Promise( ( _, reject ) => { timer = setTimeout( () => reject( new Error( `No browser response within ${milliseconds} ms` ) ), milliseconds ); } ) ] ).finally( () => clearTimeout( timer ) );
}
/** One headless browser on a throwaway profile, driven over its DevTools pipe. */
export class Browser {

	constructor( binary = browserPath() ) {

		this.profile = mkdtempSync( join( tmpdir(), 'urbe-play-probe-profile-' ) );
		// Its own process group, so closing takes every helper process with it.
		this.child = spawn( binary, [ ...FLAGS, `--user-data-dir=${this.profile}`, 'about:blank' ], {
			detached: true, stdio: [ 'ignore', 'ignore', 'pipe', 'pipe', 'pipe' ]
		} );
		this.cdp = new Cdp( this.child.stdio[ 3 ], this.child.stdio[ 4 ] );
		this.page = null;
		let tail = '';
		this.child.stderr.on( 'data', ( chunk ) => { tail = ( tail + chunk ).slice( - 2000 ); } );
		this.child.on( 'error', ( error ) => { tail += error.message; } );
		/** Settles once the browser answers, with `version` set. */
		this.started = within( this.cdp.send( 'Browser.getVersion' ), 30000 ).then(
			( { product } ) => { this.version = product; },
			( error ) => { throw new Error( `${binary} did not start: ${error.message}${tail && `\n${tail.trim()}`}` ); }
		);

	}

	/** A new tab with its runtime, page, network and request screening attached. */
	async open() {

		const { targetId } = await this.cdp.send( 'Target.createTarget', { url: 'about:blank' } );
		const { sessionId } = await this.cdp.send( 'Target.attachToTarget', { targetId, flatten: true } );
		const page = this.page = new Page( this.cdp, sessionId );
		await Promise.all( [ 'Runtime.enable', 'Page.enable', 'Network.enable' ].map( ( method ) => page.send( method ) ) );
		await page.send( 'Fetch.enable', { patterns: [ { urlPattern: '*', requestStage: 'Request' } ] } );

		return page;

	}

	async close() {

		const exited = new Promise( ( done ) => this.child.exitCode === null && this.child.signalCode === null ? this.child.once( 'exit', done ) : done() );
		await this.cdp.send( 'Browser.close' ).catch( () => {} );
		await Promise.race( [ exited, sleep( 5000 ) ] );
		this.kill();

	}

	kill() {

		try {

			process.kill( - this.child.pid, 'SIGKILL' );

		} catch {

			// The group already ended.

		}
		try {

			rmSync( this.profile, { recursive: true, force: true, maxRetries: 3 } );

		} catch ( error ) {

			console.error( `play-probe: could not remove ${this.profile}: ${error.message}` );

		}

	}

}

/** One attached tab. */
class Page {

	constructor( cdp, sessionId ) {

		this.cdp = cdp;
		this.sessionId = sessionId;

	}

	send( method, params = {} ) {

		return this.cdp.send( method, params, this.sessionId );

	}

	on( method, listener ) {

		this.cdp.on( method, ( params, sessionId ) => {

			if ( sessionId === this.sessionId ) ( async () => listener( params ) )().catch( ( error ) => console.error( `${method}: ${error.message}` ) );

		} );

	}

	async navigate( url ) {

		const loaded = new Promise( ( done, failed ) => {

			const timer = setTimeout( () => failed( new Error( `${url} did not load within 120 s` ) ), 120000 );
			this.on( 'Page.loadEventFired', () => { clearTimeout( timer ); done(); } );

		} );
		const { errorText } = await this.send( 'Page.navigate', { url } );
		if ( errorText ) throw new Error( `${url}: ${errorText}` );
		await loaded;

	}

	/** The expression's value, once its promise settles within `ms`. */
	async evaluate( expression, ms = PAGE_MS ) {

		const { result, exceptionDetails } = await within( this.send( 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true } ), ms );
		if ( exceptionDetails ) throw new Error( String( exceptionDetails.exception?.description ?? exceptionDetails.text ).split( '\n' )[ 0 ] );

		return result.value;

	}

	async screenshot( path ) {

		const { data } = await within( this.send( 'Page.captureScreenshot', { format: 'png' } ), PAGE_MS );
		writeFileSync( path, Buffer.from( data, 'base64' ) );

	}

}

/** The DevTools protocol over the browser's pipe, one NUL-ended JSON message each way, with flat sessions per tab. */
class Cdp {

	/** `input` is the browser's command pipe, `output` its message pipe. */
	constructor( input, output ) {

		this.input = input;
		this.open = true;
		this.next = 0;
		this.calls = new Map();
		this.listeners = new Map();
		let pending = [];
		output.setEncoding( 'utf8' );
		// A chunk continues the pending message; each NUL ends one and starts the next.
		output.on( 'data', ( chunk ) => {

			const [ more, ...next ] = chunk.split( '\0' );
			pending.push( more );
			for ( const part of next ) {

				this.#receive( JSON.parse( pending.join( '' ) ) );
				pending = [ part ];

			}

		} );
		const closed = () => {

			this.open = false;
			for ( const { failed, method } of this.calls.values() ) failed( new Error( `${method}: the browser closed` ) );
			this.calls.clear();

		};
		output.on( 'close', closed );
		output.on( 'error', closed );
		input.on( 'error', closed );

	}

	send( method, params = {}, sessionId = undefined ) {

		if ( ! this.open ) return Promise.reject( new Error( `${method}: the browser closed` ) );

		return new Promise( ( done, failed ) => {

			const id = ++ this.next;
			this.calls.set( id, { done, failed, method } );
			this.input.write( `${JSON.stringify( { id, method, params, ...( sessionId ? { sessionId } : {} ) } )}\0` );

		} );

	}

	on( method, listener ) {

		this.listeners.set( method, [ ...( this.listeners.get( method ) ?? [] ), listener ] );

	}

	#receive( message ) {

		if ( message.id === undefined ) {

			for ( const listener of this.listeners.get( message.method ) ?? [] ) listener( message.params, message.sessionId );
			return;

		}
		const call = this.calls.get( message.id );
		this.calls.delete( message.id );
		if ( message.error ) call?.failed( new Error( `${call.method}: ${message.error.message}` ) );
		else call?.done( message.result );

	}

}

