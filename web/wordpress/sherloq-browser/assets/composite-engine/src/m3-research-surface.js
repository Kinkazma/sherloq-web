import {EngineError,requireValue,checkAbort} from './errors.js';
import {renderResearch} from './research-view.js';
import {payloadBytes} from './pixel-operations.js';
// Derived full-resolution view. Only requested windows materialize RGB; native
// grids are retained independently of inference caches and transferred results.
export async function createResearchSurface(image,data,view,{budget,signal}={}){
 const {width,height}=image.surface.descriptor,bytes=payloadBytes(data)+8192;let held,disposed=false;
 const probe=await renderResearch({width:0,height:0,data:new Uint8Array()},data,view,{signal,reserveMemory:()=>{}});
 budget.retain(bytes);try{held=structuredClone(data);}catch(error){budget.retained-=bytes;throw error;}
 const analysis={data:held},id=crypto.randomUUID(),descriptor=Object.freeze({id,revision:1,width,height,format:'rgb8',sourceWidth:width,sourceHeight:height,orientation:1,coordinates:'full-resolution',storage:'derived'});
 const surface={descriptor,
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   requireValue(!disposed,'Research result surface disposed.');requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Research window bounds');checkAbort(signal);let source,blankFree;const leases=[];
   try{
    if(probe.style.mode==='overlay')source=await image.surface.readWindow({x,y,width:w,height:h},{signal});
    else{blankFree=budget.reserve(w*h*3);source={pixels:{format:'rgb8',width:w,height:h,data:new Uint8Array(w*h*3)},release:blankFree};}
    const result=await renderResearch(source.pixels,held,view,{signal,origin:[x,y],sourceSize:[width,height],includeLegend:false,reserveMemory:n=>{const f=budget.reserve(n);leases.push(f);return f;}});checkAbort(signal);
    return {surfaceId:id,revision:1,origin:[x,y],pixels:result.pixels,release(){leases.forEach(f=>f());}};
   }catch(error){leases.forEach(f=>f());throw error;}finally{source?.release();blankFree?.();}
  },
  dispose(){if(disposed)return;disposed=true;held=null;analysis.data=null;budget.retained-=bytes;}
 };
 return {surface,m3Research:analysis,style:probe.style,legend:probe.legend};
}
