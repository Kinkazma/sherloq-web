import type {CloneEntry,Polygon} from './clone-relations.js';
export interface CorroborationRequest {width:number;height:number;entries:CloneEntry[];excluded?:Polygon[];byContext?:boolean;stripRows?:number}
export interface CountPlane {width:number;height:number;values:Uint32Array}
export interface CorroborationHooks {signal?:AbortSignal;onProgress?:(fraction:number)=>void}
export interface SharedCompositionBudget {limit:number;total():number;reserve(bytes:number):()=>void}
export const COUNT_COLORS:readonly (readonly number[])[];
export function createCloneCorroboration(options:{budget:SharedCompositionBudget;wasmBinary?:Uint8Array}):{
 counts(request:CorroborationRequest,hooks?:CorroborationHooks):Promise<CountPlane&{release():void}>;
 stripes(request:CorroborationRequest,consume:(stripe:CountPlane&{top:number})=>void|Promise<void>,hooks?:CorroborationHooks):Promise<void>;
 uniqueEnvelopes(entries:CloneEntry[],options?:{threshold?:number;signal?:AbortSignal}):Promise<CloneEntry[]>;
 dispose():void;
};
export function colorizeCounts(plane:CountPlane,options?:{image?:{width:number;height:number;format:'rgb8';data:Uint8Array}|null;opacity?:number}):{width:number;height:number;format:'rgb8';data:Uint8Array};
