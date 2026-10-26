import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {renderResearch} from './research-view.js';
import {payloadBytes} from './pixel-operations.js';
import {retireCompositeOwners} from './composite-owner-release.js';
// Derived full-resolution view. Only requested windows materialize RGB; native
// grids are retained independently of inference caches and transferred results.
export async function createResearchSurface(image,data,view,{budget,signal}={}){
 view=structuredClone(view);
 const {width,height}=image.surface.descriptor,bytes=payloadBytes(data)+8192;let held,disposed=false,closing;const reads=new Set(),borrowed=new Set();
 const retireSource=async source=>{if(!source)return;await source.release();borrowed.delete(source);};
 const probe=await renderResearch({width:0,height:0,data:new Uint8Array()},data,view,{signal,reserveMemory:()=>{}});
 budget.retain(bytes);try{held=structuredClone(data);}catch(error){budget.retained-=bytes;throw error;}
 const analysis={data:held},id=crypto.randomUUID(),descriptor=Object.freeze({id,revision:1,width,height,format:'rgb8',sourceWidth:width,sourceHeight:height,orientation:1,coordinates:'full-resolution',storage:'derived'});
 const surface={descriptor,
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   requireValue(!disposed,'Research result surface disposed.');requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Research window bounds');checkAbort(signal);let source,blankFree,returned=false,primary,finish;const leases=[],reading=new Promise(resolve=>finish=resolve);reads.add(reading);
   try{
    if(probe.style.mode==='overlay'||Array.isArray(held.fragments))source=await image.surface.readWindow({x,y,width:w,height:h},{signal});
    else{blankFree=budget.reserve(w*h*3);source={pixels:{format:'rgb8',width:w,height:h,data:new Uint8Array(w*h*3)},release:blankFree};}
    borrowed.add(source);
    const result=await renderResearch(source.pixels,held,view,{signal,origin:[x,y],sourceSize:[width,height],includeLegend:false,reserveMemory:n=>{const f=budget.reserve(n);leases.push(f);return f;}});checkAbort(signal);
    await retireCompositeOwners([()=>retireSource(source),()=>blankFree?.()]);source=null;blankFree=null;checkAbort(signal);if(disposed)throw new EngineError('DISPOSED','Research result surface disposed during its source read.');returned=true;
    return {surfaceId:id,revision:1,origin:[x,y],pixels:result.pixels,release(){leases.forEach(f=>f());}};
   }catch(error){primary=error;throw error;}finally{try{await retireCompositeOwners([()=>retireSource(source),()=>blankFree?.(),...(!returned?leases.map(f=>()=>f()):[])],primary?{primary}:{});}finally{reads.delete(reading);finish();}}
  },
  dispose(){
   if(closing)return closing;disposed=true;const finish=()=>{if(held){held=null;analysis.data=null;budget.retained-=bytes;}};
   if(!reads.size&&!borrowed.size){finish();return;}
   const task=(async()=>{await Promise.all([...reads]);await retireCompositeOwners([...borrowed].map(source=>()=>retireSource(source)));finish();})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };
 return {surface,m3Research:analysis,style:probe.style,legend:probe.legend};
}
