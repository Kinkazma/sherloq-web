// Private backing adapter for the existing Core file cache. No pixel math.
import {createSegmentedBytes} from './segmented-bytes.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {acquireMigrationWorkspace,migrationWorkspaceBytes} from './migration-workspace.js';
import {createPixelCacheWindow} from './native-magick-cache-window.js';

const thenable = value => value && typeof value.then === 'function';
const bytes = value => new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

/** RAM is consumed up to its actual parent allowance, not a small fixed cache.
 * Additional bytes use the same common temporary owner. Extents let a Core
 * cache grow without making a second complete copy of its original pixels. */
export function createPixelCacheStoreOwner({budget, maximumResidentBytes,
  maximumLogicalBytes, chunkBytes = 4 * 1024 ** 2, temporarySession,
  getTemporarySession, signal, createStore = createSegmentedBytes}) {
  requireValue(budget && typeof budget.retain === 'function'
    && typeof createStore === 'function'
    && [maximumResidentBytes,maximumLogicalBytes,chunkBytes].every(Number.isSafeInteger)
    && maximumResidentBytes >= 0 && maximumLogicalBytes >= 0 && chunkBytes > 0,
  'Invalid pixel-cache backing admission.');
  let logicalBytes = 0, disposed = false, closing,
    created = 0, diskWritten = 0, diskRead = 0, readBytes = 0, writtenBytes = 0;
  const files = new Set(), retirements = new Set(), orphanStores = new Set();
  const residentBytes=()=>[...files].reduce((n,file)=>n+file.residentBytes,0)
    +[...orphanStores].reduce((n,store)=>n+(store.storage==='memory'?store.byteLength:0),0);
  let session=temporarySession,ioWorkspace,ioCache;
  const alive = () => { checkAbort(signal); if (disposed) throw new EngineError('DISPOSED','Pixel cache owner disposed.'); };
  const retryRetirements = async () => {
    for(const store of [...orphanStores]) {await store.dispose();orphanStores.delete(store);}
    for (const entry of [...retirements]) {
      await entry.file.dispose(); retirements.delete(entry);
    }
  };
  function createFile() {
    alive();
    let length = 0, dead = false, closingFile, operation, extents = [];
    const live = () => { alive(); if (dead) throw new EngineError('DISPOSED','Pixel cache file disposed.'); };
    const file = {
      get byteLength() { return length; },
      get busy() { return !!operation; },
      get residentBytes(){return extents.reduce((n,{store})=>n+(store.storage==='memory'?store.byteLength:0),0);},
      get backing() { return extents.map(({start,store}) => ({start,byteLength:store.byteLength,storage:store.storage})); },
      ensureLength(nextLength) {
        live(); requireValue(Number.isSafeInteger(nextLength) && nextLength >= length,
          'Pixel cache extent must grow monotonically.');
        if (nextLength === length) return;
        if (operation) throw new EngineError('BUSY','Pixel cache file has active I/O.');
        const task = (async () => {
          await retryRetirements(); live();
          const extra = nextLength - length;
          if (extra > maximumLogicalBytes - logicalBytes)
            throw new EngineError('MEMORY_BUDGET','The actual pixel cache exceeds its admitted logical capacity.');
          // The parent reserves other simultaneous owners first. Use all useful
          // remaining RAM within this cache's separate, explicit allowance.
          let available = Math.max(0,budget.limit-budget.retained-budget.active);
          let ram = Math.min(extra,maximumResidentBytes-residentBytes(),available);
          if(extra>ram) {
            session ??= await getTemporarySession?.({signal}); live();
            if(!session)throw new EngineError('STORAGE_UNAVAILABLE','This admitted cache requires temporary backing.');
            if(session.backend!=='opfs'&&session.capability?.synchronous!==true) {
              const needed=migrationWorkspaceBytes(extra,session);
              if(!ioWorkspace||ioWorkspace.capacityBytes<needed) {
                const next=acquireMigrationWorkspace(budget,needed);
                const old=ioWorkspace;ioWorkspace=next;await old?.release();
              }
              ioCache??=createPixelCacheWindow({budget,pageBytes:session.snapshot?.().pageBytes??1024**2,
                runIO:operation=>ioWorkspace.run(operation,{signal})});
              available=Math.max(0,budget.limit-budget.retained-budget.active);
              ram=Math.min(extra,maximumResidentBytes-residentBytes(),available);
            }
          }
          const pending = []; let committed = false,primaryFailed=false;
          try {
            if (ram) pending.push({start:length,store:await createStore(ram,{budget,
              chunkBytes,storage:'memory',temporarySession:session,getTemporarySession,signal,
              owner:'native-core-cache',label:'core-cache-ram'})});
            if (extra > ram) pending.push({start:length+ram,store:await createStore(extra-ram,{budget,
              chunkBytes,storage:'temporary',temporarySession:session,signal,
              owner:'native-core-cache',label:'core-cache-temporary'})});
            live(); extents.push(...pending); length = nextLength;
            logicalBytes += extra; committed = true;
          } catch(error) {primaryFailed=true;throw error;} finally {
            if (!committed) {
              let failed = false, failure;
              for (const {store} of pending) try { await store.dispose(); }
              catch (error) {orphanStores.add(store);if (!failed) { failed = true; failure = error; } }
              if (failed&&!primaryFailed) throw failure;
            }
          }
        })();
        operation = task; task.then(() => { if(operation===task)operation=null; },
          () => { if(operation===task)operation=null; }); return task;
      },
      readInto(target,offset=0) { return transfer(target,offset,false); },
      write(source,offset=0) { return transfer(source,offset,true); },
      flush() {
        live(); if (operation) throw new EngineError('BUSY','Pixel cache file has active I/O.');
        const execute = index => {
          while(index<extents.length) {
            const store=extents[index++].store;
            const cached=ioCache?.flushStore(store);
            const result=thenable(cached)?cached.then(()=>store.flush()):store.flush();
            if(thenable(result))return result.then(()=>execute(index));
          }
        };
        return track(execute(0));
      },
      dispose() {
        if (closingFile) return closingFile;
        dead = true;
        const task = (async () => {
          if(operation)await Promise.allSettled([operation]);
          let failed=false,failure;
          for(const entry of [...extents]) {
            try {
              ioCache?.dropStore(entry.store);
              await entry.store.dispose();
              extents.splice(extents.indexOf(entry),1);
              logicalBytes-=entry.store.byteLength;
            } catch(error) { if(!failed){failed=true;failure=error;} }
          }
          if(failed)throw failure;
          files.delete(file); length=0;
        })();
        closingFile=task; task.catch(()=>{if(closingFile===task)closingFile=null;}); return task;
      },
    };
    function track(result) {
      if(!thenable(result))return result;
      operation=result; result.then(()=>{if(operation===result)operation=null;},
        ()=>{if(operation===result)operation=null;}); return result;
    }
    function transfer(view,offset,writing) {
      live(); requireValue(ArrayBuffer.isView(view) && !(view instanceof DataView)
        && Number.isSafeInteger(offset) && offset>=0,
      'Invalid Core cache byte window.');
      if(operation)throw new EngineError('BUSY','Pixel cache file has active I/O.');
      const data=bytes(view),count=writing?data.length:Math.min(data.length,Math.max(0,length-offset));
      requireValue(!writing||offset<=length-data.length,'Core cache write exceeds its admitted extent.');
      let done=0,index=0;
      while(index<extents.length&&offset>=extents[index].start+extents[index].store.byteLength)++index;
      const execute=reserve=>{
        while(done<count) {
          live(); const {start,store}=extents[index];
          const at=offset+done-start,n=Math.min(count-done,store.byteLength-at);
          const part=data.subarray(done,done+n);
          const result=store.storage==='temporary'&&ioCache
            ? writing?ioCache.write(store,part,at):ioCache.readInto(store,part,at)
            : writing?store.write(part,at,{signal,reserve}):store.readInto(part,at,{signal,reserve});
          const commit=()=>{
            done+=n;if(store.storage==='temporary'){if(writing)diskWritten+=n;else diskRead+=n;}
            if(writing)writtenBytes+=n;else readBytes+=n;
            if(at+n===store.byteLength)++index;
          };
          if(thenable(result))return result.then(()=>{commit();live();return execute(reserve);});
          commit();
        }
        return count;
      };
      const touchesTemporary=extents.some(entry=>entry.store.storage==='temporary'
        &&offset<entry.start+entry.store.byteLength&&offset+count>entry.start);
      return track(touchesTemporary&&ioWorkspace&&!ioCache?ioWorkspace.run(execute,{signal}):execute());
    }
    files.add(file);++created;return file;
  }
  return {
    createFile,
    retire(file) {
      requireValue(files.has(file),'This cache file belongs to another owner.');
      let entry=[...retirements].find(entry=>entry.file===file);
      if(!entry){entry={file};retirements.add(entry);}
      const task=file.dispose();task.then(()=>retirements.delete(entry),()=>{});return task;
    },
    drainRetirements:retryRetirements,
    metrics(){return {residentBytes:residentBytes(),logicalBytes,openFiles:files.size,createdFiles:created,
      pendingRetirements:retirements.size,diskWrittenBytes:diskWritten,diskReadBytes:diskRead,
      orphanStores:orphanStores.size,ioWorkspaceBytes:ioWorkspace?.capacityBytes??0,
      ioCache:ioCache?.metrics()??null,
      readBytes,writtenBytes,disposed};},
    dispose(){
      if(closing)return closing;disposed=true;
      const task=(async()=>{
        let failed=false,failure;
        for(const file of [...files])try{await this.retire(file);}
        catch(error){if(!failed){failed=true;failure=error;}}
        for(const store of [...orphanStores])try{await store.dispose();orphanStores.delete(store);}
        catch(error){if(!failed){failed=true;failure=error;}}
        if(!failed&&ioCache){ioCache.dispose();ioCache=null;}
        if(!failed&&ioWorkspace){await ioWorkspace.release();ioWorkspace=null;}
        if(failed)throw failure;
      })();
      closing=task;task.catch(()=>{if(closing===task)closing=null;});return task;
    },
  };
}
