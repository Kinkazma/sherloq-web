import type {CloneEntry,CloneViewOptions} from './clone-relations.js';
export interface AutomaticViewState extends CloneViewOptions {
 complete:boolean;tab:string;presentation:'biomes'|'map'|'overlay';opacity:number;
 relations:{biomes:'within'|'between'|'all';corroboration:'within'|'between'|'all'};
 ela:{background:number;biomes:boolean};elaEffective:{background:number;biomes:boolean};
 elaEnergy:boolean;elaLegacy:boolean;forgeryscopeBranch:''|'microscopy'|'blots'|'lanes';
 d2prlMinimum:number;d2prlFilterVisible:boolean;frameKey:string;preserveViewport:true;
}
export function createAutomaticAnalysisView(options:{complete?:boolean;width:number;height:number}):{
 getState():AutomaticViewState;selectTab(id:string):AutomaticViewState;
 setPresentation(value:'biomes'|'map'|'overlay'):AutomaticViewState;
 setRelation(value:'within'|'between'|'all'):AutomaticViewState;
 setOpacity(value:number):AutomaticViewState;
 setEla(value:{background:number;biomes:boolean}):AutomaticViewState;
 setElaFamilies(value:{energy:boolean;legacy:boolean}):AutomaticViewState;
 setForgeryscopeBranch(value:''|'microscopy'|'blots'|'lanes'):AutomaticViewState;
 setEnabledSources(values:string[]):AutomaticViewState;
 setHidden(ids:string[]):AutomaticViewState;focus(id:string|null):AutomaticViewState;
 setD2prlMinimum(value:number):AutomaticViewState&{update:'refilter-d2prl-raw-grids'};
 visible(entries:CloneEntry[]):CloneEntry[];
};
