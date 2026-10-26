import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {segmentedNeuralProjection} from './segmented-neural-projection.js';
import {createNeuralSpatialRows} from './neural-spatial-rows.js';
import {createSegmentedBytes} from './segmented-bytes.js';
// Native per-context bilinear/nearest projection is performed by the common
// projector in its existing whole-image mode (which admits 1px dimensions).
// The literal disjoint contexts are then placed on the same Original grid.
// This is result composition, never an RGB atlas or an independent learned head.
export function createMgcfdnProductProjection({budget,onOwner,side=256}={}){
 requireValue([256,512].includes(side),'Original native sigmoid projection side required');
 const pending=new Set(),creating=new Set();let spatial,closing,closed=false,running;const controller=new AbortController();
 const hold=owner=>{pending.add(owner);return owner;};
 const owner={release(){if(closing)return closing;if(closed)return Promise.resolve();controller.abort();closing=Promise.resolve().then(async()=>{try{await running;}catch{}await Promise.allSettled([...creating]);let failed=false,first;for(const o of [...pending].reverse())try{await(o.release?o.release():o.dispose());pending.delete(o);}catch(e){if(!failed){failed=true;first=e;}}if(failed)throw first;if(spatial){await spatial.dispose();spatial=undefined;}closed=true;}).finally(()=>closing=undefined);return closing;}};onOwner?.(owner);
 async function makeStore(bytes,options){const task=createSegmentedBytes(bytes,options).then(s=>{hold(s);return s;});creating.add(task);try{return await task;}finally{creating.delete(task);}}
 async function work({width,height,origin=[0,0],contexts,candidateDomain,metadata,temporarySession,getTemporarySession},{signal:externalSignal,onProgress}={}){
  const signal=AbortSignal.any([controller.signal,...(externalSignal?[externalSignal]:[])]);
  requireValue(!closed&&contexts.length>0,'Current literal MGCFDN projection required');checkAbort(signal);
  const n=width*height,stores={};for(const key of ['map','mask','analyzed','candidates'])stores[key]=await makeStore(n*(key==='map'?4:1),{budget,temporarySession,getTemporarySession,signal,owner:'mgcfdn-product',label:key});
  if(!spatial){const{default:factory}=await import('../vendor/segmentation/spatial-bands.js');spatial=await createNeuralSpatialRows(factory,{budget});}
  const rows=Math.max(1,Math.floor(262144/width)),free=budget.reserve(width*rows*7);let zones=[],positive=0;
  try{
   for(const item of contexts){
    const b=item.context.bounds,w=b[2]-b[0],h=b[3]-b[1],dx=b[0]-origin[0],dy=b[1]-origin[1];requireValue(dx>=0&&dy>=0&&dx+w<=width&&dy+h<=height,'Context projection outside Original output grid');
    let carrier;const local=await segmentedNeuralProjection({family:'segmentation',width:w,height:h,zones:[{id:item.context.id,bounds:[0,0,w,h],raw:item.probability}],side,kind:'sigmoid',mode:'whole-image'},{budget,spatial,signal,onProgress,temporarySession,getTemporarySession,onRetirementOwner:o=>{carrier=o;hold(o);}});hold(local);
    for(let y=0;y<h;y+=rows){checkAbort(signal);const count=Math.min(rows,h-y),map=new Float32Array(w*count),mask=new Uint8Array(w*count),analyzed=new Uint8Array(w*count),candidates=new Uint8Array(w*count);await local.stores.map.readInto(new Uint8Array(map.buffer),y*w*4);await local.stores.mask.readInto(mask,y*w);
     for(let row=0;row<count;row++){for(let x=0;x<w;x++){const at=row*w+x,admitted=!candidateDomain||candidateDomain.containsOriginal(b[0]+x,b[1]+y+row);analyzed[at]=1;candidates[at]=admitted?1:0;if(!admitted){map[at]=0;mask[at]=0;}else positive+=mask[at]?1:0;}
      const offset=(dy+y+row)*width+dx;await stores.map.write(new Uint8Array(map.buffer,row*w*4,w*4),offset*4);for(const[key,data]of [['mask',mask],['analyzed',analyzed],['candidates',candidates]])await stores[key].write(data.subarray(row*w,(row+1)*w),offset);
     }
    }
    zones.push({id:item.context.id,kind:'native-context',bounds:[dx,dy,dx+w,dy+h],originalBounds:[...b],analysis_shape:[1,side,side],status:local.metadata.status});await local.dispose();pending.delete(local);pending.delete(carrier);
   }
   for(const s of Object.values(stores))await s.flush();checkAbort(signal);
   const result={width,height,stores,metadata:{...metadata,zones,boxes:zones.map(z=>z.bounds),threshold:.5,threshold_rule:'probability>0.5',probability_interpolation:'bilinear',mask_interpolation:'nearest',status:positive?'ok':'empty',positivePixels:positive,channel_order:['union_probability'],raw_filter_applied:false,coordinates:'source-region-native',originalOrigin:[...origin]},dispose:owner.release,release:owner.release};return result;
  }finally{free();}
 }
 function run(input,hooks){requireValue(!running&&!closed&&!closing,'MGCFDN projection is single-use');running=Promise.resolve().then(()=>work(input,hooks));return running;}
 return Object.freeze({run,release:owner.release});
}
