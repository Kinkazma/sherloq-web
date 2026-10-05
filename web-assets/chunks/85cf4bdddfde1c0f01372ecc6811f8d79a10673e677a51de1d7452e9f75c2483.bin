export type Polygon = [number,number][];
export interface CloneEntry {
 id:string; source:string; polygons:Polygon[]; search_context?:string;
 provenance?:{search_region?:Polygon;search_context?:string;[key:string]:unknown};
 pixel_mask?:{width:number;height:number;data:Uint8Array};origin?:[number,number];
 relation?:'within'|'between'|'unassigned';endpoint_zones?:(number|null)[];
 biome_fill_alpha?:number[];member_ids?:string[];corroborating_sources?:string[];
 [key:string]:unknown;
}
export interface CloneViewOptions {source?:string|null;hidden?:string[];focused?:string|null;relation?:'within'|'between'|'all';enabledSources?:readonly string[];presentation?:'biomes'|'map'|'overlay'}
export const CLONE_SOURCES:readonly string[];
export const CLASSICAL_SOURCES:readonly string[];
export const AI_SOURCES:readonly string[];
export const ELA_SOURCE:'ELA biomes';
export function polygonRing(polygon:Polygon):Polygon;
export function polygonKey(polygon:Polygon):string;
export function annotateRelations(entries:CloneEntry[],scope:{regions?:Polygon[];envelope?:Polygon|null;width:number;height:number}):CloneEntry[];
export function pairRelations(input:{points:number[][];pairs:number[][];regions?:Polygon[]}):[number,number][];
export function visibleCloneEntries(entries:CloneEntry[],options?:CloneViewOptions):CloneEntry[];
export function biomePaintOrder(entries:CloneEntry[]):CloneEntry[];
