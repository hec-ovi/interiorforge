import type { PlacementBuilder } from '../../placements/builder.js';
import { uvToWorld, type Frame, type UvRect } from '../../layout/uv.js';

/** Service geometry is kept inside one room rectangle and above 2.1m headroom.
 * Only straight trunks stretch; couplings and hangers keep authored dimensions. */
export function placeIndustrialServices(builder: PlacementBuilder, room: string, rect: UvRect, ceilingY: number, frame: Frame): void {
  const alongU = rect.lu >= rect.lv, length = alongU ? rect.lu : rect.lv;
  if (length < 2 || Math.min(rect.lu, rect.lv) < .5 || ceilingY < 2.38) return;
  const dense = Math.min(rect.lu,rect.lv) >= 1.1;
  const pipeOffset = dense ? .2 : .1;
  const angle = -frame.angleDeg * Math.PI / 180 + (alongU ? 0 : -Math.PI / 2);
  const at = (offset: number): [number, number, number] => {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2 + (alongU ? offset : 0), rect.v + rect.lv / 2 + (alongU ? 0 : offset)], frame);
    return [x, ceilingY, z];
  };
  builder.module(dense ? 'ceiling-services-industrial-bank' : 'ceiling-services-industrial', room, at(0), [length / .5, 1, 1], angle);
  const count = Math.max(2, Math.ceil((length - .4) / 2.4) + 1);
  for (let i = 0; i < count; i++) builder.module(dense ? 'ceiling-services-industrial-bank-support' : 'ceiling-services-industrial-support', room,
    at(-length / 2 + .2 + (length - .4) * i / (count - 1)), [1, 1, 1], angle);
  const joints = Math.floor((length - .4) / 3);
  for (let i = 1; i <= joints; i++) builder.module(dense ? 'ceiling-services-industrial-bank-coupling' : 'ceiling-services-industrial-coupling', room,
    at(-length / 2 + length * i / (joints + 1)), [1, 1, 1], angle);
  if(dense)for(let t=-length/2+.25;t<=length/2-.25+1e-6;t+=.5)
    builder.module('ceiling-services-industrial-tray-rungs',room,at(t),[1,1,1],angle);
  // Coherent branch feeds from the main trunk to ceiling service terminals.
  // Compact rooms keep one route; larger halls gain bays without service clutter
  // repeated at the construction grid pitch.
  const cross = Math.min(rect.lu, rect.lv);
  if (cross >= 5 && length >= 7) {
    const bays = Math.min(6, Math.floor(length / 5));
    for (let i=0;i<bays;i++) {
      const offset=-length/2+length*(i+.5)/bays, side=i%2?1:-1;
      const reach=cross/2-.35+side*pipeOffset, p=at(offset), angleBranch=angle+(side>0?-Math.PI/2:Math.PI/2);
      // The large pipe has its own offset from the tray centre. Start feeds
      // on that pipe axis, so neither side leaves a floating disconnected end.
      p[0] -= Math.sin(angle)*pipeOffset; p[2] -= Math.cos(angle)*pipeOffset;
      if(dense)p[1]+=.03; // large service bank main-axis height is -0.12m
      // Local +X transformed by the same convention as PlacementBuilder.
      const dx=Math.cos(angleBranch), dz=-Math.sin(angleBranch);
      builder.module('ceiling-services-industrial-branch',room,[p[0]+dx*reach/2,p[1],p[2]+dz*reach/2],[reach/.5,1,1],angleBranch);
      builder.module('ceiling-services-industrial-terminal',room,[p[0]+dx*reach,p[1],p[2]+dz*reach],[1,1,1],angleBranch);
    }
  }

}
