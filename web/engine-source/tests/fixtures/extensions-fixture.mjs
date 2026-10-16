// Model-free fixture for the real core entry point and worker RPC contract.
export async function createExtensionEngine(options){
 const state=globalThis.__extensionBridgeFixture??={};state.options=options;state.instances=(state.instances??0)+1;
 return {
  capabilities:()=>({methods:['bfree','spai','doctamper','comprint'],sharedBudget:true}),
  async analyzeSource(source,config){
   state.source=source;state.config=config;state.calls=(state.calls??0)+1;
   const part=await source.readWindow({x:1,y:1,width:2,height:2},{signal:config.signal});
   try{state.window=part.pixels.data.slice();}finally{part.release();}
   config.onProgress?.({phase:'fixture-useful-window',fraction:1});
   if(state.throwError)throw state.throwError;
   const n=source.width*source.height,anomaly=Float64Array.from({length:n},(_,i)=>1+i/1000000000),fingerprint=Float32Array.from({length:n},(_,i)=>i/n),scoreMap=Float32Array.from({length:n},(_,i)=>i===0?NaN:i/n),validRegion=Uint8Array.from({length:n},(_,i)=>i?255:0),mask=validRegion.slice();
   const release=options.budget.reserve(anomaly.byteLength+fingerprint.byteLength+scoreMap.byteLength+validRegion.byteLength+mask.byteLength);state.held=(state.held??0)+1;
   const results=config.methods.map(method=>state.failedMethod===method?{method,status:'error',error:{code:'FIXTURE_FAILURE',message:'Scientific fixture failure'}}:{method,status:'ok',scores:{raw_logit:-.125},scientific_limits:['Fixture only; no model inference.'],...(method==='comprint'?{anomaly:{data:anomaly,dims:[1,1,source.height,source.width]},fingerprint:{data:fingerprint,dims:[1,source.height,source.width,1]}}:method==='doctamper'?{scoreMap,validRegion,mask}:{})});
   let done=false;const finish=()=>{if(done)return;done=true;release();state.held--;state.releases=(state.releases??0)+1;};
   if(config.resultMode==='consumed'){
    let summaries;try{summaries=await Promise.all(results.map(async result=>{try{await config.onMethodResult(result);return{method:result.method,status:result.status,error:result.error};}catch(error){return{method:result.method,status:'error',error:{code:error.code??error.name,message:error.message,details:error.details}};}}));}finally{finish();}
    return{results:summaries,metrics:{fixture:true},release(){}};
   }
   return {results,metrics:{fixture:true},release:finish};
  },
  clearCache(){state.cacheClears=(state.cacheClears??0)+1;},
  dispose(){state.disposed=(state.disposed??0)+1;}
 };
}
