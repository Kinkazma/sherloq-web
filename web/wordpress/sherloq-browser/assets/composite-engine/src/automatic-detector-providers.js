import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
import {SIFT_SOURCE} from './clone-relations.js';
import {automaticPointEntries} from './automatic-point-entries.js';
import {analyzeAutomaticForgeryscope} from './automatic-forgeryscope.js';
import {forgeryscopeEntries} from './automatic-ai-entries.js';

const own=result=>{requireValue(typeof result?.release==='function','Real detector must return an owned result.');const {release,...value}=result;return {value,release};};
const entries=output=>({value:{entries:output.entries},release:output.release});

/** Inject existing engines built for this source and the SAME shared Budget.
 * Absent engines are omitted so the session reports ENGINE_UNAVAILABLE. */
export function createAutomaticDetectorProviders({image,budget,dense,sparse,geometry,forgeryscope,sparseOptions={},wasmBinary}={}) {
 requireValue(image&&typeof budget?.reserve==='function','Original source and shared budget required.');
 if(dense||sparse)requireValue(typeof geometry?.biomeSides==='function'&&(!dense||typeof geometry?.pairedBiomes==='function'),'Actual M3 geometry functions required.');
 const providers={};
 if(dense){requireValue(typeof dense.analyze==='function','Actual DenseCopyEngine required.');providers.patchmatch={
  async run(job,hooks){requireValue(job.id==='patchmatch'&&job.enabled,'Enabled PatchMatch job required.');return own(await dense.analyze(job.params,{...hooks,backend:hooks.plan.cpu?'cpu':'auto'}));},
  async prepare(value,filters,hooks){return entries(await automaticPointEntries(value,{...filters,...hooks,budget,geometry,source:null,split:true,wasmBinary}));}
 };}
 if(sparse){requireValue(typeof sparse.analyze==='function','Actual SparseCopyEngine required.');providers.sift={
  async run(job,hooks){requireValue(job.id==='sift'&&job.enabled,'Enabled SIFT job required.');return own(await sparse.analyze(job.params,{...sparseOptions,...hooks,backend:hooks.plan.cpu?'cpu':'auto'}));},
  async prepare(value,filters,hooks){return entries(await automaticPointEntries(value,{...filters,...hooks,budget,geometry,source:SIFT_SOURCE,split:false,wasmBinary}));}
 };}
 if(forgeryscope){requireValue(typeof forgeryscope.analyze==='function','Actual M2 Forgeryscope analyzer required.');providers.forgeryscope={
  async run(job,hooks){requireValue(job.id==='forgeryscope'&&job.enabled,'Enabled Forgeryscope job required.');return own(await analyzeAutomaticForgeryscope(image,hooks.plan,{...hooks,analyzer:forgeryscope,budget}));},
  async prepare(value,filters,hooks){return entries(await forgeryscopeEntries(value,{...filters,...hooks,budget,wasmBinary}));}
 };}
 return providers;
}
