import {requireValue} from './errors.js';
import {CLONE_SOURCES,ELA_SOURCE} from './clone-relations.js';
import {automaticViewSelection} from './automatic-visible-entries.js';
// Presentation state only: changing tabs, opacity, relations or ELA visibility
// never schedules a detector. Caller reuses outputs owned by its engine session.
export function createAutomaticAnalysisView({complete=false,width,height}={}) {
  requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'Source dimensions required');
  const available=[...CLONE_SOURCES,...(complete?[ELA_SOURCE]:[])],tabs=['overlay',...available],states=new Map(),global={ela:{background:0,biomes:true},elaEnergy:true,elaLegacy:true,forgeryscopeBranch:'',enabledSources:available.slice(),hidden:[],focused:null};let tab='overlay',minimum=500;
  function state(id=tab){if(!states.has(id))states.set(id,{presentation:id==='overlay'?'overlay':'biomes',opacity:.7,relations:{biomes:id==='overlay'?'within':'all',corroboration:id==='overlay'?'within':'all'}});return states.get(id);}
  function snapshot(){const s=structuredClone({...state(),...global}),presentation=tab===ELA_SOURCE?'biomes':s.presentation,corroboration=presentation!=='biomes',value={complete,tab,...s,presentation,relation:s.relations[corroboration?'corroboration':'biomes'],d2prlMinimum:minimum,d2prlFilterVisible:tab==='overlay'||tab==='D2PRL',frameKey:`${width}x${height}`,preserveViewport:true};return {...value,elaEffective:automaticViewSelection([],value).elaEffective};}
  function changed(){global.focused=null;return snapshot();}
  return {
    getState:snapshot,
    selectTab(id){requireValue(tabs.includes(id),'Unknown analysis tab');tab=id;return changed();},
    setPresentation(value){requireValue(['biomes','map','overlay'].includes(value),'Unknown presentation');requireValue(tab!==ELA_SOURCE||value==='biomes','ELA uses biome presentation.');state().presentation=value;return changed();},
    setRelation(value){requireValue(['within','between','all'].includes(value),'Unknown relation');const s=state();s.relations[s.presentation==='biomes'?'biomes':'corroboration']=value;return changed();},
    setOpacity(value){requireValue(Number.isFinite(value)&&value>=0&&value<=1,'Opacity must be 0–1');state().opacity=value;return snapshot();},
    setEla({background,biomes}){requireValue(complete&&Number.isInteger(background)&&background>=0&&background<=4&&typeof biomes==='boolean','Invalid ELA view');global.ela={background,biomes};return changed();},
    setElaFamilies({energy,legacy}){requireValue(complete&&typeof energy==='boolean'&&typeof legacy==='boolean','ELA family visibility required.');global.elaEnergy=energy;global.elaLegacy=legacy;return changed();},
    setForgeryscopeBranch(value){requireValue(['','microscopy','blots','lanes'].includes(value),'Invalid Forgeryscope branch');global.forgeryscopeBranch=value;return changed();},
    setEnabledSources(values){requireValue(Array.isArray(values)&&values.every(v=>available.includes(v))&&new Set(values).size===values.length,'Invalid source selection');global.enabledSources=values.slice();return changed();},
    setHidden(ids){requireValue(Array.isArray(ids)&&ids.every(id=>typeof id==='string'),'Invalid biome identities');global.hidden=ids.slice();return snapshot();},
    focus(id){requireValue(id===null||typeof id==='string','Invalid focus');global.focused=id;return snapshot();},
    setD2prlMinimum(value){requireValue(Number.isInteger(value)&&value>=0&&value<=5000,'D2PRL minimum must be 0–5000');minimum=value;return {...snapshot(),update:'refilter-d2prl-raw-grids'};},
    visible(entries){return automaticViewSelection(entries,snapshot()).entries;}
  };
}
