import "../../runtime-context.js?v=0.30.0";
import {createDenseTracePrefixCache} from './dense-trace-prefix-cache.js';
import {selectSparseTraceRows,traceSelectionWorkingBytes} from './sparse-trace-selection.js';
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners} from './dense-owner-retirement.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

// The existing Dense cache owns one value and its readers/credit. Here that
// value is the COMPLETE historical trace selection, not a second prefix cache.
// The result object belongs to the caller's published Native archive. A caller
// must keep this owner strongly adopted until dispose acknowledges retirement.
export function createRetainedSparseTraceCommands({result,budget}){
 requireValue(result&&typeof budget?.reserve==='function'&&typeof budget?.total==='function','A live Native archive and Budget are required.');
 const loans=new Set(),jobs=new Set();let closing=false,cache,optionalBytes=0,cacheGeneration=0;
 const stats={builds:0,hits:0,declines:0,frames:0};
 const optionalBudget={reserve(bytes){
  // Optional storage cannot evict a scientific artifact. This check and the
  // real reserve are synchronous; no other task can consume the headroom.
  if(budget.recovering||budget.limit-budget.total()<bytes)throw new EngineError('MEMORY_LIMIT','No unused headroom for retained trace commands.');
  const fee=budget.reserve(bytes);optionalBytes+=bytes;
  return onceDenseRetirement(async()=>{await acknowledgeDenseRetirement(fee);optionalBytes-=bytes;});
 }};
 const make=()=>{cacheGeneration++;return createDenseTracePrefixCache({result,budget:optionalBudget});};
 cache=make();
 const key=view=>({low:view.low??0,high:view.high??100000,minimum:view.minimum??4,chosen:view.chosen??[],hidden:view.hidden??[],selectionOverlap:view.traceOverlap??0,circleScale:view.circleScale??100});
 const retireIdle=async()=>{const old=cache;await old.dispose();if(cache===old&&!closing)cache=make();};
 const owner={
  // The endpoint calls this before its historical admissions. If the optional
  // entry would reduce their headroom, retire it before Budget can evict others.
  async prepareFrame(requiredBytes){requireValue(Number.isSafeInteger(requiredBytes)&&requiredBytes>=0,'Historical frame admission bound required.');if(closing)throw new EngineError('DISPOSED','Retained trace owner is retiring.');if(budget.limit-budget.total()<requiredBytes&&optionalBytes)await retireIdle();},
  async select(native,groups,view,{signal,reserveMemory}={}){
   requireValue(native===result&&!closing,'Retained trace commands require the same live Native archive.');checkAbort(signal);requireValue(typeof reserveMemory==='function','Historical frame admission is required.');
   let finish;const job=new Promise(resolve=>finish=resolve);jobs.add(job);const bytes=traceSelectionWorkingBytes(result,groups);let frameFree,reader,acknowledge;
   const ack=new Promise(resolve=>acknowledge=resolve),loan={published:false,requested:false,ack,release:null};
   const retire=onceDenseRetirement(async()=>{await retireDenseOwners([()=>reader?.release(),()=>frameFree?.()]);loans.delete(loan);acknowledge();});
   loan.release=()=>{loan.requested=true;return retire();};loans.add(loan);
   try{
    // Reserve the unchanged historical workspace before optional growth. Build
    // uses precisely this credit instead of reserving that same workspace twice.
    await owner.prepareFrame(bytes);checkAbort(signal);frameFree=reserveMemory(bytes);stats.frames++;
    const build=async()=>{
     stats.builds++;const value=await selectSparseTraceRows(result,groups,view.traceOverlap??0,{signal,circleScale:view.circleScale??100,reserveMemory:requested=>{requireValue(requested===bytes,'Trace selection workspace changed.');return()=>{};}});
     try{const {release,...complete}=value;return complete;}finally{await acknowledgeDenseRetirement(value.release);}
    };
    reader=await cache.forView(key(view)).acquire(result,groups,bytes,build,{signal});
    let selected,reused=false;
    if(reader){selected=reader.value;reused=reader.reused;if(reused)stats.hits++;}
    else{stats.declines++;selected=await build();}
    checkAbort(signal);if(closing)throw new EngineError('DISPOSED','Retained trace owner is retiring.');
    // Metadata returned to the client is fresh. Cached commands and palette
    // stay internal; the renderer only reads them, in its original order.
    const metadata=structuredClone(selected.metadata);
    metadata.retainedCommands={schema:'retained-sparse-trace-commands/1',reused,generation:cacheGeneration,sourceTiming:structuredClone(selected.metadata.timing)};
    if(reused){metadata.timing={geometryMs:0,paletteMs:0,selectionAndCommandsMs:0,totalMs:0};if(metadata.palette)metadata.palette.milliseconds=0;}
    loan.published=true;return{...selected,metadata,release:loan.release};
   }catch(primary){try{await loan.release();}catch{}throw primary;}
   finally{jobs.delete(job);finish();}
  },
  dispose:onceDenseRetirement(async()=>{closing=true;await Promise.all([...jobs].map(p=>p.catch(()=>{})));await retireDenseOwners([...loans].map(loan=>()=>loan.requested||!loan.published?loan.release():loan.ack));await cache.dispose();}),
  get stats(){return{...stats,closing,loans:loans.size,jobs:jobs.size,optionalBytes,cacheGeneration};}
 };
 return Object.freeze(owner);
}
