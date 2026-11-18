import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Presentation only. The caller owns/funds `colors` before creating this
// bounded collector; numerical columns, model and CSV never consume it.
export function createSourceDisplaySampler({source,binding,grid,colors,total,maxPoints=131072,isCurrent=()=>true}){
 requireValue(source?.descriptor?.format==='rgb8'&&typeof source.readWindow==='function'&&typeof source.readSampledWindow==='function','Canonical SDR source is required.');
 const original=source,descriptor=source.descriptor,step=grid?.step??1,origin=grid?.origin??[0,0],width=grid?.width,height=grid?.height,stride=Math.max(1,Math.ceil(total/maxPoints)),count=Math.ceil(total/stride);
 requireValue(binding?.sourceSurfaceId===descriptor.id&&binding?.sourceRevision===descriptor.revision&&typeof binding.sourceSha256==='string'&&[width,height,step,...origin,total,maxPoints].every(Number.isSafeInteger)&&width>0&&height>0&&step>0&&origin.every(v=>v>=0)&&total===width*height&&maxPoints>0&&maxPoints<=262144&&colors instanceof Uint8Array&&colors.length===count*3,'Display sampler grid, binding or funded target differs.');
 requireValue(origin[0]+(width-1)*step<descriptor.width&&origin[1]+(height-1)*step<descriptor.height,'Display sampler grid exceeds Original.');
 const windows=new Map(),pending=new Set();let closed=false,closing=false,disposal;
 const check=signal=>{checkAbort(signal);if(closing||closed||source!==original||source.descriptor.id!==descriptor.id||source.descriptor.revision!==descriptor.revision||!isCurrent())throw new EngineError('SOURCE_CHANGED','Canonical display sampler changed.');};
 async function retire(record){if(record.retired)return;if(record.flight)return record.flight;const task=Promise.resolve().then(async()=>{record.output.pixels.data=null;const ack=await record.lease.release();if(ack===false||ack===0)throw new EngineError('BUSY','Canonical display window did not retire.');record.lease=null;record.retired=true;windows.delete(record.output);}).catch(primary=>{throw withRetirementOwner(primary,owner,primary);});record.flight=task;void task.finally(()=>{if(record.flight===task)record.flight=null;}).catch(()=>{});return task;}
 const owner={count,stride,
  read(rect,{signal}={}){check(signal);requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height&&(rect.height===1||rect.x===0&&rect.width===width),'Display sample band is not an ordered grid span.');
   const task=(async()=>{let record;try{const x=origin[0]+rect.x*step,y=origin[1]+rect.y*step,lease=await(step===1?source.readWindow({x,y,width:rect.width,height:rect.height},{signal}):source.readSampledWindow({x,y,w:(rect.width-1)*step+1,h:(rect.height-1)*step+1,step},{signal}));
    const output={pixels:{...lease.pixels},rect:{...rect},release:()=>retire(record)};record={lease,output,flight:null,retired:false};windows.set(output,record);check(signal);requireValue(output.pixels?.format==='rgb8'&&output.pixels.data instanceof Uint8Array&&output.pixels.width===rect.width&&output.pixels.height===rect.height&&output.pixels.data.length===rect.width*rect.height*3,'Canonical display grid returned other pixels.');return output;
   }catch(primary){throw primary;}})();pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  },
  collect(window,offset){check();const record=windows.get(window),rect=window?.rect;requireValue(record&&!record.retired&&offset===rect.y*width+rect.x,'A live canonical display band is required.');const bytes=window.pixels.data,end=offset+rect.width*rect.height;for(let ordinal=Math.ceil(offset/stride)*stride;ordinal<end;ordinal+=stride){const from=(ordinal-offset)*3,to=ordinal/stride*3;colors[to]=bytes[from];colors[to+1]=bytes[from+1];colors[to+2]=bytes[from+2];}},
  dispose(){if(closed)return Promise.resolve();if(disposal)return disposal;closing=true;const task=Promise.resolve().then(async()=>{await Promise.allSettled([...pending]);for(const record of [...windows.values()])await retire(record);source=null;colors=null;closed=true;}).catch(primary=>{throw withRetirementOwner(primary,owner,primary);});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;},
 };return owner;
}
