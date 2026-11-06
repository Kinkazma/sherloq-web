import type {Pixels,Surface} from './index.js';
import type {CloneEntry,Polygon} from './clone-relations.js';
import type {createAutomaticAnalysisView} from './automatic-analysis-view.js';
export interface AutomaticBudget {
 limit:number;active:number;retained:number;cacheBytes:number;peak:number;
 total():number;reserve(bytes:number):()=>void;retain(bytes:number):void;
 get(key:string):unknown;put(key:string,value:{byteLength:number},dependencies?:string[]):void;
 remove(key:string):void;clearPrefix(prefix:string):void;
 registerReclaimer(reclaim:(bytes:number)=>void):()=>void;snapshot():Record<string,number>;
}
export interface AutomaticHooks {checkpointKey?:string;signal?:AbortSignal;onProgress?:(event:Record<string,unknown>)=>void;onState?:(state:AutomaticState)=>void;onTemporarySession?:(session:Record<string,unknown>)=>void;}
export interface AutomaticState {states:Record<string,string>;errors:Record<string,{code:string;message:string}>;attempts:Record<string,number>;completed:string[];running:string[];resumable:string[];preflightExecutions:0;}
export interface AutomaticFilters {low?:number;high?:number;maximumOverlap?:number;d2Minimum?:number;elaThreshold?:number;elaMinimum?:number;energyThresholds?:[number,number];}
export interface AutomaticOwned {value:Record<string,unknown>;release():void|Promise<void>;}
export interface AutomaticFrame {entries:CloneEntry[];filters:AutomaticFilters;groups:Record<string,Record<string,unknown>>;release():Promise<void>;}
export interface AutomaticArchive {byteLength:number;sha256:string;store:{storage:string;readInto(output:Uint8Array,offset?:number):Promise<unknown>};dispose():Promise<void>;}
export interface AutomaticSource {
 pixels?:Pixels;
 surface?:{descriptor:Surface;readWindow(rect:{x:number;y:number;width:number;height:number},hooks?:AutomaticHooks):Promise<{pixels:Pixels;release():void}>};
 [key:string]:unknown;
}
export interface AutomaticEngines {
 dense?:{analyze(params:Record<string,unknown>,hooks:AutomaticHooks):Promise<Record<string,unknown>&{release():void}>};
 sparse?:{analyze(params:Record<string,unknown>,hooks:AutomaticHooks):Promise<Record<string,unknown>&{release():void}>};
 geometry?:{biomeSides:Function;pairedBiomes?:Function};
 forgeryscope?:{analyze(pixels:Pixels,params:Record<string,unknown>,hooks:AutomaticHooks):Promise<Record<string,unknown>&{release():void}>};
 d2prl?:{runOwned:Function;readRawOwned:Function};
}
export interface AutomaticAnalyzer {
 view:ReturnType<typeof createAutomaticAnalysisView>;plan:Record<string,unknown>;
 snapshot():AutomaticState;run(hooks?:AutomaticHooks):Promise<AutomaticState>;resume(request?:{groups?:string[]},hooks?:AutomaticHooks):Promise<AutomaticState>;cancel():void;
 prepare(filters?:AutomaticFilters,hooks?:AutomaticHooks):Promise<AutomaticFrame>;
 visible(frame:AutomaticFrame):CloneEntry[];
 acquireResults():{values:Record<string,Record<string,unknown>>;release():Promise<void>};
 export(options?:{filters?:AutomaticFilters;forgeryscopeBranch?:''|'microscopy'|'blots'|'lanes';elaEnergy?:boolean;elaLegacy?:boolean;elaProfile?:unknown;elaSettings?:unknown;provenance?:Record<string,unknown>},request?:{storage?:'auto'|'memory'|'temporary';maxBytes?:number},hooks?:AutomaticHooks):Promise<AutomaticArchive>;
 dispose():Promise<void>;
}
export function createAutomaticAnalyzer(options:{image:AutomaticSource|Pixels;imageId?:string;selection:{regions:Polygon[];envelope?:Polygon|null;disabled?:number[]};budget:AutomaticBudget;engines?:AutomaticEngines;complete?:boolean;cpu?:boolean;d2Minimum?:number;maxConcurrent?:number;sparseOptions?:Record<string,unknown>;ela?:{cellParams?:Record<string,unknown>;energyParams?:Record<string,unknown>;maxWorkers?:number;storage?:'auto'|'memory'|'temporary';onTemporarySession?:AutomaticHooks['onTemporarySession']};entryWasmBinary?:Uint8Array;compositionWasmBinary?:Uint8Array}):Promise<AutomaticAnalyzer>;
