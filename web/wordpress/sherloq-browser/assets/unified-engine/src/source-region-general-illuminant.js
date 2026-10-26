import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {illuminantParams,illuminantEstimator,illuminantCellDisplay} from './illuminant.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';

export async function sourceRegionIlluminant({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const p=illuminantParams(task.params),width=domain.width,height=domain.height,cols=Math.ceil(width/p.block),rows=Math.ceil(height/p.block),cells=cols*rows,dataBytes=cells*41+24,cooperate=createCooperator(signal),chunk=32768;
 requireValue(Number.isSafeInteger(dataBytes)&&Number.isSafeInteger(width*height*3),'Illuminant native geometry exceeds exact integer addressing.');
 const key=task.imageId+'\0source-region/illuminant/'+domain.fingerprint+'/'+[p.block,p.method,+p.linear,+p.exclude].join('/'),cached=budget.get(key)?.value,make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 let planning,output,scope,surface,scopeSurface,published=false,ownsData=false,failure,reads=0;
 try{
  planning=budget.reserve(dataBytes*3+cells*3+cols*(3072+8)+6144+chunk*12+32768);output=await make(width*height*3);scope=await make(width*height);
  let analysis=cached;if(!analysis){
   analysis={rows,cols,block:p.block,rgb:new Float64Array(cells*3),counts:new Uint32Array(cells),areas:new Uint32Array(cells),valid:new Uint8Array(cells),globalRGB:null,angles:new Float64Array(cells)};
   const histogram=new Uint32Array(cols*768),counts=new Uint32Array(cols),areas=new Uint32Array(cols),globalHist=new Float64Array(768),estimate=illuminantEstimator(p);let total=0;
   for(let row=0;row<rows;row++){
    histogram.fill(0);counts.fill(0);areas.fill(0);const y0=row*p.block,y1=Math.min(height,y0+p.block);
    for(let y=y0;y<y1;y++){
     await cooperate();for(const[left,right]of domain.rowIntervals(y))for(let x=left;x<right;x+=chunk){checkAbort(signal);const rect={x,y,width:Math.min(chunk,right-x),height:1},lease=await view.readWindow(rect,{signal});reads++;
      try{const input=lease.pixels.data;for(let dx=0;dx<rect.width;dx++){const i=dx*3,col=Math.floor((x+dx)/p.block);areas[col]++;if(p.exclude&&(Math.min(input[i],input[i+1],input[i+2])<=8||Math.max(input[i],input[i+1],input[i+2])>=250))continue;counts[col]++;for(let c=0;c<3;c++)histogram[col*768+c*256+input[i+c]]++;}}finally{lease.release();}
     }onProgress?.({phase:'source-region-illuminant-histograms',fraction:.65*(y+1)/height});
    }
    for(let col=0;col<cols;col++){const cell=row*cols+col,hist=histogram.subarray(col*768,(col+1)*768),unit=estimate(hist,counts[col]);for(let i=0;i<768;i++)globalHist[i]+=hist[i];total+=counts[col];analysis.counts[cell]=counts[col];analysis.areas[cell]=areas[col];analysis.valid[cell]=Number(areas[col]>0&&counts[col]>=Math.min(16,areas[col])&&Math.max(...unit)>0);if(!analysis.valid[cell])unit.fill(0);analysis.rgb.set(unit,cell*3);}
   }analysis.globalRGB=estimate(globalHist,total);
  }
  checkAbort(signal);const data=structuredClone(analysis),colors=new Uint8Array(cells*3);
  for(let cell=0;cell<cells;cell++){if(!(cell%1024))await cooperate();const display=illuminantCellDisplay(analysis.rgb.subarray(cell*3,cell*3+3),analysis.counts[cell],analysis.areas[cell],analysis.valid[cell],analysis.globalRGB,p);data.angles[cell]=display.angle;colors.set(display.color,cell*3);}
  const group=Math.max(1,Math.floor(chunk/width));for(let y=0;y<height;y+=group){await cooperate();const h=Math.min(group,height-y),lease=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(lease.pixels.data,y*width*3);}finally{lease.release();}const release=budget.reserve(width*h);try{await scope.write(new Uint8Array(width*h),y*width);}finally{release();}}
  for(let y=0;y<height;y++){await cooperate();for(const[left,right]of domain.rowIntervals(y))for(let x=left;x<right;x+=chunk){checkAbort(signal);const n=Math.min(chunk,right-x),bytes=new Uint8Array(n*3),ones=new Uint8Array(n).fill(1);for(let dx=0;dx<n;dx++){const cell=Math.floor(y/p.block)*cols+Math.floor((x+dx)/p.block);bytes.set(colors.subarray(cell*3,cell*3+3),dx*3);}await output.write(bytes,(y*width+x)*3);await scope.write(ones,y*width+x);}onProgress?.({phase:'source-region-illuminant-render',fraction:.65+.35*(y+1)/height});}
  await output.flush();await scope.flush();checkAbort(signal);planning();planning=null;budget.retain(dataBytes);ownsData=true;if(!cached)budget.put(key,{value:analysis,byteLength:dataBytes},[task.imageId]);
  surface=createRgbSurface(output,{width,height,budget});const dispose=surface.dispose;let disposed=false;surface.dispose=()=>{if(!disposed){disposed=true;if(ownsData){budget.retained-=dataBytes;ownsData=false;}}return dispose();};scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=admitted original illuminant observation;0=unanalysed original presentation.'});
  const semantics='Native local Minkowski illuminant estimates over admitted original observations. Cell and global histograms, cell areas, validity and coverage omit every excluded observation; native cells retain their encompassing-image coordinates.',metrics={analysisCacheHit:!!cached,sourceReads:reads,observations:domain.countIncluded,retainedCellDataBytes:dataBytes,sourceRegionPolicy:'native-cell-grid-admitted-histograms-and-global-reduction'},bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},data,semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-cell-area-count-histogram-global-estimation-and-normalization',cellGridOrigin:'new-native-envelope',presentationOutsideDomain:'original-unanalysed',originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{planning?.();if(!published){const cleanup=[];for(const owner of[surface??output,scopeSurface??scope])if(owner)try{await owner.dispose();}catch(error){cleanup.push(normalizeResourceError(error));}if(ownsData){budget.retained-=dataBytes;ownsData=false;}if(cleanup.length){if(failure)failure.details={...failure.details,cleanupErrors:cleanup.map(({code,message})=>({code,message}))};else throw cleanup[0];}}}
}
