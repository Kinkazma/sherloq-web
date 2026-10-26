// Control flow only: neither a learned graph nor a JPEG codec is executed.
// Core, strict readers, DTD512 feed arithmetic, banks and owners remain real.
export const doctamperControlledState={modelCalls:[],categoryLoads:[],workingCalls:0,retirements:0,gate:null};
export async function createExtensionEngine(options){
 const actual=await import(new URL('engine.js',options.baseURL));
 return actual.createExtensionEngine({...options,createCodec:async()=>({
  async workingDCT(gray){doctamperControlledState.workingCalls++;return{coefficients:Int16Array.from(gray.data,(v,i)=>(v+i%13)%35-17),stride:512,quantizationTable:new Uint8Array(64).fill(8)};},
  async nativeCategorySource(encoded,{width,height,signal}){if(signal?.aborted)throw signal.reason;doctamperControlledState.categoryLoads.push({width,height,encodedBytes:encoded.byteLength});return{width,height,quantizationTable:new Uint8Array(64).fill(9),async readWindow(r){return{data:Uint8Array.from({length:r.width*r.height},(_,i)=>(Math.floor((r.x+i%r.width)/8)*5+Math.floor((r.y+Math.floor(i/r.width))/8)*7+i%r.width%8+Math.floor(i/r.width)%8)%21),async release(){}};},async dispose(){doctamperControlledState.retirements++;}};},
  async dispose(){}
 }),createPool:budget=>({slots:[],snapshot:()=>({controlledNoModel:true}),dispose(){},clear(){},async run(model,feeds,{signal}){
  if(signal?.aborted)throw signal.reason;doctamperControlledState.modelCalls.push({model,dims:[...feeds.rgb.dims]});await doctamperControlledState.gate?.({signal,feeds});if(signal?.aborted)throw signal.reason;
  const n=512*512,release=budget.reserve(n*2*4),logits=new Float32Array(2*n);for(let i=0;i<n;i++)logits[n+i]=Math.fround(feeds.rgb.data[i]*.125+Number(feeds.dct.data[i])*.03125);
  return{result:{logits:{data:logits,dims:[1,2,512,512]}},release,metrics:{provider:'controlled-no-model',threads:0}};
 }})});
}
