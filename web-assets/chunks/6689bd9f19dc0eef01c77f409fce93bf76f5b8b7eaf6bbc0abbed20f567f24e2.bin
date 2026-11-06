import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {LiveMemoryPolicy} from './live-memory-policy.js';
import {cooperator} from './sherloq7c-math.js';

const MiB=1024**2,GiB=1024**3;
// Source banks remain private: only this module's renderer may borrow their
// synchronous row access. No mutable source view is added to the public API.
const sourceRows=new WeakMap();
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const metricSnapshot=value=>{const copy=structuredClone(value),freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};return freeze(copy);};
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','Resident operation cancelled.');};
export function createResidentMemoryPolicy({budget,memoryBudgetBytes,resourceHints={},profile='maximum',ceilingBytes=4_000_000_000,segmentBytes=32*MiB}={}){
 if(!Number.isSafeInteger(ceilingBytes)||ceilingBytes<=0||!Number.isSafeInteger(segmentBytes)||segmentBytes<65536||segmentBytes>64*MiB)throw fail('INVALID_INPUT','Invalid resident memory policy.');
 ceilingBytes=Math.min(ceilingBytes,4_000_000_000);
 const resolved=resolveComputeProfile(profile,resourceHints);
 const limit=Math.min(ceilingBytes,memoryBudgetBytes??resolved.memoryBudgetBytes);
 if(!Number.isSafeInteger(limit)||limit<=0)throw fail('INVALID_INPUT','Positive memory budget required.');
 budget??=new Budget(limit);
 if(budget.limit>limit){if(typeof budget.setLimit!=='function')throw fail('INVALID_INPUT','Shared memory budget must support admission updates.');budget.setLimit(limit);}
 const live=new LiveMemoryPolicy(budget,{profile,ceiling:Math.min(ceilingBytes,memoryBudgetBytes??Infinity)});
 return {budget,segmentBytes,allowTemporaryStorage:false,source:memoryBudgetBytes?'explicit':resolved.memoryBudgetSource,
  updateResourceHints:hints=>live.update(hints),snapshot:()=>({...live.snapshot(),segmentBytes,allowTemporaryStorage:false,allocationGuarantee:false})};
}

// Every segment is actual useful storage. There is no capacity probe, storage
// backend, allocation-size benchmark, or automatic temporary-file fallback.
export async function createResidentArray(Type,length,{budget,segmentBytes=32*MiB,signal,label='7C resident array'}={}){
 const bytes=length*Type.BYTES_PER_ELEMENT;
 if(![Uint8Array,Uint16Array,Uint32Array,Int32Array,Float64Array].includes(Type)||!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(bytes)||!Number.isSafeInteger(segmentBytes)||segmentBytes<64||segmentBytes>64*MiB||!budget?.reserve)throw fail('INVALID_INPUT','Invalid resident array.');
 check(signal);const release=budget.reserve(bytes),segments=[],backings=[],elements=Math.floor(segmentBytes/Type.BYTES_PER_ELEMENT),cooperate=cooperator(signal);
 let closed=false,retiring=false,retirementBusy=false;
 const retire=()=>{if(closed||retirementBusy)return;retiring=true;retirementBusy=true;try{segments.length=0;while(backings.length){backings[0]?.();backings.shift();}release();closed=true;retiring=false;}finally{retirementBusy=false;}};
 try{
  for(let offset=0;offset<length;offset+=elements){
   check(signal);const extent=Math.min(elements,length-offset);
   try{const segment=new Type(extent);segments.push(segment);backings.push(budget.registerBacking?.('array-buffer',segment.byteLength,{owner:'sherloq7c-resident',label,identity:segment.buffer}));}catch(cause){if(!(cause instanceof RangeError))throw cause;throw fail('MEMORY_ALLOCATION','Unable to allocate '+label,{allocationKind:'array-buffer',requestedBytes:extent*Type.BYTES_PER_ELEMENT,segmentBytes:elements*Type.BYTES_PER_ELEMENT});}
   await cooperate();
  }
 }catch(error){try{retire();}catch(cleanupError){const failure=new AggregateError([error,cleanupError],'Resident array construction and retirement failed.',{cause:error});failure.code=error?.code??'CLEANUP_FAILED';failure.cleanupError=cleanupError;failure.retryCleanup=retire;throw failure;}throw error;}
 const open=()=>{if(closed||retiring)throw fail('DISPOSED','Resident array is closed or retiring.');};
 const range=(offset,count)=>{open();if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<0||offset>length-count)throw fail('INVALID_INPUT','Resident array range exceeds its extent.');};
 const bank={Type,length,byteLength:bytes,segmentElements:elements,segments,
  get(index){range(index,1);return segments[Math.floor(index/elements)][index%elements];},
  set(index,value){range(index,1);segments[Math.floor(index/elements)][index%elements]=value;},
  readInto(out,offset=0){if(!(out instanceof Type))throw fail('INVALID_INPUT','Resident array type mismatch.');range(offset,out.length);if(segments.some(segment=>segment.buffer===out.buffer))throw fail('INVALID_INPUT','Resident reads require an independent destination buffer.');let done=0;while(done<out.length){const at=offset+done,k=Math.floor(at/elements),within=at%elements,count=Math.min(out.length-done,segments[k].length-within);out.set(segments[k].subarray(within,within+count),done);done+=count;}return out;},
  write(input,offset=0){if(!(input instanceof Type))throw fail('INVALID_INPUT','Resident array type mismatch.');range(offset,input.length);if(segments.some(segment=>segment.buffer===input.buffer))throw fail('INVALID_INPUT','Resident writes require an independent source buffer.');let done=0;while(done<input.length){const at=offset+done,k=Math.floor(at/elements),within=at%elements,count=Math.min(input.length-done,segments[k].length-within);segments[k].set(input.subarray(done,done+count),within);done+=count;}},
  dispose:retire
 };return bank;
}

// readRows writes directly into an admitted resident segment. It must finish
// before that segment is published. It is an input reader, never a disk sink.
export async function createResidentRgb16({width,height,data,immutable=false,readRows,passes=1},{budget,segmentBytes=32*MiB,signal}={}){
 const N=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(N)||N>=2**31||!budget?.reserve)throw fail('INVALID_INPUT','Invalid native RGB16 dimensions or budget.');
 if(data!==undefined&&(!(data instanceof Uint16Array)||data.length!==3*N))throw fail('INVALID_INPUT','Invalid RGB16 extent.');
 if(!Number.isInteger(passes)||passes<1||passes>7)throw fail('INVALID_INPUT','Resident source requires one to seven decode passes.');
 if(data===undefined&&typeof readRows!=='function')throw fail('INVALID_INPUT','RGB16 data or a row reader is required.');
 if(data&&!immutable)throw fail('INVALID_INPUT','A borrowed resident RGB16 source must be immutable; use a row reader to create an owned source.');
 check(signal);let bank,flat=data,release,backing,constructionCleanup,refs=1,closed=false,retirementStarted=false,retirementBusy=false;
 data=undefined;
 const retire=()=>{
  if(closed||retirementBusy)return;retirementStarted=true;retirementBusy=true;flat=null;readRows=undefined;
  const errors=[],attempt=fn=>{try{fn();}catch(error){errors.push(error);}};
  try{
   if(constructionCleanup)attempt(()=>{constructionCleanup();constructionCleanup=null;});
   if(bank)attempt(()=>{bank.dispose();bank=null;});
   if(backing)attempt(()=>{backing();backing=null;});
   // The reservation stays owned until the corresponding backing acknowledges retirement.
   if(!backing&&release)attempt(()=>{release();release=null;});
   if(errors.length===1)throw errors[0];
   if(errors.length>1)throw new AggregateError(errors,'Resident RGB16 retirement failed.');
   closed=true;
  }finally{retirementBusy=false;}
 };
 const releaseReference=()=>{let live=true;return()=>{if(live){live=false;refs--;}if(refs===0)retire();};};
 const releaseInitial=releaseReference();
 const rowsPerSegment=Math.max(1,Math.floor(segmentBytes/(width*6))),samplesPerSegment=rowsPerSegment*width*3;
 try{
  if(flat){release=budget.reserve(flat.buffer.byteLength);backing=budget.registerBacking?.('array-buffer',flat.buffer.byteLength,{owner:'sherloq7c-resident',label:'borrowed RGB16 source',identity:flat.buffer});}
  else{
   bank=await createResidentArray(Uint16Array,3*N,{budget,segmentBytes:samplesPerSegment*2,signal,label:'resident RGB16 source'});
   for(let pass=0;pass<passes;pass++)for(let k=0;k<bank.segments.length;k++){check(signal);const target=bank.segments[k],top=k*rowsPerSegment,rows=target.length/(3*width);await readRows(top,rows,target,{signal,pass});check(signal);}
  }
 }catch(error){
  refs=0;if(typeof error?.retryCleanup==='function')constructionCleanup=error.retryCleanup;
  try{retire();}catch(cleanupError){
   const failure=new AggregateError([error,cleanupError],'Resident RGB16 construction and retirement failed.',{cause:error});
   failure.code=error?.code??'CLEANUP_FAILED';failure.cleanupError=cleanupError;failure.retryCleanup=retire;throw failure;
  }throw error;
 }
 readRows=undefined;
 const open=()=>{if(closed||retirementStarted)throw fail('DISPOSED','Resident RGB16 source is closed or retiring.');};
 const sample=flat?i=>flat[i]:i=>bank.segments[Math.floor(i/samplesPerSegment)][i%samplesPerSegment];
 const source={width,height,byteLength:6*N,immutable:true,nativeBitDepth:16,storage:'memory',
  get data(){open();return flat;},
  readRgb16Span(target,firstSample=0){
   open();if(!(target instanceof Uint16Array)||!Number.isSafeInteger(firstSample)||firstSample<0||firstSample>3*N-target.length)throw fail('INVALID_INPUT','Invalid RGB16 destination span.');
   if(flat){if(target.buffer===flat.buffer)throw fail('INVALID_INPUT','RGB16 span reads require an independent destination.');target.set(flat.subarray(firstSample,firstSample+target.length));return target;}
   return bank.readInto(target,firstSample);
  },
  sampleAt(index){open();if(!Number.isSafeInteger(index)||index<0||index>=3*N)throw fail('INVALID_INPUT','RGB16 sample outside source.');return sample(index);},
  maxAt(index){open();const at=index*3;if(flat)return Math.max(flat[at],flat[at+1],flat[at+2]);const k=Math.floor(at/samplesPerSegment),within=at-k*samplesPerSegment,segment=bank.segments[k];return Math.max(segment[within],segment[within+1],segment[within+2]);},
  retain(){open();refs++;return releaseReference();},
  release:releaseInitial,
  memory(){return{sourceBytes:6*N,borrowed:!!flat,segments:bank?.segments.length??(flat?1:0),references:refs,closed,retirementPending:retirementStarted&&!closed};}
 };
 sourceRows.set(source,(first,count)=>{
  open();const at=first*3;
  if(flat)return{samples:flat,offset:at};
  const k=Math.floor(at/samplesPerSegment),offset=at-k*samplesPerSegment,samples=bank.segments[k];
  if(offset+3*count>samples.length)throw fail('INVALID_INPUT','A private RGB source span must stay within its row segment.');
  return{samples,offset};
 });
 return source;
}

// Original global component values are rendered on demand. A result owns its
// dependencies until release; individual read windows have separate leases.
export function createResidentOutput(source,scalarAt,{budget,metrics={},releaseState=()=>{},maxWindowBytes=64*MiB}={}){
 if(typeof scalarAt!=='function'||!budget?.reserve)throw fail('INVALID_INPUT','Certified scalar state and budget required.');
 // Capture the optional synchronous span reader once, with the immutable view.
 let readSpan=typeof scalarAt.readSpan==='function'?scalarAt.readSpan.bind(scalarAt):null;
 let readSourceRow=sourceRows.get(source)??null;
 const publicMetrics=metricSnapshot(metrics);const releaseSource=source.retain(),windowRetirements=new Set();let closed=false,releaseRequested=false,stateRetired=false,pending=0,activePipes=0,retiring=null;
 const output={width:source.width,height:source.height,bitDepth:16,storage:'memory',materialized:false,metrics:publicMetrics,
  async readWindow({x=0,y=0,width,height},{format='rgb16',includeScalar=false,signal}={}){
   if(closed||releaseRequested)throw fail('DISPOSED','Resident result is closed or retiring.');
   if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x>source.width-width||y>source.height-height||!['rgb16','rgb8'].includes(format))throw fail('INVALID_INPUT','Invalid result window.');
   const pixels=width*height,bytes=pixels*((format==='rgb16'?6:3)+(includeScalar?8:0));
   if(bytes>maxWindowBytes)throw fail('MEMORY_LIMIT','Result window exceeds the bounded read size.',{requestedBytes:bytes,maxWindowBytes});
   check(signal);const free=budget.reserve(bytes),backings=[];pending++;let data,scalar,window,windowRetired=false,windowRetiring=false;
   const retireWindow=()=>{
    if(windowRetired||windowRetiring)return;windowRetiring=true;data=scalar=null;if(window)window.data=window.scalar=null;
    try{while(backings.length){backings[0]?.();backings.shift();}free();windowRetired=true;windowRetirements.delete(retireWindow);}
    catch(error){windowRetirements.add(retireWindow);throw error;}finally{windowRetiring=false;}
   };
   try{
    try{data=format==='rgb16'?new Uint16Array(3*pixels):new Uint8Array(3*pixels);scalar=includeScalar?new Float64Array(pixels):null;}catch(cause){if(!(cause instanceof RangeError))throw cause;throw fail('MEMORY_ALLOCATION','Resident result window allocation failed.',{allocationKind:'array-buffer',requestedBytes:bytes});}
    for(const array of [data,scalar])if(array)backings.push(budget.registerBacking?.('array-buffer',array.byteLength,{owner:'sherloq7c-resident',label:'result window',identity:array.buffer}));
    const cooperate=cooperator(signal);
    for(let row=0;row<height;row++){
     if(readSourceRow){
      const start=(y+row)*source.width+x,{samples,offset}=readSourceRow(start,width),rgb16=format==='rgb16',maximum=rgb16?65535:255;
      for(let first=0;first<width;first+=32768){
       const count=Math.min(32768,width-first),span=readSpan?readSpan(start+first,count):null;
       if(readSpan&&(!(span instanceof Float64Array)||span.length!==count))throw fail('INVALID_INPUT','A synchronous scalar span must contain the requested Float64 samples.');
       // Read RGB once. The three source channels and their maximum use the
       // same row bank; no repeated segment lookup or public sample checks.
       for(let col=0;col<count;col++){
        const index=start+first+col,at=row*width+first+col,sampleAt=offset+3*(first+col),a=samples[sampleAt],b=samples[sampleAt+1],c=samples[sampleAt+2];
        const v=Math.max(a,b,c)/65535,z=span?span[col]:scalarAt(index),gain=v?z/v:0,out=3*at;
        if(scalar)scalar[at]=v?z:0;
        // Keep multiplication before division exactly as in the reference:
        // folding /257 into gain could change a rounding boundary in RGB8.
        data[out]=Math.max(0,Math.min(maximum,Math.round(rgb16?a*gain:a*gain/257)));
        data[out+1]=Math.max(0,Math.min(maximum,Math.round(rgb16?b*gain:b*gain/257)));
        data[out+2]=Math.max(0,Math.min(maximum,Math.round(rgb16?c*gain:c*gain/257)));
       }
      }
     }else if(readSpan){
      for(let first=0;first<width;first+=32768){
       const count=Math.min(32768,width-first),start=(y+row)*source.width+x+first,span=readSpan(start,count);
       if(!(span instanceof Float64Array)||span.length!==count)throw fail('INVALID_INPUT','A synchronous scalar span must contain the requested Float64 samples.');
       // A native span borrows shared scratch. No await or next span read may
       // occur until all samples in this fragment have been consumed.
       for(let col=0;col<count;col++){
        const index=start+col,at=row*width+first+col,v=source.maxAt(index)/65535,z=span[col],gain=v?z/v:0;
        if(scalar)scalar[at]=v?z:0;
        for(let channel=0;channel<3;channel++){const value=source.sampleAt(3*index+channel)*gain;data[3*at+channel]=format==='rgb16'?Math.max(0,Math.min(65535,Math.round(value))):Math.max(0,Math.min(255,Math.round(value/257)));}
       }
      }
     }else for(let col=0;col<width;col++){
      const index=(y+row)*source.width+x+col,at=row*width+col,v=source.maxAt(index)/65535,z=scalarAt(index),gain=v?z/v:0;
      if(scalar)scalar[at]=v?z:0;
      for(let channel=0;channel<3;channel++){const value=source.sampleAt(3*index+channel)*gain;data[3*at+channel]=format==='rgb16'?Math.max(0,Math.min(65535,Math.round(value))):Math.max(0,Math.min(255,Math.round(value/257)));}
     }
     await cooperate();
    }
    check(signal);window={x,y,width,height,format,data,scalar,byteLength:bytes,release:retireWindow};return window;
   }catch(error){try{retireWindow();}catch(cleanupError){const failure=new AggregateError([error,cleanupError],'Resident window construction and retirement failed.',{cause:error});failure.code=error?.code??'CLEANUP_FAILED';failure.cleanupError=cleanupError;failure.retryCleanup=retireWindow;throw failure;}throw error;}finally{pending--;}
  },
  async pipeRows(writable,{rows=64,format='rgb16',signal,onProgress}={}){
   if(closed||releaseRequested)throw fail('DISPOSED','Resident result is closed or retiring.');
   if(!Number.isSafeInteger(rows)||rows<1||!writable?.getWriter)throw fail('INVALID_INPUT','A WritableStream and positive row count are required.');
   const writer=writable.getWriter();activePipes++;
   try{
    for(let y=0;y<source.height;y+=rows){const window=await output.readWindow({x:0,y,width:source.width,height:Math.min(rows,source.height-y)},{format,signal});try{await writer.write(window.data);check(signal);}finally{window.release();}onProgress?.({rows:Math.min(source.height,y+rows),totalRows:source.height});}
    await writer.close();
   }catch(error){try{await writer.abort(error);}catch{}throw error;}finally{activePipes--;writer.releaseLock();}
  },
  async pipePng(writable,options={}){
   if(closed||releaseRequested)throw fail('DISPOSED','Resident result is closed or retiring.');activePipes++;
   try{const {pipeResidentPng}=await import('./sherloq7c-resident-png.js');return await pipeResidentPng(output,writable,{...options,budget});}finally{activePipes--;}
  },
  async release(){if(closed){for(const cleanup of [...windowRetirements])cleanup();return;}if(retiring)return retiring;if(pending||activePipes)throw fail('BUSY','Await active result reads or output streams before releasing their state.');releaseRequested=true;retiring=Promise.resolve().then(async()=>{for(const cleanup of [...windowRetirements])cleanup();if(!stateRetired){await releaseState();stateRetired=true;}releaseSource();closed=true;scalarAt=null;readSpan=null;readSourceRow=null;releaseState=null;source=null;}).finally(()=>{retiring=null;});return retiring;}
 };return output;
}
