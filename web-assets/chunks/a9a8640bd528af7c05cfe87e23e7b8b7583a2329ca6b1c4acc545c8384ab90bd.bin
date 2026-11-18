import "../../runtime-context.js?v=0.33.2";
import {retireCompositeOwners} from './composite-owner-release.js';
import {histogramEqualizationLut,contextualEqualizationLut} from './equalization-histograms.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort,createCooperator,requireValue} from './errors.js';
import {gray} from './pixel-utils.js';
import {globalHistogramSurface} from './equalization-global-histogram.js';

const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const ALL_ADMITTED=()=>true;
const reflect=(i,n)=>{if(n===1)return 0;const period=2*n-2;const x=((i%period)+period)%period;return x<n?x:period-x;};
const even=v=>{const a=Math.floor(v),d=v-a;return d===.5?a+(a%2):Math.round(v);};
const scalar=(data,i,c)=>c<0?Math.max(data[i],data[i+1],data[i+2]):data[i+c];
function otsu(h){let n=0,total=0;for(let i=0;i<256;i++){n+=h[i];total+=i*h[i];}let best=-1,threshold=0,mass=0,moment=0;for(let i=0;i<256;i++){mass+=h[i];moment+=i*h[i];if(!mass||mass===n)continue;const score=(total*mass-moment*n)**2/(mass*(n-mass));if(score>best){best=score;threshold=i;}}return threshold;}

function equalizationGeometry(width,height,plan){
 const{method,value,channels}=plan,id=method.id,count=channels?3:1,local=id==='clahe'||id==='ahe',tiles=id==='ahe'?value:8,padded=width%tiles!==0||height%tiles!==0,pw=local&&padded?width+tiles-width%tiles:width,ph=local&&padded?height+tiles-height%tiles:height,tw=pw/tiles,th=ph/tiles,joint=id==='cvc',radius=joint?(value-1)/2:0,bins=local?tiles*tiles*256:joint?65536:256;
 return{method,value,channels,id,count,local,tiles,pw,ph,tw,th,joint,radius,bins,reservationBytes:count*bins*8+(joint?count*(65536*8+8192):0)+count*(local?tiles*tiles*256:256)+65536};
}
export function equalizationAdmissionPlan(descriptor,plan,{backend='cpu',storageOverheadBytes=0}={}){
 if(!plan?.post)return{bytes:0,completeResidentAlternative:true};if(plan.method.id==='sherloq7c'||plan.method.id==='histogram'&&plan.value===100&&!plan.channels&&!plan.finish)return null;
 const{width,height}=descriptor??{};if(![width,height,storageOverheadBytes].every(Number.isSafeInteger)||width<1||height<1)return null;
 const g=equalizationGeometry(width,height,plan),blockWidth=Math.min(512,width),blockHeight=Math.min(32,height),expandedWidth=blockWidth+2*g.radius,expandedHeight=blockHeight+2*g.radius,windowBytes=Math.min(width,expandedWidth)*Math.min(height,expandedHeight)*3+expandedWidth*expandedHeight+(expandedWidth+expandedHeight)*8+width*3,bytes=g.reservationBytes+width*height*3+storageOverheadBytes+windowBytes;
 return Number.isSafeInteger(bytes)&&bytes>0?{bytes,completeResidentAlternative:true}:null;
}
// Fixed-domain statistics, bounded windows and one immutable mapping program.
// A mask excludes pixels from both statistics and contextual neighbourhoods.
export async function prepareEqualization(source,plan,{budget,signal,onProgress,contains=()=>true,sherloqRuntime,sherloqSourceTransaction}={}){
 if(plan.method.id==='sherloq7c')return (await import('./equalization-sherloq7c.js')).prepareSherloq7cEqualization(source,plan,{budget,signal,onProgress,contains,sherloqRuntime,sherloqSourceTransaction});
 const {width,height}=source.descriptor,{method,value,channels,id,count,local,tiles,pw,ph,tw,th,joint,radius,bins,reservationBytes}=equalizationGeometry(width,height,plan);
 const release=budget.reserve(reservationBytes);
 const cooperate=createCooperator(signal),hist=Array.from({length:count},()=>new Float64Array(bins));let luts,closed=false;
 async function block(x,y,w,h,halo=0){
  const xs=[],ys=[];for(let k=-halo;k<w+halo;k++)xs.push(reflect(x+k,width));for(let k=-halo;k<h+halo;k++)ys.push(reflect(y+k,height));
  const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs)+1,bottom=Math.max(...ys)+1,part=await source.readWindow({x:left,y:top,width:right-left,height:bottom-top},{signal});
  try{const admitted=new Uint8Array(xs.length*ys.length);for(let yy=0;yy<ys.length;yy++)for(let xx=0;xx<xs.length;xx++)admitted[yy*xs.length+xx]=contains(xs[xx],ys[yy])?1:0;
   return {part,xs,ys,admitted:(xx,yy)=>admitted[yy*xs.length+xx]!==0,at:(xx,yy)=>((ys[yy]-top)*part.pixels.width+xs[xx]-left)*3};
  }catch(error){await retireCompositeOwners([()=>part.release()],{primary:error,requireAck:true});throw error;}
 }
 try{
  for(let y=0;y<(local?ph:height);y+=32)for(let x=0;x<(local?pw:width);x+=512){
   await cooperate();const w=Math.min(512,(local?pw:width)-x),h=Math.min(32,(local?ph:height)-y),b=await block(x,y,w,h,radius),data=b.part.pixels.data;
   let partFailed=false,partPrimary;try{for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    if(!b.admitted(xx+radius,yy+radius))continue;const i=b.at(xx+radius,yy+radius),tile=local?(Math.floor((y+yy)/th)*tiles+Math.floor((x+xx)/tw))*256:0;
    for(let c=0;c<count;c++){const level=scalar(data,i,channels?c:-1);if(!joint)hist[c][tile+level]++;
     else for(let dy=0;dy<value;dy++)for(let dx=0;dx<value;dx++){if(b.admitted(xx+dx,yy+dy))hist[c][level*256+scalar(data,b.at(xx+dx,yy+dy),channels?c:-1)]++;}
    }
   }}catch(error){partFailed=true;partPrimary=error;throw error;}finally{await retireCompositeOwners([()=>b.part.release()],partFailed?{primary:partPrimary,requireAck:true}:{requireAck:true});}onProgress?.({phase:'equalization-statistics',fraction:Math.min(1,(y+32)/height)});
  }
  luts=hist.map(h=>{
   if(joint)return contextualEqualizationLut(h);
   if(!local)return histogramEqualizationLut(h,id,value);
   const tables=new Uint8Array(bins);for(let tile=0;tile<tiles*tiles;tile++){
    const values=h.subarray(tile*256,(tile+1)*256);let area=0;for(const v of values)area+=v;
    if(!area){for(let i=0;i<256;i++)tables[tile*256+i]=i;continue;}
    if(id==='clahe'){const limit=Math.max(1,Math.floor(value*area/256));let excess=0;for(let i=0;i<256;i++)if(values[i]>limit){excess+=values[i]-limit;values[i]=limit;}const batch=Math.floor(excess/256);let rest=excess-batch*256;for(let i=0;i<256;i++)values[i]+=batch;if(rest){const step=Math.max(1,Math.floor(256/rest));for(let i=0;i<256&&rest;i+=step,rest--)values[i]++;}}
    let cumulative=0;const scale=Math.fround(255/area);for(let i=0;i<256;i++){cumulative+=values[i];tables[tile*256+i]=clamp(even(Math.fround(cumulative*scale)));}
   }return tables;
  });
  const mapLevel=(level,x,y,c)=>{
   const lut=luts[c];if(!local)return lut[level];const fx=Math.fround(x/tw-.5),fy=Math.fround(y/th-.5),ix=Math.floor(fx),iy=Math.floor(fy),ax=Math.fround(fx-ix),ay=Math.fround(fy-iy),x0=Math.max(0,ix),x1=Math.min(tiles-1,ix+1),y0=Math.max(0,iy),y1=Math.min(tiles-1,iy+1),a=lut[(y0*tiles+x0)*256+level],b=lut[(y0*tiles+x1)*256+level],c0=lut[(y1*tiles+x0)*256+level],d=lut[(y1*tiles+x1)*256+level];return clamp(even(Math.fround(Math.fround(a*(1-ax)+b*ax)*(1-ay)+Math.fround(c0*(1-ax)+d*ax)*ay)));
  };
  return {method:id,value,map(data,x,y,w,h,{xAt=i=>x+i,yAt=i=>y+i}={}){
   requireValue(!closed,'Equalization mapping released.');
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const px=xAt(xx),py=yAt(yy);if(!contains(px,py))continue;const i=(yy*w+xx)*3;
    if(channels){for(let c=0;c<3;c++)data[i+c]=mapLevel(data[i+c],px,py,c);}
    else{const v=Math.max(data[i],data[i+1],data[i+2]),next=mapLevel(v,px,py,0);if(next===v)continue;if(!v)data.fill(next,i,i+3);else for(let c=0;c<3;c++)data[i+c]=clamp(data[i+c]*next/v);}
   }return data;
  },dispose(){if(!closed){const ack=release();if(ack===false||ack===0)throw ack;closed=true;luts=null;}}};
 }catch(error){await retireCompositeOwners([release],{primary:error,requireAck:true});throw error;}
}

export async function equalizationSurface(source,plan,{budget,signal,onProgress,contains=ALL_ADMITTED,temporarySession,getTemporarySession,backend='cpu',sherloqRuntime,sherloqSourceTransaction,nativeGpuRetirement}={}){
 if(plan.method.id==='histogram'&&plan.value===100&&!plan.channels&&!plan.finish)return globalHistogramSurface(source,{budget,signal,onProgress,contains:contains===ALL_ADMITTED?null:contains,temporarySession,getTemporarySession,backend,nativeGpuRetirement});
 const started=performance.now(),{width,height}=source.descriptor,cooperate=createCooperator(signal);let program,store,output,failed=false,primary,threshold=plan.finish?.threshold??255;
 try{
  program=await prepareEqualization(source,plan,{budget,signal,onProgress,contains,sherloqRuntime,sherloqSourceTransaction});
  if(program.takeRecords){
   if(threshold===0){const histogram=await program.histogram(gray);try{threshold=otsu(histogram.data);}finally{await histogram.release();}}
   const record=await program.takeRecords({threshold,invert:plan.finish?.invert??false});
   return{...record,metrics:{equalization:{method:'sherloq7c',value:plan.value,micro:plan.state.sherloq7c.micro,precision:plan.state.sherloq7c.precision,backend:program.metrics.actualBackend??'cpu',elapsedMs:performance.now()-started,domain:program.metrics.coordinateDomain??'proxy-output',channels:'HSV-V',boundedWindows:true,workingBitDepth:16,sourceBitDepth:program.metrics.sourceBitDepth,promotion:program.metrics.promotion,scalarStage:'before-finish',computationMode:program.metrics.computationMode,effectiveComputationMode:program.metrics.effectiveComputationMode,fallbackReason:program.metrics.fallbackReason,approximate:program.metrics.approximate,strictPrecisionMet:program.metrics.strictPrecisionMet,certificateScope:program.metrics.approximate?'Approximate native endpoints; projection/feasibility certificate only; no target error guarantee':'Sherloq7C before optional presentation threshold/inversion',thresholdDiscontinuous:threshold<255,finish:plan.finish??null,sherloq7c:program.metrics}}};
  }
  if(threshold===0){const histogram=new Float64Array(256);for(let y=0;y<height;y+=32)for(let x=0;x<width;x+=512){await cooperate();const w=Math.min(512,width-x),h=Math.min(32,height-y),part=await source.readWindow({x,y,width:w,height:h},{signal});let partFailed=false,partPrimary;try{program.map(part.pixels.data,x,y,w,h);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(contains(x+xx,y+yy)){const i=(yy*w+xx)*3;histogram[gray(part.pixels.data[i],part.pixels.data[i+1],part.pixels.data[i+2])]++;}}catch(error){partFailed=true;partPrimary=error;throw error;}finally{await retireCompositeOwners([()=>part.release()],partFailed?{primary:partPrimary,requireAck:true}:{requireAck:true});}}threshold=otsu(histogram);}
  store=await createSegmentedBytes(width*height*3,{budget,temporarySession,getTemporarySession,signal,owner:'equalization',label:'presentation-equalization'});
  for(let y=0;y<height;y+=32)for(let x=0;x<width;x+=512){
   await cooperate();const w=Math.min(512,width-x),h=Math.min(32,height-y),part=await source.readWindow({x,y,width:w,height:h},{signal});
   let partFailed=false,partPrimary;try{const data=program.map(part.pixels.data,x,y,w,h);if(plan.finish)for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){if(!contains(x+xx,y+yy))continue;const i=(yy*w+xx)*3;for(let c=0;c<3;c++){const v=threshold<255?(data[i+c]>threshold?255:0):data[i+c];data[i+c]=plan.finish.invert?255-v:v;}}for(let yy=0;yy<h;yy++)await store.write(data.subarray(yy*w*3,(yy+1)*w*3),((y+yy)*width+x)*3,{signal});}catch(error){partFailed=true;partPrimary=error;throw error;}finally{await retireCompositeOwners([()=>part.release()],partFailed?{primary:partPrimary,requireAck:true}:{requireAck:true});}
   onProgress?.({phase:'equalization-render',fraction:Math.min(1,(y+32)/height)});
  }
  await store.flush();checkAbort(signal);output=createRgbSurface(store,{width,height,budget});store=null;return {surface:output,metrics:{equalization:{method:plan.method.id,value:plan.value,backend:'cpu',elapsedMs:performance.now()-started,domain:'admitted-native-pixels',channels:plan.channels?'RGB':'HSV-V',boundedWindows:true}}};
 }catch(error){failed=true;primary=error;throw error;}finally{
  try{await retireCompositeOwners([()=>failed?store?.dispose():undefined,()=>failed?output?.dispose():undefined,()=>program?.dispose()],failed?{primary,requireAck:true}:{requireAck:true});}
  catch(cleanup){if(!failed)await retireCompositeOwners([()=>store?.dispose(),()=>output?.dispose()],{primary:cleanup,requireAck:true});throw cleanup;}
 }
}
