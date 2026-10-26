import {requireValue} from './errors.js';
import {CLONE_SOURCES,ELA_SOURCE,visibleCloneEntries} from './clone-relations.js';

/** Native display-only selection shared by rendering and scientific export. */
export function automaticViewSelection(entries,view,{complete=view.complete??false}={}) {
 const source=view.tab==='overlay'?null:view.tab,available=[...CLONE_SOURCES,...(complete?[ELA_SOURCE]:[])],enabled=view.enabledSources;
 requireValue((source===null||available.includes(source))&&Array.isArray(enabled)&&enabled.every(s=>available.includes(s))&&new Set(enabled).size===enabled.length&&Array.isArray(view.hidden)&&view.hidden.every(s=>typeof s==='string')&&(view.focused===null||typeof view.focused==='string')&&['within','between','all'].includes(view.relation)&&['biomes','map','overlay'].includes(view.presentation),'Valid automatic source, relation and visibility controls required.');
 const branch=view.forgeryscopeBranch??'',energy=view.elaEnergy??true,legacy=view.elaLegacy??true;
 requireValue(['','microscopy','blots','lanes'].includes(branch)&&typeof energy==='boolean'&&typeof legacy==='boolean'&&view.ela&&typeof view.ela.biomes==='boolean'&&Number.isInteger(view.ela.background)&&view.ela.background>=0&&view.ela.background<=4,'Valid automatic branch and ELA controls required.');
 const presentation=source===ELA_SOURCE?'biomes':view.presentation,corroborating=presentation!=='biomes',elaActive=complete&&!corroborating&&(source===null||source===ELA_SOURCE)&&enabled.includes(ELA_SOURCE),mode=elaActive?view.ela.background:0;
 const shown=mode===2?[]:visibleCloneEntries(entries,{source,hidden:view.hidden,focused:view.focused,enabledSources:enabled,relation:view.relation,presentation}).filter(e=>enabled.includes(e.source)&&(!branch||e.source!=='Forgeryscope Auto'||e.provenance?.branch===branch)&&(e.source!==ELA_SOURCE||elaActive&&view.ela.biomes&&(Object.hasOwn(e,'kind')?energy:legacy)&&(mode<3||e.kind===(mode===3?'low':'high'))));
 return {entries:shown,source,presentation,corroborating,mode,elaEffective:{background:mode,biomes:elaActive&&view.ela.biomes},forgeryscopeBranch:branch,elaEnergy:energy,elaLegacy:legacy};
}
