import "../../runtime-context.js?v=0.30.0";
// This module never schedules work. Callers report only requested, completed work.
export const ADAPTIVE_SCHEMA = 'sherloq.adaptive-runtime/2';
export const ADAPTIVE_LEGACY_SCHEMA = 'sherloq.adaptive-runtime/1';
export const ADAPTIVE_MAX_BYTES = 960 * 1024;
export const ADAPTIVE_LIMITS = Object.freeze({choices:512,runs:256,foreign:64});
const modes = new Set(['auto','cpu','webgpu']);
const encoder = new TextEncoder();
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => Number.isFinite(v) && v >= 0;
const text = (v,max=128) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const keysOnly=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));
const clone = v => structuredClone(v);
const bytes = v => encoder.encode(JSON.stringify(v)).byteLength;
const now = () => Date.now();
function requireValue(value,message){if(!value)throw new TypeError(message);}
function stable(value,depth=0){
 requireValue(depth<=12,'Identity nesting is too deep');
 if(value===null||typeof value==='boolean'||typeof value==='string')return typeof value==='string'?'s:'+JSON.stringify(value):value===null?'z:':'b:'+JSON.stringify(value);
 if(typeof value==='number'){requireValue(Number.isFinite(value),'Nonfinite identity');return 'n:'+(Object.is(value,-0)?'-0':JSON.stringify(value));}
 if(Array.isArray(value)){requireValue(value.length<=4096,'Identity array is too long');return 'a:['+value.map(v=>stable(v,depth+1)).join(',')+']';}
 requireValue(object(value),'Invalid identity');const keys=Object.keys(value).sort();
 requireValue(keys.length<=256&&!keys.some(k=>['__proto__','constructor','prototype'].includes(k)),'Invalid identity keys');
 return 'o:{'+keys.map(k=>JSON.stringify(k)+':'+stable(value[k],depth+1)).join(',')+'}';
}
export async function adaptiveIdentity(material,{crypto=globalThis.crypto}={}){
 requireValue(crypto?.subtle,'A cryptographic digest is required');
 const source=stable(material);requireValue(encoder.encode(source).byteLength<=256*1024,'Identity material is too large');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(source)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function analysisComparisonIdentity({sources,domainSha256,operation,method='default',parameters,modelShas=[],codeShas,precision,profile,threads},options){
 requireValue(Array.isArray(sources)&&sources.length>0&&sources.length<=64&&sources.every(sha),'Source SHA identities are required');
 requireValue(sha(domainSha256)&&text(operation)&&text(method)&&object(parameters),'Scientific domain/parameters are required');
 requireValue(Array.isArray(modelShas)&&modelShas.length<=128&&modelShas.every(sha)&&Array.isArray(codeShas)&&codeShas.length>0&&codeShas.length<=128&&codeShas.every(sha),'Code and model identities are required');
 requireValue(text(precision)&&text(profile)&&Number.isInteger(threads)&&threads>0&&threads<=1024,'Precision/profile/threads are required');
 return adaptiveIdentity({schema:'sherloq.analysis-comparison/1',sources,domainSha256,operation,method,parameters,modelShas,codeShas,precision,profile,threads},options);
}
export function backendScope(tool,method='default'){
 requireValue(text(tool)&&text(method),'Invalid tool/method scope');return JSON.stringify([tool,method]);
}
function scopeValid(scope){try{const a=JSON.parse(scope);return Array.isArray(a)&&a.length===2&&a.every(v=>text(v))&&backendScope(...a)===scope;}catch{return false;}}
function contextValid(c){return object(c)&&['environment','runtime','implementation','precision','profile','resources'].every(k=>text(c[k]))&&Number.isInteger(c.threads)&&c.threads>=1&&c.threads<=1024&&Object.keys(c).every(k=>['environment','runtime','implementation','precision','profile','resources','threads'].includes(k));}
function workValid(w){return w===null||object(w)&&['category','contract','unit','layout','shape'].every(k=>text(w[k]))&&sha(w.code)&&['complete-operation','complete-phase'].includes(w.coverage)&&finite(w.units)&&w.units>0&&Object.keys(w).every(k=>['category','contract','unit','layout','shape','units','code','coverage'].includes(k));}
function costValid(c){return object(c)&&['totalMs','preparationMs','computeMs','transferMs','ackMs','otherMs'].every(k=>finite(c[k]))&&Object.keys(c).every(k=>['totalMs','preparationMs','computeMs','transferMs','ackMs','otherMs'].includes(k))&&Math.abs(c.totalMs-c.preparationMs-c.computeMs-c.transferMs-c.ackMs-c.otherMs)<=Math.max(.01,c.totalMs*1e-6);}
function runValid(r){return object(r)&&text(r.id)&&sha(r.analysis)&&text(r.algorithm)&&modes.has(r.requested)&&['cpu','webgpu','hybrid'].includes(r.backend)&&contextValid(r.context)&&['cold','warm','unknown'].includes(r.regime)&&['miss','hit','partial'].includes(r.cache)&&costValid(r.cost)&&workValid(r.work)&&Number.isSafeInteger(r.at)&&r.at>=0&&Number.isSafeInteger(r.sequence)&&r.sequence>=0&&keysOnly(r,['id','analysis','algorithm','requested','backend','context','regime','cache','cost','work','at','sequence']);}
function choiceValid(c){return object(c)&&scopeValid(c.scope)&&modes.has(c.mode)&&Number.isSafeInteger(c.at)&&c.at>=0&&keysOnly(c,['scope','mode','at']);}
function foreignValid(f){return object(f)&&text(f.origin)&&Number.isSafeInteger(f.importedAt)&&f.importedAt>=0&&runValid(f.run)&&keysOnly(f,['origin','importedAt','run']);}
export function validateAdaptiveState(input){
 requireValue(object(input)&&[ADAPTIVE_SCHEMA,ADAPTIVE_LEGACY_SCHEMA].includes(input.schema),'Unsupported adaptive history schema');
 requireValue(text(input.machine)&&Array.isArray(input.choices)&&Array.isArray(input.runs)&&Array.isArray(input.foreign),'Invalid adaptive history');
 requireValue(input.choices.length<=ADAPTIVE_LIMITS.choices&&input.runs.length<=ADAPTIVE_LIMITS.runs&&input.foreign.length<=ADAPTIVE_LIMITS.foreign,'Adaptive history has too many entries');
 requireValue(input.choices.every(choiceValid)&&input.runs.every(runValid)&&input.foreign.every(foreignValid),'Invalid adaptive entry');
 if(input.schema===ADAPTIVE_LEGACY_SCHEMA){const legacy=r=>['cpu','webgpu'].includes(r.backend)&&['cold','warm'].includes(r.regime);requireValue(input.runs.every(legacy)&&input.foreign.every(f=>legacy(f.run)),'Invalid legacy adaptive entry');}
 requireValue(new Set(input.choices.map(c=>c.scope)).size===input.choices.length&&new Set(input.runs.map(r=>r.id)).size===input.runs.length,'Duplicate adaptive entry');
 const out={schema:ADAPTIVE_SCHEMA,machine:input.machine,choices:clone(input.choices),runs:clone(input.runs),foreign:clone(input.foreign)};
 requireValue(bytes(out)<=ADAPTIVE_MAX_BYTES,'Adaptive history exceeds its byte budget');return out;
}
function contextKey(c,{category=false}={}){
 // Cross-algorithm sharing requires the same declared category contract. The
 // implementation-specific key remains necessary for exact analysis pairs.
 return stable(category?{environment:c.environment,runtime:c.runtime,precision:c.precision,profile:c.profile,resources:c.resources,threads:c.threads}:c);
}
function pairKey(r){return stable([r.analysis,r.algorithm,contextKey(r.context),r.regime]);}
function compatibleWork(a,b){return a&&b&&['category','contract','unit','layout','shape','code','coverage'].every(k=>a[k]===b[k])&&a.units>=b.units*.5&&a.units<=b.units*2;}
function explicitOption(r){return r.requested==='cpu'&&r.backend==='cpu'?'cpu':r.requested==='webgpu'&&['webgpu','hybrid'].includes(r.backend)?'webgpu':null;}
function exactComparable(r){return r.cache==='miss'&&['cold','warm'].includes(r.regime)&&explicitOption(r)===r.backend;}
function collectWeakPairs(runs){const buckets=new Map();for(const r of runs){const option=explicitOption(r);if(r.cache!=='miss'||!option)continue;const key=pairKey(r),b=buckets.get(key)??{};b[option]=r;buckets.set(key,b);}return [...buckets.values()].filter(b=>b.cpu&&b.webgpu&&(b.cpu.regime==='unknown'||b.webgpu.backend==='hybrid')).map(b=>({cpu:clone(b.cpu),webgpu:clone(b.webgpu)}));}
function median(a){const s=[...a].sort((a,b)=>a-b);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2;}

export class AdaptiveRuntimeHistory {
 constructor({machineId,initial,clock=now,randomId=()=>globalThis.crypto.randomUUID(),maxBytes=ADAPTIVE_MAX_BYTES}={}){
  requireValue(text(machineId),'A local machine identity is required');requireValue(Number.isInteger(maxBytes)&&maxBytes>=4096&&maxBytes<=ADAPTIVE_MAX_BYTES,'Invalid history byte budget');
  this.machine=machineId;this.clock=clock;this.randomId=randomId;this.maxBytes=maxBytes;
  this.state={schema:ADAPTIVE_SCHEMA,machine:machineId,choices:[],runs:[],foreign:[]};
  if(initial){const v=validateAdaptiveState(initial);this.state.choices=v.choices;
   if(v.machine===machineId){this.state.runs=v.runs;this.state.foreign=v.foreign;}
   else this.import(v);
  }
  this.sequence=Math.max(0,...this.state.runs.map(r=>r.sequence))+1;this.trim();
 }
 trim(){
  while(this.state.runs.filter(r=>r.cache!=='miss').length>32)this.state.runs.splice(this.state.runs.findIndex(r=>r.cache!=='miss'),1);
  for(const [key,limit]of Object.entries(ADAPTIVE_LIMITS))while(this.state[key].length>limit)this.state[key].shift();
  while(bytes(this.state)>this.maxBytes){const key=this.state.foreign.length?'foreign':this.state.runs.length?'runs':'choices';requireValue(this.state[key].length,'History header exceeds byte budget');this.state[key].shift();}
 }
 setMode(scope,mode){requireValue(scopeValid(scope)&&modes.has(mode),'Invalid backend preference');this.state.choices=this.state.choices.filter(c=>c.scope!==scope);this.state.choices.push({scope,mode,at:this.clock()});this.trim();return mode;}
 hasMode(scope){requireValue(scopeValid(scope),'Invalid backend scope');return this.state.choices.some(c=>c.scope===scope);}
 mode(scope){requireValue(scopeValid(scope),'Invalid backend scope');return this.state.choices.find(c=>c.scope===scope)?.mode??'auto';}
 export(){this.trim();return clone(this.state);}
 serializedBytes(){return bytes(this.state);}
 import(input){
  const incoming=validateAdaptiveState(input),time=this.clock();
  for(const c of incoming.choices)this.setMode(c.scope,c.mode);
  // Never trust an imported claimed machine id, including one equal to ours.
  for(const r of incoming.runs)this.state.foreign.push({origin:incoming.machine,importedAt:time,run:clone(r)});
  for(const f of incoming.foreign)this.state.foreign.push(clone(f));
  this.trim();return {choices:incoming.choices.length,foreign:incoming.runs.length+incoming.foreign.length,localRuns:0};
 }
 observe(receipt){
  requireValue(object(receipt),'Invalid useful-work receipt');
  const general=receipt.observation==='completed-useful-operation'&&receipt.actualBackendAttested===true;
  if(receipt.cancelled||receipt.failed||!['miss','hit','partial'].includes(receipt.cache)||receipt.completedAfterAck!==true||receipt.numericAdmissible!==true||receipt.cache==='miss'&&['webgpu','hybrid'].includes(receipt.backend)&&receipt.actualGpuWork!==true||receipt.cache==='miss'&&receipt.backend==='hybrid'&&receipt.actualCpuWork!==true)return {recorded:false,reason:'not-admissible-completed-useful-work'};
  // Existing qualified producers retain their exact-comparison contract. The
  // general producer may journal truthful Auto/hybrid/unknown-phase work, but
  // those observations never enter the exact pair set.
  if(!general&&(receipt.regime==='unknown'||receipt.backend==='hybrid'||receipt.cache==='miss'&&(!['cpu','webgpu'].includes(receipt.requested)||receipt.requested!==receipt.backend)))return {recorded:false,reason:'not-an-explicit-backend-comparison'};
  const r={id:this.randomId(),analysis:receipt.analysis,algorithm:receipt.algorithm,requested:receipt.requested,backend:receipt.backend,context:clone(receipt.context),regime:receipt.regime,cache:receipt.cache,cost:clone(receipt.cost),work:clone(receipt.work??null),at:this.clock(),sequence:this.sequence++};
  requireValue(runValid(r),'Invalid useful-work receipt fields');this.state.runs.push(r);this.trim();const exact=exactComparable(r),weak=r.cache==='miss'&&!!explicitOption(r)&&!exact;return {recorded:true,id:r.id,usedForLearning:exact||weak,evidence:exact?'qualified-exact-candidate':weak?'weak-only':'journal-only'};
 }
 pairs(){
  const buckets=new Map();for(const r of this.state.runs){if(!exactComparable(r))continue;const k=pairKey(r),b=buckets.get(k)??{};b[r.backend]=r;buckets.set(k,b);}
  return [...buckets.values()].filter(b=>b.cpu&&b.webgpu).map(b=>({cpu:clone(b.cpu),webgpu:clone(b.webgpu)}));
 }
 weakPairs(){return collectWeakPairs(this.state.runs);}
 recommend({scope,algorithm,analysis,context,regime='cold',work=null,admission,minimumGain=.1}={}){
  requireValue(scopeValid(scope)&&text(algorithm)&&contextValid(context)&&['cold','warm','unknown'].includes(regime)&&workValid(work),'Invalid adaptive request');
  requireValue(object(admission)&&typeof admission.cpu==='boolean'&&typeof admission.webgpu==='boolean','Explicit numerical/resource/capability admission is required');
  requireValue(finite(minimumGain)&&minimumGain<1,'Invalid minimum gain');
  const requested=this.mode(scope);
  if(requested!=='auto')return {requested,backend:admission[requested]?requested:null,basis:admission[requested]?'human-preference':'human-preference-not-admitted',adaptive:false};
  if(!admission.webgpu||!admission.cpu)return {requested,backend:admission.cpu?'cpu':admission.webgpu?'webgpu':null,basis:'admission',adaptive:false};
  const local=this.pairs(),exact=local.filter(p=>p.cpu.algorithm===algorithm&&p.cpu.context&&contextKey(p.cpu.context)===contextKey(context)&&p.cpu.regime===regime&&p.cpu.cost.totalMs>0&&!!analysis&&p.cpu.analysis===analysis);
  const decide=(ratios,basis,count)=>{const ratio=median(ratios);return {requested,backend:ratio<1-minimumGain?'webgpu':'cpu',basis,adaptive:true,gpuToCpuRatio:ratio,pairCount:count};};
  if(exact.length)return decide(exact.filter(p=>p.cpu.cost.totalMs>0).map(p=>p.webgpu.cost.totalMs/p.cpu.cost.totalMs),'local-explicit-analysis-pairs',exact.length);
  const category=local.filter(p=>p.cpu.regime===regime&&contextKey(p.cpu.context,{category:true})===contextKey(context,{category:true})&&compatibleWork(p.cpu.work,work)&&compatibleWork(p.webgpu.work,work)&&p.cpu.work.units===p.webgpu.work.units&&p.cpu.cost.totalMs>0);
  // A shared category is an explicit scientific/runtime contract, never an
  // inference from an algorithm name. A single pair is only a weak prior.
  if(category.length){
   const ratios=category.map(p=>p.webgpu.cost.totalMs/p.cpu.cost.totalMs),m=median(ratios);
   if(ratios.every(r=>r<1-minimumGain)||ratios.every(r=>r>=1-minimumGain))return {...decide(ratios,'compatible-local-work-category',category.length),transferred:true,confidence:category.length>=3&&new Set(category.map(p=>p.cpu.algorithm)).size>=2?'moderate':'low',provisional:true};
   return {requested,backend:null,basis:'conflicting-local-work-category',adaptive:false,medianGpuToCpuRatio:m};
  }
  const weak=this.weakPairs().filter(p=>p.cpu.regime===regime&&p.cpu.cost.totalMs>0&&(p.cpu.algorithm===algorithm&&contextKey(p.cpu.context)===contextKey(context)&&analysis&&p.cpu.analysis===analysis||contextKey(p.cpu.context,{category:true})===contextKey(context,{category:true})&&compatibleWork(p.cpu.work,work)&&compatibleWork(p.webgpu.work,work)&&p.cpu.work.units===p.webgpu.work.units));
  if(weak.length){const ratios=weak.map(p=>p.webgpu.cost.totalMs/p.cpu.cost.totalMs);if(ratios.every(r=>r<1-minimumGain)||ratios.every(r=>r>=1-minimumGain))return {...decide(ratios,'compatible-local-weak-prior',weak.length),confidence:'low',provisional:true,weakOnly:true,localExactPairCount:0};}
  const foreign=this.state.foreign.filter(f=>f.run.cache==='miss'&&f.run.regime===regime&&contextKey(f.run.context,{category:true})===contextKey(context,{category:true}));
  const importedBuckets=new Map();for(const f of foreign){const r=f.run;if(!exactComparable(r))continue;const k=stable([f.origin,pairKey(r)]),b=importedBuckets.get(k)??{};b[r.backend]=r;importedBuckets.set(k,b);}
  const imported=[...importedBuckets.values()].filter(p=>p.cpu&&p.webgpu&&p.cpu.cost.totalMs>0&&(
   p.cpu.algorithm===algorithm&&contextKey(p.cpu.context)===contextKey(context)&&analysis&&p.cpu.analysis===analysis||
   compatibleWork(p.cpu.work,work)&&compatibleWork(p.webgpu.work,work)&&p.cpu.work.units===p.webgpu.work.units));
  if(imported.length){const ratios=imported.map(p=>p.webgpu.cost.totalMs/p.cpu.cost.totalMs);if(ratios.every(r=>r<1-minimumGain)||ratios.every(r=>r>=1-minimumGain))return {...decide(ratios,'compatible-imported-prior',imported.length),confidence:'low',provisional:true,localPairCount:0};}
  const foreignGroups=new Map();for(const f of foreign){const list=foreignGroups.get(f.origin)??[];list.push(f.run);foreignGroups.set(f.origin,list);}
  const weakForeign=[...foreignGroups.values()].flatMap(collectWeakPairs).filter(p=>p.cpu.cost.totalMs>0&&(p.cpu.algorithm===algorithm&&contextKey(p.cpu.context)===contextKey(context)&&analysis&&p.cpu.analysis===analysis||compatibleWork(p.cpu.work,work)&&compatibleWork(p.webgpu.work,work)&&p.cpu.work.units===p.webgpu.work.units));
  if(weakForeign.length){const ratios=weakForeign.map(p=>p.webgpu.cost.totalMs/p.cpu.cost.totalMs);if(ratios.every(r=>r<1-minimumGain)||ratios.every(r=>r>=1-minimumGain))return {...decide(ratios,'compatible-imported-weak-prior',weakForeign.length),confidence:'low',provisional:true,weakOnly:true,localPairCount:0};}
  return {requested,backend:null,basis:'no-comparable-local-pair',adaptive:false,foreignIndications:foreign.length};
 }
}

export function adaptiveCosts({start,prepared,computed,transferred,acknowledged,finished}){
 const a=[start,prepared,computed,transferred,acknowledged,finished];requireValue(a.every(finite)&&a.every((v,i)=>i===0||v>=a[i-1]),'Invalid useful-work timeline');
 return {totalMs:finished-start,preparationMs:prepared-start,computeMs:computed-prepared,transferMs:transferred-computed,ackMs:acknowledged-transferred,otherMs:finished-acknowledged};
}
