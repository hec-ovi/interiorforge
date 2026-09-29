import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import plan from './fixture-data/templates/plan-fixture.json' with { type: 'json' };
import { classify, compilePlan } from '../src/layout/templates/compile.js';
import type { SpaceTemplate, TemplateFixture } from '../src/layout/templates/schema.js';

const compiled = (): SpaceTemplate => compilePlan(plan, undefined, 'e1-apartment');
const span = (t: SpaceTemplate, from: string, to: string) => t.spans.find(s => s.from === from && s.to === to)!;
const room = (t: SpaceTemplate, id: string) => t.rooms.find(r => r.id === id)!;
const fixture = (t: SpaceTemplate, id: string): TemplateFixture => t.fixtures.find(f => f.id === id)!;

describe('plan.json -> SpaceTemplate compiler', () => {
  it('frames the plan at the entry wall and names lines in ascending order', () => {
    const t = compiled();
    expect(t.id).toBe('e1-apartment');
    expect(t.scope).toBe('dwelling');
    expect(t.style).toBe('e1');
    expect(t.use).toEqual({ floorKinds: ['apartment', 'hotel_rooms'], kinds: ['A'] });
    const u = t.lines.filter(l => l.axis === 'u'), v = t.lines.filter(l => l.axis === 'v');
    expect(u.map(l => [l.id, l.ref])).toEqual([['u0', 0], ['u1', 4.5], ['u2', 5.5], ['u3', 8]]);
    expect(v.map(l => [l.id, l.ref])).toEqual([['v0', 0], ['v1', 2.4], ['v2', 6], ['v3', 10]]);
    expect(t.envelope).toEqual({ width: 8, depth: 10, min: [5.6, 7], max: [20, 25] });
    // off-grid and confirmed by a confident dimension
    expect(v.find(l => l.id === 'v1')!.exact).toBe(true);
    expect(u.some(l => l.exact)).toBe(false);
    // the bedroom partition meets the daylight wall
    expect(t.daylight).toEqual(['v1']);
    expect(u.find(l => l.id === 'u1')!.facade).toBe(true);
    expect(u.filter(l => l.facade).map(l => l.id)).toEqual(['u1']);
  });

  it('classifies spans: service rigid, bedroom bounded, living flexible and unbounded', () => {
    const t = compiled();
    expect(t.spans).toHaveLength(6);
    expect(span(t, 'u2', 'u3')).toEqual({ from: 'u2', to: 'u3', min: 2.5, max: 2.5, weight: 0 });
    expect(span(t, 'v0', 'v1')).toEqual({ from: 'v0', to: 'v1', min: 2.4, max: 2.4, weight: 0 });
    expect(span(t, 'u0', 'u1')).toEqual({ from: 'u0', to: 'u1', min: 3.6, max: 6.3, weight: 2.25 });
    expect(span(t, 'v2', 'v3')).toEqual({ from: 'v2', to: 'v3', min: 3.2, max: 5.6, weight: 2 });
    expect(span(t, 'u1', 'u2')).toEqual({ from: 'u1', to: 'u2', min: 0.8, max: null, weight: 1 });
    expect(span(t, 'v1', 'v2')).toEqual({ from: 'v1', to: 'v2', min: 2.88, max: null, weight: 3.6 });
  });

  it('maps room names to kinds and roles with exactly one remainder, open kitchens joining the living', () => {
    const t = compiled();
    expect(t.rooms.map(r => r.id)).toEqual(['living', 'bath', 'bed']);
    expect(room(t, 'living')).toMatchObject({ kind: 'living', role: 'living', remainder: true, ceiling: 3 });
    expect(room(t, 'living').u).toBeUndefined();
    expect(room(t, 'bath')).toMatchObject({ kind: 'bathroom', role: 'bath', u: ['u2', 'u3'], v: ['v0', 'v1'], ceiling: 2.6 });
    expect(room(t, 'bed')).toMatchObject({ kind: 'bedroom', role: 'bedroom', u: ['u0', 'u1'], v: ['v2', 'v3'] });
    expect(t.rooms.filter(r => r.remainder)).toHaveLength(1);
    // a level change up to 1.5 m is a zone; deeper ones are two-level templates, not zones
    expect(room(t, 'living').levels).toEqual([{ u: ['u0', 'u3'], v: ['v0', 'v3'], delta: 0.3, edge: 'step' }]);
    expect(room(t, 'bed').levels).toBeUndefined();
  });

  it('turns openings into doors with the public entry nearest the entry wall', () => {
    const t = compiled();
    expect(t.entry).toEqual({ room: 'living', door: 'entry' });
    const byId = new Map(t.doors.map(d => [d.id, d]));
    expect([...byId.keys()].sort()).toEqual(['bed-living', 'entry', 'living-bath']);
    expect(byId.get('entry')).toEqual({ id: 'entry', between: ['living', '@public'], width: 1, leaves: 1, kind: 'swing', along: 0.36, owner: 'living' });
    expect(byId.get('living-bath')).toMatchObject({ between: ['living', 'bath'], kind: 'pocket', leaves: 1, along: 0.5, width: 0.9 });
    expect(byId.get('bed-living')).toMatchObject({ between: ['bed', 'living'], kind: 'swing', along: 0.25, owner: 'bed' });
    for (const door of t.doors) expect(door.along).toBeGreaterThanOrEqual(0.05), expect(door.along).toBeLessThanOrEqual(0.95);
  });

  it('maps fixtures onto walls and lines, built-ins stretching along their wall', () => {
    const t = compiled();
    expect(t.fixtures.map(f => f.id)).toEqual(['bed', 'kitchen', 'sofa', 'toilet']);
    expect(fixture(t, 'bed')).toEqual({ id: 'bed', room: 'bed', kind: 'bed_double', required: true, wall: 'v1',
      along: { line: 'u0', offset: 1.1 }, size: [1.8, 2.1, 0.5], rotationDeg: 180 });
    expect(fixture(t, 'kitchen')).toEqual({ id: 'kitchen', room: 'living', kind: 'kitchen_block', fit: 'asm-e1-kitchen',
      required: true, wall: 'u1', along: { line: 'v2', offset: 1.4 }, size: [2.6, 0.6, 0.9], rotationDeg: 270, stretch: ['v'] });
    expect(fixture(t, 'sofa')).toMatchObject({ kind: 'sofa', required: false, wall: 'free', along: { centred: true }, at: [2, 4], rotationDeg: 0 });
    expect(fixture(t, 'toilet')).toMatchObject({ room: 'bath', kind: 'toilet', required: true, wall: 'u1', rotationDeg: 270 });
  });

  it('strips images, notes, unknowns, confidences and the detail block', () => {
    const text = JSON.stringify(compiled());
    for (const banned of ['"images"', '"notes"', '"unknowns"', '"confidence"', '"detail"', '"summary"', '"walkthrough"',
      'view-0', 'placeholder', 'r-living', 'o-entry', 'x-bed']) expect(text).not.toContain(banned);
    expect(compiled().source).toEqual({ key: 'e1-apartment', revision: 'plan-1' });
  });

  it('merges a hand overlay by id and span ends', () => {
    const t = compilePlan(plan, {
      id: 'e1-apartment',
      mirror: 'never',
      envelope: { min: [5, 6] },
      rooms: [{ id: 'bath', minClear: [2.2, 2.2] }, { id: 'study', kind: 'office_private', u: ['u1', 'u2'], v: ['v1', 'v2'] }],
      spans: [{ from: 'u2', to: 'u3', min: 2.4 }],
      fixtures: [{ id: 'sofa', $remove: true }, { id: 'kitchen', stretch: ['v', 'u'] }],
      notes: 'hand decision placeholder',
    });
    expect(t.mirror).toBe('never');
    expect(t.envelope).toEqual({ width: 8, depth: 10, min: [5, 6], max: [20, 25] });
    expect(room(t, 'bath')).toMatchObject({ kind: 'bathroom', role: 'bath', minClear: [2.2, 2.2], u: ['u2', 'u3'] });
    expect(room(t, 'study')).toEqual({ id: 'study', kind: 'office_private', u: ['u1', 'u2'], v: ['v1', 'v2'] });
    expect(span(t, 'u2', 'u3')).toEqual({ from: 'u2', to: 'u3', min: 2.4, max: 2.5, weight: 0 });
    expect(t.fixtures.map(f => f.id)).toEqual(['bed', 'kitchen', 'toilet']);
    expect(fixture(t, 'kitchen').stretch).toEqual(['v', 'u']);
    const text = JSON.stringify(t);
    expect(text).not.toContain('$remove');
    expect(text).not.toContain('placeholder');
  });

  it('takes the key from the overlay and refuses a plan without one', () => {
    expect(compilePlan(plan, { id: 'c7-room' }).use).toEqual({ floorKinds: ['apartment', 'residence_studio'], kinds: ['C'] });
    expect(() => compilePlan(plan)).toThrow(/key/);
    const r1 = compilePlan(plan, undefined, 'r1-office');
    expect(r1.scope).toBe('public');
    expect(r1.use.slot).toBe('hall');
  });

  it('classifies the reference room vocabulary', () => {
    expect(classify('Lift lobby', 'public').kind).toBe('elevator_lobby');
    expect(classify('Public restroom', 'public').kind).toBe('toilets');
    expect(classify('Machine room', 'public').kind).toBe('mechanical_room');
    expect(classify('Raised bar', 'dwelling')).toEqual({ kind: 'living', role: 'bar' });
    expect(classify('Entry foyer', 'dwelling')).toEqual({ kind: 'living', role: 'foyer' });
    expect(classify('Walk-in wardrobe', 'dwelling')).toEqual({ kind: 'storage', role: 'dressing' });
    expect(classify('Study', 'dwelling')).toEqual({ kind: 'office_private', role: 'study' });
    expect(classify('Executive office', 'public').kind).toBe('executive_office');
    expect(classify('Terrace', 'public').kind).toBe('terrace_open');
    expect(classify('Gallery corridor', 'public').kind).toBe('corridor');
    expect(classify('Lounge', 'public').kind).toBe('lounge');
  });
});

describe('committed template data', () => {
  const dir = new URL('../src/layout/templates/data/', import.meta.url);
  it('carries dimensions only: no image ids, notes or home paths', () => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).filter(file => file.endsWith('.json'))) {
      const text = readFileSync(new URL(name, dir), 'utf8');
      for (const banned of ['"images"', '"notes"', '.jpg', '/home/']) expect(text, `${name} holds ${banned}`).not.toContain(banned);
    }
  });
});
