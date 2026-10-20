// Explicit injected model for dispatch/ownership tests, never a science oracle.
export async function createExtensionEngine({budget}={}){
 let calls=0;
 return{capabilities:()=>({methods:['bfree','spai','comprint','doctamper'],sharedBudget:true}),snapshot:()=>({injectedModel:true,calls}),clearCache(){},dispose(){},async analyzeSource(source,{methods,signal}={}){
  calls++;const n=source.width*source.height,release=budget.reserve(n*12),results=[];let sum=0;
  try{for(let y=0;y<source.height;y++){const part=await source.readWindow({x:0,y,width:source.width,height:1},{signal});try{for(const value of part.pixels.data)sum+=value;}finally{await part.release?.();}}
   const mean=sum/(n*3);
   for(const method of methods)results.push({method,status:'ok',scores:{global_logit:mean},...(method==='comprint'?{anomaly:{data:Float64Array.from({length:n},(_,i)=>mean+i/1000),dims:[source.height,source.width]},fingerprint:{data:Float32Array.from({length:n},(_,i)=>mean/255+i/10000),dims:[source.height,source.width]}}:{})});
   return{results,release,metrics:{injectedModel:true,calls}};
  }catch(error){release();throw error;}
 }};
}
