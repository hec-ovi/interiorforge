import { describe, expect, it } from 'vitest';
import type { EdgeName, PlanRoom } from '../src/layout/plan-types.js';
import { idGen } from '../src/layout/rooms.js';
import { roomArea, sharedRoomEdges } from '../src/layout/room-shape.js';
import { uvRectCorners, type UvRect } from '../src/layout/uv.js';
import { fitTemplate } from '../src/layout/templates/fit.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import type { SpaceTemplate, TemplateTarget } from '../src/layout/templates/schema.js';
import { TEMPLATE_KEYS } from '../src/layout/templates/schema.js';

const corridorFor = (rect: UvRect, entry: EdgeName): PlanRoom => {
  const r = entry === 'v0' ? { u: rect.u - 4, v: rect.v - 3, lu: rect.lu + 8, lv: 3 }
    : entry === 'v1' ? { u: rect.u - 4, v: rect.v + rect.lv, lu: rect.lu + 8, lv: 3 }
    : entry === 'u0' ? { u: rect.u - 3, v: rect.v - 4, lu: 3, lv: rect.lv + 8 }
    : { u: rect.u + rect.lu, v: rect.v - 4, lu: 3, lv: rect.lv + 8 };
  return { id: 'corridor', kind: 'corridor', rect: r, polygon: uvRectCorners(r), doors: [] };
};
const opposite: Record<EdgeName, EdgeName> = { v0: 'v1', v1: 'v0', u0: 'u1', u1: 'u0' };

function target(rect: UvRect, entry: EdgeName = 'v0', seat: (p: [number, number]) => boolean = () => true): TemplateTarget {
  return { rect, polygon: uvRectCorners(rect), entryEdge: entry, publicRoom: corridorFor(rect, entry),
    facadeEdges: [opposite[entry]], seatLegal: seat, gridOrigin: [0, 0] };
}

const e1 = TEMPLATES.get('e1-apartment')!;
const dwellings = [...TEMPLATES.values()].filter(t => t.scope === 'dwelling' && !t.twoLevel);

describe('template fitting', () => {
  it('ships a well-formed template for every key', () => {
    expect([...TEMPLATES.keys()].sort()).toEqual([...TEMPLATE_KEYS].sort());
    for (const t of TEMPLATES.values()) {
      expect(t.version, t.id).toBe(1);
      expect(t.rooms.filter(room => room.remainder && room.level !== 'upper'), t.id).toHaveLength(1);
      expect(t.envelope.min[0], t.id).toBeLessThanOrEqual(t.envelope.width);
      expect(t.envelope.max[1], t.id).toBeGreaterThanOrEqual(t.envelope.depth);
      if (t.scope === 'dwelling') {
        expect(t.entry, t.id).not.toBeNull();
        expect(t.daylight, t.id).toContain('v1');
        expect(t.fixtures.some(f => f.required), t.id).toBe(true);
      }
      for (const room of t.rooms) {
        expect(room.id, t.id).toMatch(/^[a-z0-9-]+$/);
        if (room.role) expect(room.role, t.id).toMatch(/^[a-z0-9-]+$/);
      }
      for (const fixture of t.fixtures) if (fixture.fit) expect(fixture.fit, t.id).toMatch(/^(asm|fit)-[a-z0-9-]+$/);
      for (const axis of ['u', 'v'] as const) {
        const lines = t.lines.filter(line => line.axis === axis).sort((a, b) => a.ref - b.ref);
        expect(lines[0]!.ref, t.id).toBe(0);
        for (let i = 0; i + 1 < lines.length; i++)
          expect(t.spans.some(span => span.from === lines[i]!.id && span.to === lines[i + 1]!.id), `${t.id} ${lines[i]!.id}`).toBe(true);
      }
    }
  });

  it('keeps every reference dimension when the target is the reference envelope', () => {
    for (const t of dwellings) {
      const fit = fitTemplate(t, target({ u: 0, v: 0, lu: t.envelope.width, lv: t.envelope.depth }), 'unit', idGen(1), () => true);
      expect(fit, t.id).not.toBeNull();
      expect(fit!.exact, t.id).toBe(true);
      expect(fit!.changes, t.id).toEqual([]);
      expect(fit!.dropped, t.id).toEqual([]);
    }
  });

  it('still fits every dwelling template at its declared minimum envelope', () => {
    for (const t of dwellings) {
      const fit = fitTemplate(t, target({ u: 0, v: 0, lu: t.envelope.min[0], lv: t.envelope.min[1] }), 'unit', idGen(1), () => true);
      expect(fit, t.id).not.toBeNull();
    }
  });

  it('keeps rigid rooms exact in a larger target and grows the living', () => {
    const fit = fitTemplate(e1, target({ u: 0, v: 0, lu: 19, lv: 12 }), 'unit', idGen(1), () => true)!;
    expect(fit).not.toBeNull();
    const bath = fit.rooms.find(room => room.template === 'e1-apartment/bath')!;
    const spec = e1.rooms.find(room => room.id === 'bath')!;
    const ref = (id: string) => e1.lines.find(line => line.id === id)!.ref;
    expect(bath.rect.lu).toBeCloseTo(ref(spec.u![1]) - ref(spec.u![0]), 6);
    const living = fit.rooms.find(room => room.template === 'e1-apartment/living')!;
    expect(roomArea(living)).toBeGreaterThan(80);
  });

  it('opens exactly one public door with room for both pocket cassettes', () => {
    for (const entry of ['v0', 'v1', 'u0', 'u1'] as EdgeName[]) for (const t of dwellings) {
      const tg = target({ u: 3, v: -2, lu: t.envelope.width, lv: t.envelope.depth }, entry);
      if (entry.startsWith('u')) tg.rect = { u: 3, v: -2, lu: t.envelope.depth, lv: t.envelope.width };
      tg.polygon = uvRectCorners(tg.rect);
      tg.publicRoom = corridorFor(tg.rect, entry);
      const fit = fitTemplate(t, tg, 'unit', idGen(1), () => true);
      expect(fit, `${t.id} ${entry}`).not.toBeNull();
      const doors = fit!.rooms.flatMap(room => room.doors.filter(door => door.to === 'corridor').map(door => ({ room, door })));
      expect(doors, `${t.id} ${entry}`).toHaveLength(1);
      const { room, door } = doors[0]!;
      expect(door.edge).toBe(entry);
      const stretch = sharedRoomEdges(room, tg.publicRoom).find(s => s.edge === entry)!;
      expect(door.at - door.width - 0.25).toBeGreaterThanOrEqual(stretch.lo - 1e-6);
      expect(door.at + door.width + 0.25).toBeLessThanOrEqual(stretch.hi + 1e-6);
      // one unit id, all rooms inside the target, areas add up
      expect(new Set(fit!.rooms.map(item => item.unit))).toEqual(new Set(['unit']));
      const total = fit!.rooms.reduce((sum, item) => sum + roomArea(item), 0);
      expect(total).toBeCloseTo(tg.rect.lu * tg.rect.lv, 3);
    }
  });

  it('scales toward the minimums, then drops optional rooms, then refuses', () => {
    const [mw, md] = e1.envelope.min;
    const small = fitTemplate(e1, target({ u: 0, v: 0, lu: mw + 0.3, lv: md + 0.3 }), 'unit', idGen(1), () => true);
    expect(small).not.toBeNull();
    expect(small!.exact).toBe(false);
    expect(small!.changes.length).toBeGreaterThan(0);
    for (const change of small!.changes) expect(change.requested).toHaveLength(2);
    expect(fitTemplate(e1, target({ u: 0, v: 0, lu: mw - 1, lv: md }), 'unit', idGen(1), () => true)).toBeNull();
  });

  it('moves a facade partition onto a legal seat and refuses when there is none', () => {
    const rect = { u: 0, v: 0, lu: e1.envelope.width, lv: e1.envelope.depth };
    const legal = (p: [number, number]) => Math.abs(p[1] - rect.lv) > 1e-6 || Math.abs(((p[0] + 0.25) % 1.5) - 0.75) < 0.2;
    const fit = fitTemplate(e1, target(rect, 'v0', legal), 'unit', idGen(1), () => true);
    expect(fit).not.toBeNull();
    const far = fit!.rooms.filter(room => room.rect.v + room.rect.lv > rect.lv - 1e-6 && room.template !== 'e1-apartment/living');
    for (const room of far) for (const u of [room.rect.u, room.rect.u + room.rect.lu]) {
      if (u > 1e-6 && u < rect.lu - 1e-6) expect(legal([u, rect.lv]), `${room.template} at ${u}`).toBe(true);
    }
    expect(fitTemplate(e1, target(rect, 'v0', p => Math.abs(p[1] - rect.lv) > 1e-6), 'unit', idGen(1), () => true)).toBeNull();
  });

  it('rejects a candidate the probe cannot furnish and never throws on a broken template', () => {
    expect(fitTemplate(e1, target({ u: 0, v: 0, lu: 15, lv: 10 }), 'unit', idGen(1), () => false)).toBeNull();
    const broken = { ...e1, rooms: e1.rooms.filter(room => !room.remainder) } as SpaceTemplate;
    expect(fitTemplate(broken, target({ u: 0, v: 0, lu: 15, lv: 10 }), 'unit', idGen(1), () => true)).toBeNull();
  });

  it('turns required fixtures into authored pieces inside their rooms', () => {
    const fit = fitTemplate(e1, target({ u: 0, v: 0, lu: 15, lv: 10 }, 'u1'), 'unit', idGen(1), () => true)
      ?? fitTemplate(e1, { ...target({ u: 0, v: 0, lu: 10, lv: 15 }, 'u1') }, 'unit', idGen(1), () => true);
    expect(fit).not.toBeNull();
    const bed = fit!.rooms.find(room => room.kind === 'bedroom')!;
    const piece = bed.authored!.find(item => item.kind === 'bed_double')!;
    expect(piece.required).toBe(true);
    expect(piece.at[0]).toBeGreaterThan(bed.rect.u);
    expect(piece.at[0]).toBeLessThan(bed.rect.u + bed.rect.lu);
    expect(piece.at[1]).toBeGreaterThan(bed.rect.v);
    expect(piece.at[1]).toBeLessThan(bed.rect.v + bed.rect.lv);
  });
});
