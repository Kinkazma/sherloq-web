import {EngineError,requireValue} from './errors.js';
// Orchestration only. Adapters must be real, qualified implementations of the
// detector and the complete branch pipeline. This module supplies no detector.
export function createAnalysisScopeController({imageId,width,height,detectSubimages,analyze,onEvent=()=>{}}){
 requireValue(typeof imageId==='string'&&imageId.length>0&&Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'Image identity and original dimensions required.');
 if(typeof detectSubimages!=='function'||typeof analyze!=='function')throw new EngineError('UNSUPPORTED_OPERATION','Complete analysis and subimage detection adapters are not available.');
 let generation=0,active,disposed=false,state={generation:0,mode:'automatic',status:'ready',regions:[],exclusions:[],progress:null,result:null,error:null};
 const snapshot=()=>structuredClone(state);
 const current=g=>!disposed&&g===generation&&!active?.signal.aborted;
 function emit(type,payload={}){onEvent({type,generation,mode:state.mode,...structuredClone(payload)});}
 function bounds(rect){requireValue(Array.isArray(rect)&&rect.length===4&&rect.every(Number.isInteger)&&rect[0]>=0&&rect[1]>=0&&rect[2]<=width&&rect[3]<=height&&rect[0]<rect[2]&&rect[1]<rect[3],'Invalid half-open source rectangle.');return rect.slice();}
 function regions(values){requireValue(Array.isArray(values),'Detector must return a region list.');const ids=new Set();return values.map((v,i)=>{const id=v.id??'region-'+i;requireValue(typeof id==='string'&&id.length>0&&!ids.has(id),'Region identities must be unique.');ids.add(id);return {id,bounds:bounds(v.bounds)};});}
 function reset(mode,status){if(disposed)throw new EngineError('DISPOSED','Analysis controller disposed.');const g=++generation;active?.abort();active=new AbortController();const signal=active.signal;state={generation:g,mode,status,regions:[],exclusions:[],progress:null,result:null,error:null};emit('reset',snapshot());return {generation:g,signal};}
 async function run(mode,existingRegions=null,exclusions=[]){
  const {generation:g,signal}=reset(mode,mode==='automatic'&&!existingRegions?'detecting':'analyzing'),progress=event=>{if(current(g)){state.progress=structuredClone(event);emit('progress',{progress:state.progress});}};
  try{
   if(!current(g))return {generation:g,status:'superseded'};
   const selected=mode==='whole-image'?[{id:'whole-image',bounds:[0,0,width,height]}]:existingRegions??await detectSubimages({imageId,width,height,generation:g,signal,onProgress:progress});
   if(!current(g))return {generation:g,status:'superseded'};
   state.regions=regions(selected);state.exclusions=exclusions.map(bounds);state.progress=null;
   if(state.regions.length===0){state.status='no-regions';emit('no-regions',snapshot());return current(g)?snapshot():{generation:g,status:'superseded'};}
   state.status='analyzing';emit('scope',{regions:state.regions,exclusions:state.exclusions});
   if(!current(g))return {generation:g,status:'superseded'};
   const result=await analyze({imageId,width,height,generation:g,signal,mode,restartAllBranches:true,regions:structuredClone(state.regions),exclusions:structuredClone(state.exclusions),onProgress:progress});
   if(!current(g))return {generation:g,status:'superseded'};
   state.status='complete';state.result=result;state.progress=null;emit('complete',{result});return current(g)?snapshot():{generation:g,status:'superseded'};
  }catch(error){if(!current(g))return {generation:g,status:'superseded'};state.error={code:error.code??'ANALYSIS_FAILED',message:error.message??'Analysis failed.'};state.status=state.status==='detecting'?'detection-failed':'analysis-failed';state.progress=null;emit(state.status,{error:state.error});return current(g)?snapshot():{generation:g,status:'superseded'};}
 }
 return {
  getState:snapshot,
  start:()=>run('automatic'),
  useAutomaticRegions:()=>run('automatic'),
  useWholeImage:()=>run('whole-image'),
  replaceExclusions(rectangles){requireValue(state.regions.length>0,'Regions required before exclusions.');const validated=rectangles.map(bounds);return run(state.mode,structuredClone(state.regions),validated);},
  cancel(){const {generation:g}=reset(state.mode,'cancelled');if(current(g)){active.abort();emit('cancelled');}return {generation:g,status:g===generation?'cancelled':'superseded'};},
  dispose(){if(disposed)return;generation++;active?.abort();disposed=true;state={generation,mode:state.mode,status:'disposed',regions:[],exclusions:[],progress:null,result:null,error:null};emit('disposed');}
 };
}
