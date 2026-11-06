import "../../runtime-context.js?v=0.31.0";
import {tryGlobalHistogram100Gpu} from './equalization-global-histogram-gpu.js';
import {histogramEqualizationLut} from './equalization-histograms.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort,createCooperator,requireValue} from './errors.js';

// The same global HSV-V histogram and RGB ratio mapping, traversed in bounded
// contiguous bands. Neither statistics nor the scientific extent are sampled.
export async function globalHistogramSurface(source,{budget,signal,onProgress,contains=null,temporarySession,getTemporarySession,backend='cpu'}={}){
 const started=performance.now(),{width,height}=source.descriptor;
 requireValue(source.descriptor.format==='rgb8','Global HSV equalization requires RGB8.');
 requireValue(contains===null||typeof contains==='function','A valid equalization membership predicate is required.');
 // Only this exact Histogram100 route can borrow the optional GPU service.
 // A null result means that the unchanged bounded CPU path remains admitted.
 if(backend!=='cpu'){const gpu=await tryGlobalHistogram100Gpu(source,{budget,signal,onProgress,contains,backend,temporarySession,getTemporarySession});if(gpu)return gpu;}
 const release=budget.reserve(256*8+256+65536+65536),cooperate=createCooperator(signal);
 const histogram=new Float64Array(256),ratios=new Uint8Array(65536);
 const cap=Math.max(3,Math.min(4*1024**2,Math.floor(budget.limit/16/3)*3)),columns=Math.min(width,Math.floor(cap/3)),rows=columns===width?Math.max(1,Math.floor(cap/(width*3))):1;
 let store,surface,histogramWindows=0,renderWindows=0,writes=0,failed=false,primary;
 try{
  for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){
   await cooperate();checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),part=await source.readWindow({x,y,width:w,height:h},{signal});histogramWindows++;
   try{
    const data=part.pixels?.data;requireValue(part.pixels?.format==='rgb8'&&part.pixels.width===w&&part.pixels.height===h&&data instanceof Uint8Array&&data.length===w*h*3,'A complete RGB8 statistics window is required.');
    if(!contains){for(let i=0;i<data.length;i+=3)histogram[Math.max(data[i],data[i+1],data[i+2])]++;}
    else for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){if(((yy*w+xx)&4095)===0){await cooperate();checkAbort(signal);}if(contains(x+xx,y+yy)){const i=(yy*w+xx)*3;histogram[Math.max(data[i],data[i+1],data[i+2])]++;}}
   }finally{await part.release();}
   onProgress?.({phase:'equalization-statistics',fraction:Math.min(1,(y+h)/height)});
  }
  checkAbort(signal);const lut=histogramEqualizationLut(histogram,'histogram',100);
  // Retain the historical multiplication-then-division order and Math.round.
  // Computing these integer RGB mappings once avoids a division per channel.
  for(let v=0;v<256;v++){const next=lut[v],offset=v<<8;for(let c=0;c<256;c++)ratios[offset+c]=next===v?c:v?Math.max(0,Math.min(255,Math.round(c*next/v))):next;}
  store=await createSegmentedBytes(width*height*3,{budget,chunkBytes:cap,temporarySession,getTemporarySession,signal,owner:'equalization',label:'presentation-equalization'});
  for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){
   await cooperate();checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),part=await source.readWindow({x,y,width:w,height:h},{signal});renderWindows++;
   try{
    const data=part.pixels?.data;requireValue(part.pixels?.format==='rgb8'&&part.pixels.width===w&&part.pixels.height===h&&data instanceof Uint8Array&&data.length===w*h*3,'A complete RGB8 mapping window is required.');
    if(!contains)for(let i=0;i<data.length;i+=3){const offset=Math.max(data[i],data[i+1],data[i+2])<<8;data[i]=ratios[offset+data[i]];data[i+1]=ratios[offset+data[i+1]];data[i+2]=ratios[offset+data[i+2]];}
    else for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){if(((yy*w+xx)&4095)===0){await cooperate();checkAbort(signal);}if(contains(x+xx,y+yy)){const i=(yy*w+xx)*3,offset=Math.max(data[i],data[i+1],data[i+2])<<8;data[i]=ratios[offset+data[i]];data[i+1]=ratios[offset+data[i+1]];data[i+2]=ratios[offset+data[i+2]];}}
    // Full rows are contiguous in both the input and output stores. Partial
    // rows occur only when a native row itself exceeds the bounded workspace.
    requireValue(w===width||h===1,'Partial equalization rows must be independent.');
    await store.write(data,(y*width+x)*3,{signal});writes++;checkAbort(signal);
   }finally{await part.release();}
   onProgress?.({phase:'equalization-render',fraction:Math.min(1,(y+h)/height)});
  }
  await store.flush();checkAbort(signal);surface=createRgbSurface(store,{width,height,budget});store=null;
  return{surface,metrics:{equalization:{method:'histogram',value:100,backend:'cpu',elapsedMs:performance.now()-started,domain:'admitted-native-pixels',channels:'HSV-V',boundedWindows:true,traversal:'contiguous-native-bands',histogramWindows,renderWindows,storeWrites:writes}}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  let cleanup;
  for(const action of [()=>store?.dispose(),()=>failed?surface?.dispose():undefined,release])try{await action();}catch(error){cleanup??=error;}
  if(cleanup&&!failed){try{await surface?.dispose();}catch(retirement){if(cleanup&&typeof cleanup==='object'&&Object.isExtensible(cleanup))cleanup.equalizationRetirementError=retirement;}throw cleanup;}
  if(cleanup&&primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.equalizationCleanupError=cleanup;
 }
}
