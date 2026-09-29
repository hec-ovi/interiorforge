import { expect, it } from 'vitest';
import { planDuplexSection } from '../src/layout/duplex/section.js';
import { planDuplexProgram } from '../src/layout/duplex/program.js';
import { furnishDuplexProgram } from '../src/layout/duplex/furnish.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import { furnitureUvRect } from '../src/layout/navgrid.js';
import { duplexRoutes } from '../src/layout/duplex/routes.js';

it.each(Array.from({ length: 10 }, (_, i) => `duplex-1702-${i}`))('furnishes the complete private two-level program at native model sizes for %s', seed => {
  const section = planDuplexSection({ pitch: 3.2 }), program = planDuplexProgram(section);
  const furniture = furnishDuplexProgram(program, section, seed);
  expect(furniture.lower.filter(piece => piece.kind === 'bed_double')).toHaveLength(1);
  expect(furniture.upper.filter(piece => piece.kind === 'bed_double')).toHaveLength(1);
  expect(furniture.lower.filter(piece => piece.kind === 'shower')).toHaveLength(1);
  expect(furniture.upper.filter(piece => piece.kind === 'shower')).toHaveLength(1);
  for (const level of ['lower', 'upper'] as const) for (const piece of furniture[level]) {
    const room = program[level].find(room => room.id === piece.room)!;
    expect(roomCoversRect(room, furnitureUvRect(piece)), `${piece.id} ${piece.kind} remains in ${room.id}`).toBe(true);
  }
  expect(duplexRoutes(program, section, furniture).failures).toEqual([]);
});
