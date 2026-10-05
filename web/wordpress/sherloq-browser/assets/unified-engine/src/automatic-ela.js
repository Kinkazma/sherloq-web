import {externalMaskContours} from './external-mask-contours.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';import {createCloneEntryGeometry} from './clone-entry-geometry.js';import {createSegmentedBytes} from './segmented-bytes.js';import {segmentElaCells} from './ela-cell-tools.js';import {segmentSegmentedEnergy} from './energy-segment-stream.js';import {energyColor} from './energy-segment.js';import {roundEven,ELA_SOURCE} from './clone-relations.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const MiB=1024**2;
function cellColor(key){const h=parseInt(key.slice(-8),16)/2**32,i=Math.floor(h*6),a=h*6-i,v=.95,s=.7,p=v*(1-s),q=v*(1-s*a),t=v*(1-s*(1-a));return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6].map(x=>roundEven(x*255)).reverse();}

/** Re-segment globally prepared cell/Ghost/background and energy profiles under
 * a native automatic selection. Never recompute reference statistics on ROIs.
 * Input providers remain caller-owned; returned labels, scope and entries are owned. */
export async function composeAutomaticEla(cellBase,energyBase,{budget,regions,excluded=[],threshold=2,minimum=3,energyThresholds,signal,onProgress,storage='auto',temporarySession,getTemporarySession,wasmBinary}={}){
 const {width,height,rows,cols}=cellBase??{},block=cellBase?.metadata?.block,n=rows*cols;
 requireValue([width,height,rows,cols,block].every(x=>Number.isInteger(x)&&x>0)&&rows===Math.floor(height/block)&&cols===Math.floor(width/block)&&cellBase.supported instanceof Uint8Array&&cellBase.supported.length===n&&Array.isArray(regions)&&Array.isArray(excluded),'Prepared global cells and source scope required');
 requireValue(!energyBase||(energyBase.width===width&&energyBase.height===height&&energyBase.metadata?.block===block&&JSON.stringify(energyBase.metadata.qualities)===JSON.stringify(cellBase.metadata.qualities)),'Cell/energy source geometry or quality profiles differ');
 requireValue(Number.isFinite(threshold)&&threshold>0&&Number.isInteger(minimum)&&minimum>=1&&(!energyThresholds||(Array.isArray(energyThresholds)&&energyThresholds.length===2&&energyThresholds.every(x=>Number.isFinite(x)&&x>=0))),'Invalid automatic ELA thresholds/support');
 const leases=[],admit=bytes=>{const release=budget.reserve(bytes);leases.push(release);return release;},options={budget,storage,temporarySession,getTemporarySession,signal};let kernel,scope,allowed,energy,complete=false;const entries=[];
 try{
  admit(n*2+MiB+[cellBase.metadata,energyBase?.metadata,regions,excluded].reduce((sum,v)=>sum+(JSON.stringify(v)?.length??0)*8,0)+65536);
  kernel=await createCloneEntryGeometry({budget,maxRasterPixels:width*height,maxVertices:Math.max(3,...regions.concat(excluded).map(p=>p.length)),signal,wasmBinary});
  allowed=await createSegmentedBytes(width*height,options);scope=await kernel.scope({width,height,block,regions,excluded},(bytes,offset)=>allowed.write(bytes,offset),{signal});await allowed.flush();const supported=Uint8Array.from(cellBase.supported,(x,i)=>x&&scope.cells[i]?1:0);scope.release();scope=null;kernel.dispose();kernel=null;
  const cells=await segmentElaCells({...cellBase,supported},{threshold,minimum},{signal,account:admit});onProgress?.({phase:'automatic-ela-cells',fraction:1});checkAbort(signal);
  const limits=energyThresholds??[threshold,threshold];if(energyBase)energy=await segmentSegmentedEnergy({...energyBase,energy_allowed:allowed},{thresholds:limits,minimum,offset:cells.regions.length},{...options,onProgress});
  const allRegions=[...cells.regions,...(energy?.regions??[])];kernel=await createCloneEntryGeometry({budget,maxMaskPixels:n,signal,wasmBinary});const hash=await createSHA256();
  for(const region of allRegions){
   await controlCheckpoint(signal);
   if(region.kind){
    const [x,y,w,h]=region.bbox;admit(w*h+w*4+8192);let contours;const mask=new Uint8Array(w*h),row=new Int32Array(w);
    for(let yy=0;yy<h;yy++){if(yy%32===0)await controlCheckpoint(signal);await energy.labels.readInto(new Uint8Array(row.buffer),((y+yy)*width+x)*4);for(let xx=0;xx<w;xx++)mask[yy*w+xx]=row[xx]===region.id?1:0;}
    contours=await externalMaskContours({width:w,height:h,mask,origin:[x,y]},{budget,signal});leases.push(contours.release);
    entries.push({id:`ela-energy-${region.energy_region}-${region.kind}`,source:ELA_SOURCE,label:region.sources[0],kind:region.kind,count:region.pixels,color:energyColor(region).reverse(),pixel_mask:{width:w,height:h,data:mask},origin:[x,y],polygons:contours.polygons,provenance:{region:region.id,score:region.score,sources:region.sources.slice(),dominant_descriptor:region.dominant_descriptor,classification:'descriptive_energy_contrast',energy_region:region.energy_region,components:region.components}});
   }else{
    admit(n+region.cells*80+8192);const mask=new Uint8Array(n),coords=new Int32Array(region.cells*2),selected=[];let count=0;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(cells.labels[y*cols+x]===region.id){mask[y*cols+x]=1;coords[count*2]=y;coords[count*2+1]=x;selected.push([y,x]);count++;}requireValue(count===region.cells,'ELA cell count differs');
    hash.init();hash.update(new Uint8Array(coords.buffer));hash.update(new TextEncoder().encode(String(block)));const key='ela-'+hash.digest('hex').slice(0,24),contours=await kernel.contours({width:cols,height:rows,mask},{signal});leases.push(contours.release);for(const polygon of contours.polygons)for(const p of polygon){p[0]=p[0]*block+block/2;p[1]=p[1]*block+block/2;}
    entries.push({id:key,source:ELA_SOURCE,count,color:cellColor(key),cells:selected,block,polygons:contours.polygons,provenance:{region:region.id,score:region.score,sources:region.sources?.slice()??['ELA'],dominant_descriptor:region.dominant_descriptor}});
   }
  }
  kernel.dispose();kernel=null;const metadata={...structuredClone(cellBase.metadata),threshold,minimum_cells:minimum,energy_thresholds:{low:limits[0],high:limits[1]},regions:allRegions,analysis_scope:'full_image_reference_profiles_selected_complete_cells',energy_analysis_scope:'detected_panel_reference_selected_pixels',selected_regions:structuredClone(regions),excluded_regions:structuredClone(excluded),...(energyBase?{energy:structuredClone(energyBase.metadata.energy)}:{})};
  onProgress?.({phase:'automatic-ela-entries',fraction:1});checkAbort(signal);complete=true;let disposed=false;
  return {width,height,rows,cols,supported,labels:cells.labels,energy_labels:energy?.labels,energy_allowed:allowed,entries,metadata,async dispose(){if(disposed)return;disposed=true;try{const results=await Promise.allSettled([energy?.dispose(),allowed.dispose()]),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{for(const release of leases)release();}}};
 }finally{scope?.release();kernel?.dispose();if(!complete){await Promise.allSettled([energy?.dispose(),allowed?.dispose()]);for(const release of leases)release();}}
}
