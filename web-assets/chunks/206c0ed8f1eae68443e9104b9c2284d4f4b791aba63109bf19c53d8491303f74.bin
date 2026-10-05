import "../../runtime-context.js?v=0.14.5";
import {requireValue,EngineError,checkAbort,controlCheckpoint} from './errors.js';
const f=Math.fround,scaleFloor=[16,.25,.25,.25,8,.25],profileFloor=[.08,.08,.08,.06,.06];
function median(values,float32=false){values.sort((a,b)=>a-b);const k=values.length>>1;return values.length%2?values[k]:float32?f(f(values[k-1]+values[k])*.5):(values[k-1]+values[k])*.5;}
export function createElaPeerScorer({budget,wasmBinary}={}){
 requireValue(typeof budget?.reserve==='function','Shared budget required');let module,heapRelease,busy=false,disposed=false;
 async function ensure(){if(module)return module;const free=budget.reserve(64*1024**2);try{const {default:create}=await import('../vendor/ela-peers/peers.js');module=await create(wasmBinary?{wasmBinary}:{});heapRelease=free;return module;}catch(e){free();throw e;}}
 return {
  async score({rows,cols,content,profiles,supported,kind='legacy',qualities=3},{signal,onProgress}={}){
   if(busy)throw new EngineError('BUSY','ELA peer scorer busy');requireValue(!disposed,'ELA peer scorer disposed');
   const n=rows*cols,descriptors=kind==='legacy'?5:kind==='background'?3:1;
   requireValue(['legacy','background','ghost'].includes(kind)&&Number.isInteger(rows)&&rows>0&&Number.isInteger(cols)&&cols>0&&Number.isSafeInteger(n)&&n<=16384&&Number.isInteger(qualities)&&qualities>0&&qualities<=101&&(kind==='ghost'?qualities===71:qualities===3),'ELA peer domain');
   requireValue(content instanceof Float32Array&&content.length===n*6&&content.every(Number.isFinite)&&supported instanceof Uint8Array&&supported.length===n&&supported.every(v=>v<=1),'Content descriptors/support required');
   requireValue(profiles instanceof (kind==='ghost'?Float64Array:Float32Array)&&profiles.length===n*qualities*descriptors&&profiles.every(Number.isFinite),'Residual profiles required');
   checkAbort(signal);busy=true;let workspace,outputRelease,m,tree=0,pa=0,qa=0,da=0,ia=0,complete=false;
   try{
    const bytes=n*(kind==='legacy'?qualities*24+4:kind==='background'?8+qualities*28+1:11);outputRelease=budget.reserve(bytes);
    const fields=kind==='legacy'?{quality_scores:new Float32Array(n*qualities),signed_scores:new Float32Array(n*qualities*5),peer_count:new Int32Array(n)}:kind==='background'?{background_score:new Float32Array(n),background_quality_scores:new Float32Array(n*qualities),background_signed_scores:new Float32Array(n*qualities*3),background_reference:new Float32Array(n*qualities*3),background_peer_count:new Int32Array(n),background_supported:new Uint8Array(n)}:{ghost_score:new Float32Array(n),ghost_quality:new Int16Array(n),ghost_peer_count:new Int32Array(n),ghost_supported:new Uint8Array(n)};
    workspace=budget.reserve(n*224+qualities*descriptors*64*24+256*1024);
    const ids=[];for(let i=0;i<n;i++)if(supported[i])ids.push(i);
    if(ids.length>=17){
     const normalized=new Float64Array(n*6),center=[],scale=[],floor=[];
     for(let d=0;d<6;d++){center[d]=median(ids.map(i=>content[i*6+d]),true);const mad=median(ids.map(i=>Math.abs(f(content[i*6+d]-center[d]))),true);scale[d]=Math.max(f(f(1.4826)*mad),scaleFloor[d]);}
     for(let i=0;i<n;i++)for(let d=0;d<6;d++)normalized[i*6+d]=f(content[i*6+d]-center[d])/scale[d]/Math.sqrt(6);
     if(kind==='legacy')for(let q=0;q<qualities;q++)for(let d=0;d<descriptors;d++){const at=q*descriptors+d,med=median(ids.map(i=>profiles[i*qualities*descriptors+at]),true),mad=median(ids.map(i=>Math.abs(f(profiles[i*qualities*descriptors+at]-med))),true);floor[at]=Math.max(f(f(.1*1.4826)*mad),profileFloor[d]);}
     m=await ensure();checkAbort(signal);const k=Math.min(128,ids.length),batch=128;pa=m._malloc(ids.length*6*8);qa=m._malloc(batch*6*8);da=m._malloc(batch*k*8);ia=m._malloc(batch*k*4);
     if(!pa||!qa||!da||!ia)throw new EngineError('MEMORY_LIMIT','ELA nearest-peer allocation failed');
     for(let j=0;j<ids.length;j++)m.HEAPF64.set(normalized.subarray(ids[j]*6,ids[j]*6+6),pa/8+j*6);
     tree=m._ela_peers_create(pa,ids.length,6);if(!tree)throw new EngineError('COMPUTE_FAILED','ELA cKDTree construction failed');
     const limit=kind==='legacy'?1.25:kind==='background'?.4:.5,spatial=Math.max(2,Math.floor(Math.min(rows,cols)/5));
     for(let lo=0;lo<n;lo+=batch){
      await controlCheckpoint(signal);const count=Math.min(batch,n-lo);m.HEAPF64.set(normalized.subarray(lo*6,(lo+count)*6),qa/8);
      if(!m._ela_peers_query(tree,qa,count,k,da,ia))throw new EngineError('COMPUTE_FAILED','ELA cKDTree query failed');
      for(let row=0;row<count;row++){
       const index=lo+row,peers=[];for(let j=0;j<k&&peers.length<64;j++){const other=ids[m.HEAP32[ia/4+row*k+j]],distance=m.HEAPF64[da/8+row*k+j];if(distance<=limit&&Math.max(Math.abs(Math.floor(other/cols)-Math.floor(index/cols)),Math.abs(other%cols-index%cols))>spatial)peers.push(other);}
       if(kind==='legacy')fields.peer_count[index]=supported[index]?peers.length:0;
       if(!supported[index]||peers.length<16)continue;
       if(kind==='background'){fields.background_peer_count[index]=peers.length;fields.background_supported[index]=1;}
       if(kind==='ghost'){fields.ghost_peer_count[index]=peers.length;fields.ghost_supported[index]=1;}
       const z=new Float64Array(qualities*descriptors);
       for(let q=0;q<qualities;q++)for(let d=0;d<descriptors;d++){
        const at=q*descriptors+d,values=peers.map(i=>profiles[i*qualities*descriptors+at]),ref=median(values,kind!=='ghost'),mad=median(values.map(v=>Math.abs(kind==='ghost'?v-ref:f(v-ref))),kind!=='ghost');
        const scaledMad=kind==='ghost'?1.4826*mad:f(f(1.4826)*mad),own=profiles[index*qualities*descriptors+at];
        if(kind==='legacy'){z[at]=f(own-ref)/Math.max(scaledMad,floor[at]);fields.signed_scores[index*qualities*descriptors+at]=z[at];}
        else if(kind==='background'){z[at]=f(f(ref-own)/Math.max(scaledMad,f(.1)));fields.background_signed_scores[index*qualities*descriptors+at]=z[at];fields.background_reference[index*qualities*descriptors+at]=ref;}
        else z[at]=Math.max(0,(ref-own)/Math.max(scaledMad,.10));
       }
       if(kind==='legacy')for(let q=0;q<qualities;q++){const a=Array.from(z.subarray(q*5,q*5+5),Math.abs).sort((a,b)=>a-b);fields.quality_scores[index*qualities+q]=Math.sqrt((a[3]*a[3]+a[4]*a[4])/2);}
       else if(kind==='background'){const qs=[];for(let q=0;q<qualities;q++){const v=median(Array.from(z.subarray(q*3,q*3+3)),true);fields.background_quality_scores[index*qualities+q]=v;qs.push(v);}fields.background_score[index]=Math.max(0,median(qs,true));}
       else{let best=0,quality=0;for(let q=1;q<qualities-1;q++){const v=median([z[q-1],z[q],z[q+1]]);if(v>best){best=v;quality=q;}}fields.ghost_score[index]=best;fields.ghost_quality[index]=quality+30;}
      }
      onProgress?.(Math.min(1,(lo+count)/n));
     }
    }
    checkAbort(signal);complete=true;return {rows,cols,...fields,release:outputRelease};
   }finally{if(tree)m._ela_peers_release(tree);if(m)for(const p of [pa,qa,da,ia])if(p)m._free(p);workspace?.();if(!complete)outputRelease?.();busy=false;}
  },
  dispose(){if(busy)throw new EngineError('BUSY','ELA peer scorer busy');module=null;heapRelease?.();heapRelease=null;disposed=true;}
 };
}
