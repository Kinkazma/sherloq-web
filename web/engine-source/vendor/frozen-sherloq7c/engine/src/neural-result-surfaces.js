import{createNumericSurface}from'./numeric-surface.js';import{createMaskSurface}from'./rgb-surface.js';
// A published bundle owns its analysis stores independently of model/raw caches.
// Releasing one handle cannot destroy the other planes in the same bundle.
export async function neuralResultSurfaces(analysis,{budget}={}){
 const surfaces=[];let references=0;
 const retain=()=>{references++;let released=false;return async()=>{if(released)return;released=true;if(--references===0)await analysis.dispose();};};
 try{
  const make=(key)=>{const store=analysis.stores[key],numeric=['map','target','source'].includes(key),free=retain();let surface;
   try{surface=numeric?createNumericSurface(store,{width:analysis.width,height:analysis.height,format:'float32',budget,semantics:key==='map'?'Native union probability; source-coordinate projection.':'Native '+key+' plane; semantics recorded in analysis metadata.',dispose:free}):createMaskSurface({...store,dispose:free},{width:analysis.width,height:analysis.height,budget,range:[0,1],semantics:'Native '+key+' support in source coordinates.'});}catch(error){references--;throw error;}
   surfaces.push(surface);return{surface,neuralAnalysis:analysis};
  };
  const primary=make('map'),planeRecords={},maskRecords={};for(const key of Object.keys(analysis.stores)){if(key==='map')continue;(['target','source'].includes(key)?planeRecords:maskRecords)[key]=make(key);}
  return{...primary,planeRecords,maskRecords,data:{width:analysis.width,height:analysis.height,metadata:structuredClone(analysis.metadata),arrayLayout:'segmented; readPlane/readMask windows or streamed NPZ export'}};
 }catch(error){await Promise.allSettled(surfaces.map(s=>s.dispose()));if(references===0)await analysis.dispose();throw error;}
}
