import { fitAssetBounds, loadAssetCatalog } from '../../assets/catalog.js';
import type { ModelPresence } from '../../assets/families.js';
import type { AssetEntry } from '../../assets/types.js';
import type { Furniture, FurnitureKind, RoomKind } from '../../core/types.js';
import { clean, type PlacementBuilder } from '../../placements/builder.js';
import { LUXURY_PLANT_FRAMES } from './accessories.js';

export const LUXURY_PLANT_ASSET = 'polyhaven-potted-plant-02';
const assets = new Map(loadAssetCatalog().assets.map(asset => [asset.id, asset]));
const preferred: Record<string, string> = {
  office_chair: 'sketchfab-office-chair',
  desk: 'sketchfab-elegant-black-office-desk',
};

/** Exact reviewed source models, only when available and the existing reservation
 * accepts their natural proportions. Other families keep their original selection. */
export function luxuryCatalogAsset(item: Furniture, models: ModelPresence): AssetEntry | null {
  const id = preferred[item.kind], asset = id ? assets.get(id) : undefined;
  return asset && models.present.has(asset.id) && !item.elevation && fitAssetBounds(asset, item.size) ? asset : null;
}

/** Existing room role selects storage equipment versus a residential bookcase. */
export function luxuryRoomFit(kind: FurnitureKind, room?: RoomKind, size?: [number, number, number]): { module: string; size: [number, number, number] } | null {
  if(kind==='sofa'&&(room==='living'||room==='studio_main'))return{module:'fit-sofa-corpo',size:[2.8,1,.9]};
  if(kind==='chair'&&(room==='living'||room==='studio_main'||room==='kitchen'))return{module:'fit-chair-corpo',size:[.75,.8,.9]};
  if(kind==='low_table'&&(room==='bedroom'||room==='studio_main')&&size&&size[0]<.8&&size[1]<.8)return{module:'fit-bedside-corpo',size:[.55,.6,.4]};
  if(kind==='counter'&&(room==='living'||room==='studio_main'))return{module:'fit-media-corpo',size:[3,.45,.65]};
  if(kind==='shelf'&&room==='kitchen')return{module:'fit-pantry-corpo',size:[1.8,.5,2]};
  if (kind !== 'shelf') return null;
  return { module: room === 'storage' || room === 'mechanical_room' ? 'fit-service-shelf-luxury' : 'fit-bookcase-luxury', size: [1.8, .5, 2] };
}

/** Source pots stand directly on the modeled stone surfaces. Uniform source scale
 * preserves leaf anatomy; rotations are half-turns so foliage stays in its reserve. */
export function placeLuxuryPlants(builder: PlacementBuilder, item: Furniture, models: ModelPresence): boolean {
  if(item.kind==='room_divider'||item.kind==='ornament_wall'){
    const tall=item.size[2]>2.3,wall=item.kind==='ornament_wall';
    const canonical:[number,number,number]=tall?[3,wall ? .75 : .55,2.7]:[wall?3:2.5,.5,2];
    const module=tall?(wall?'fit-botanical-display-biotechnica':'fit-botanical-screen-biotechnica'):(wall?'fit-bamboo-wall-corpo':'fit-bamboo-screen-corpo');
    builder.module(module,item.room,[item.position[0],item.elevation??0,item.position[1]],[item.size[0]/canonical[0],item.size[2]/canonical[2],item.size[1]/canonical[1]],item.rotationDeg*Math.PI/180,{id:item.id});
    return true;
  }
  const spec = LUXURY_PLANT_FRAMES[item.kind as keyof typeof LUXURY_PLANT_FRAMES];
  const asset = assets.get(LUXURY_PLANT_ASSET);
  if (!spec || !asset?.dimensionsMeters || !models.present.has(asset.id)) return false;
  const scale: [number, number, number] = [item.size[0] / spec.size[0], item.size[2] / spec.size[2], item.size[1] / spec.size[1]];
  const angle = item.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const baseY = item.elevation ?? 0;
  builder.module(spec.module, item.room, [item.position[0], baseY, item.position[1]], scale, angle, { id: item.id });
  const plantScale = .70 * Math.min(...scale);
  const [w, d, h] = asset.dimensionsMeters.map(v => v * plantScale) as [number, number, number];
  for (const [i, at] of spec.plants.entries()) {
    const x = at[0]! * scale[0], y = at[1]! * scale[1], z = at[2]! * scale[2];
    const position: [number, number, number] = [item.position[0] + x * c + z * s, baseY + y, item.position[1] + z * c - x * s];
    builder.placements.push({ id: `${item.id}/foliage-${i}`, room: item.room, prop: asset.id, position: position.map(clean) as [number, number, number],
      rotationY: clean(angle + (i % 2 ? Math.PI : 0)), scale: [plantScale, plantScale, plantScale] });
    builder.mesh.addPrism('prop/bounds/check', [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
      .map(([px, pz]) => [position[0] + px! * c + pz! * s, position[2] + pz! * c - px! * s]), position[1], position[1] + h);
  }
  return true;
}
