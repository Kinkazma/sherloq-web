import "../../runtime-context.js?v=0.33.2";
// Adapt the existing mountPixelCache contract to its parent-owned byte stores.
// The same Asyncify syscall waits for all bounded chunks of one native I/O.
export function createWorkerCacheBridge(request,maximumTransferBytes){
 let sequence=0,closed=false,closing;const files=new Set();
 const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
 return{
  createFile(){
   if(closed)throw new Error('The Core cache bridge is retired.');
   const id=++sequence;let length=0,retired=false,disposal;
   const file={get byteLength(){return length;},
    async ensureLength(next){const reply=await request('cache-grow',{id,bytes:next});if(reply?.byteLength!==next)throw new Error('The parent did not acknowledge the cache extent.');length=next;},
    async readInto(target,offset){let done=0;while(done<target.length){const count=Math.min(maximumTransferBytes,target.length-done),part=await request('cache-read',{id,offset:offset+done,length:count});if(!(part.cacheBytes instanceof Uint8Array)||part.cacheBytes.length!==count||part.count!==count)throw new Error('The parent cache returned a different byte range.');target.set(part.cacheBytes,done);done+=count;}return done;},
    async write(source,offset){let done=0;while(done<source.length){const bytes=source.slice(done,done+Math.min(maximumTransferBytes,source.length-done)),count=bytes.length;const result=await request('cache-write',{id,offset:offset+done,length:count,bytes},[bytes.buffer]);if(result.count!==count)throw new Error('The parent cache accepted an incomplete byte range.');done+=count;}return done;},
    async flush(){const reply=await request('cache-flush',{id});if(reply?.flushed!==true)throw new Error('The parent did not acknowledge its cache flush.');},
    dispose(){if(retired)return Promise.resolve();if(disposal)return disposal;const task=(async()=>{const reply=await request('cache-retire',{id});if(reply?.retired!==true)throw new Error('The parent did not acknowledge its cache retirement.');retired=true;files.delete(file);})();disposal=task;task.catch(()=>{if(disposal===task)disposal=null;});return task;},
   };files.add(file);return file;
  },
  retire:file=>ack(()=>file.dispose()),
  dispose(){if(closed)return Promise.resolve();if(closing)return closing;const task=(async()=>{for(const file of [...files])await ack(()=>file.dispose());closed=true;})();closing=task;task.catch(()=>{if(closing===task)closing=null;});return task;},
  metrics:()=>({remoteParentBacking:true,openFiles:files.size,createdFiles:sequence,maximumTransferBytes}),
 };
}
