import {requireValue,checkAbort,createCooperator} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {equalizationMethods} from './equalization-settings.js';
import {histogramEqualizationNativePlan,histogramEqualizationNativeLut} from './equalization-histograms-native.js';
import {createNativeEqualizationScope,nativeEqualizationArray} from './equalization-native-owner.js';
import {createCvcAccumulator,cvcAccumulatorPlan} from './equalization-cvc-native.js';

const LEVELS=65536,MAX=65535,MAX_BAND_BYTES=32*1024**2;
const GLOBAL=new Set(['histogram','bbhe','dsihe','mmbebhe','rmshe','rsihe','rswhe-m','rswhe-d','dhe','bpdhe','wthe','esihe','agcwd']);
const round=v=>Math.max(0,Math.min(MAX,Math.floor(v+.5)));
const overlap=(a,b)=>a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;
const even=v=>{const a=Math.floor(v),d=v-a;return d===.5?a+(a%2):Math.round(v);};
const reflect=(i,n)=>{if(n===1)return 0;const period=2*n-2,x=((i%period)+period)%period;return x<n?x:period-x;};

// These are the existing digital equalizer conventions, on the actual native
// code axis. Nothing is computed on an SDR8 image and enlarged afterwards.
export function nativeEqualizationGeometry(descriptor,plan){
 const {width,height,format,depth}=descriptor??{},id=plan?.method?.id,value=plan?.value,channels=plan?.channels===true;
 requireValue(format==='rgb16'&&depth===16&&[width,height,width*height*6].every(Number.isSafeInteger)&&width>0&&height>0,'A real RGB16 working surface is required.');
 const local=id==='clahe'||id==='ahe';requireValue(local||GLOBAL.has(id)||id==='cvc','This native equalizer is not registered.');
 const definition=equalizationMethods.find(method=>method.id===id);
 requireValue(definition&&Number.isFinite(value)&&value>=definition.min&&value<=definition.max&&Math.abs((value-definition.min)/definition.step-Math.round((value-definition.min)/definition.step))<1e-6,'Invalid native equalization parameter.');
 const count=channels?3:1,tiles=local?(id==='ahe'?value:8):1;
 requireValue(Number.isInteger(tiles)&&tiles>=1&&tiles<=16,'Invalid native equalization tile geometry.');
 const padded=local&&(width%tiles!==0||height%tiles!==0),paddedWidth=padded?width+tiles-width%tiles:width,paddedHeight=padded?height+tiles-height%tiles:height;
 requireValue(Number.isSafeInteger(paddedWidth*paddedHeight),'Unsafe padded native equalization population.');
 const tileWidth=paddedWidth/tiles,tileHeight=paddedHeight/tiles,histograms=count*tiles*tiles,entries=histograms*LEVELS;
 const maximumPopulation=local?tileWidth*tileHeight:width*height,Count=maximumPopulation<=0xffffffff?Uint32Array:Float64Array;
 const radius=id==='cvc'?(value-1)/2:0,rows=Math.min(paddedHeight,Math.max(1,Math.floor(MAX_BAND_BYTES/(width*6))-2*radius));
 return{width,height,id,value,channels,count,local,tiles,paddedWidth,paddedHeight,tileWidth,tileHeight,histograms,entries,Count,rows,
  radius,histogramBytes:entries*Count.BYTES_PER_ELEMENT,lutBytes:entries*2,oneHistogramBytes:LEVELS*8,sourceWindowBytes:width*Math.min(height,rows+2*radius)*6,
  maximumPopulation,units:{domain:'Exact unsigned16 working code values,65536 bins.',smoothing:'DHE and BPDHE widths/sigma are in native-code bins.',channels:channels?'independent RGB':'HSV value=max(R,G,B), preserving channel ratios'}};
}

export function nativeEqualizationProgramPlan(source,plan){
 const descriptor=source?.descriptor??source,g=nativeEqualizationGeometry(descriptor,plan);
 const cvc=g.id==='cvc'?cvcAccumulatorPlan():null;
 const lut=cvc?{scratchBytes:cvc.scratchBytes*g.count,metadataBytes:4096}:g.local?{scratchBytes:0,metadataBytes:4096}:histogramEqualizationNativePlan(g.id);
 const sourceReadPlan=typeof source.readWindowPlan==='function'?source.readWindowPlan({x:0,y:0,width:g.width,height:Math.min(g.height,g.rows+2*g.radius)}):null;
 if(sourceReadPlan)requireValue(sourceReadPlan.known===true&&sourceReadPlan.outputBytes===g.sourceWindowBytes&&Number.isSafeInteger(sourceReadPlan.additionalBytes)&&sourceReadPlan.additionalBytes>=0,'Native equalization requires the actual Source window plan.');
 const sourceAdditionalBytes=sourceReadPlan?.additionalBytes??4*1024**2+Math.max(g.width,g.height)*6;
 const histogramBytes=cvc?0:g.histogramBytes,oneHistogramBytes=cvc?0:g.oneHistogramBytes;
 const fixedBytes=g.lutBytes+histogramBytes+oneHistogramBytes+lut.scratchBytes+lut.metadataBytes;
 return{known:true,...g,histogramBytes,oneHistogramBytes,cvcPlan:cvc,scratchBytes:lut.scratchBytes,metadataBytes:lut.metadataBytes,fixedBytes,
  sourceAdditionalBytes,preparationBytes:fixedBytes+g.sourceWindowBytes+sourceAdditionalBytes,retainedBytes:g.lutBytes+lut.metadataBytes};
}

export function mapNativeEqualization(data,luts,g,{x=0,y=0,width=g.width,height=data.length/(width*3),contains,target=data}={}){
 requireValue(data instanceof Uint16Array&&target instanceof Uint16Array&&target.length===data.length&&luts instanceof Uint16Array&&luts.length===g.entries&&[x,y,width,height,width*height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=g.width-width&&y<=g.height-height&&data.length===width*height*3,'Exact native equalization map extents are required.');
 requireValue(data.buffer!==target.buffer||data.byteOffset===target.byteOffset||data.byteOffset+data.byteLength<=target.byteOffset||target.byteOffset+target.byteLength<=data.byteOffset,'Partially overlapping native equalization windows are forbidden.');
 requireValue(!overlap(luts,data)&&!overlap(luts,target),'The immutable native equalization LUT must not alias a mapped window.');
 const mapLevel=(level,px,py,c)=>{
  const offset=c*g.tiles*g.tiles*LEVELS;if(!g.local)return luts[offset+level];
  const fx=Math.fround(px/g.tileWidth-.5),fy=Math.fround(py/g.tileHeight-.5),ix=Math.floor(fx),iy=Math.floor(fy),ax=Math.fround(fx-ix),ay=Math.fround(fy-iy);
  const x0=Math.max(0,ix),x1=Math.min(g.tiles-1,ix+1),y0=Math.max(0,iy),y1=Math.min(g.tiles-1,iy+1);
  const a=luts[offset+(y0*g.tiles+x0)*LEVELS+level],b=luts[offset+(y0*g.tiles+x1)*LEVELS+level],c0=luts[offset+(y1*g.tiles+x0)*LEVELS+level],d=luts[offset+(y1*g.tiles+x1)*LEVELS+level];
  return round(even(Math.fround(Math.fround(a*(1-ax)+b*ax)*(1-ay)+Math.fround(c0*(1-ax)+d*ax)*ay)));
 };
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
  const at=(yy*width+xx)*3,px=x+xx,py=y+yy;
  if(contains&&!contains(px,py)){if(target!==data){target[at]=data[at];target[at+1]=data[at+1];target[at+2]=data[at+2];}continue;}
  if(g.channels){for(let c=0;c<3;c++)target[at+c]=mapLevel(data[at+c],px,py,c);}
  else{const v=Math.max(data[at],data[at+1],data[at+2]),next=mapLevel(v,px,py,0);if(!v)target.fill(next,at,at+3);else for(let c=0;c<3;c++)target[at+c]=round(data[at+c]*next/v);}
 }
 return target;
}

export async function prepareNativeEqualization(source,plan,{budget,signal,onProgress,contains}={}){
 requireValue(budget?.reserve&&typeof source?.readWindow==='function','A financed native equalization source is required.');checkAbort(signal);
 const execution=nativeEqualizationProgramPlan(source,plan);requireValue(execution.known,'The native equalization program is not composed.');
 const g=execution,scope=createNativeEqualizationScope(),retained=createNativeEqualizationScope(),cooperate=createCooperator(signal),started=performance.now();
 const retirement={async dispose(){await scope.dispose();await retained.dispose();}};
 scope.excludeParent(retirement);retained.excludeParent(retirement);
 const metrics={inputDepth:16,levels:LEVELS,sourceReads:0,statisticsMs:0,lutMs:0,method:g.id,channels:g.channels?'RGB':'HSV-V'};
 try{
  const luts=nativeEqualizationArray(retained,Uint16Array,g.entries,budget,'native-equalization-luts');
  retained.adopt(budget.reserve(g.metadataBytes));
  const hist=g.cvcPlan?null:nativeEqualizationArray(scope,g.Count,g.entries,budget,'native-equalization-histograms'),one=g.cvcPlan?null:nativeEqualizationArray(scope,Float64Array,LEVELS,budget,'native-equalization-one-histogram');
  const scratch=nativeEqualizationArray(scope,Uint8Array,g.scratchBytes,budget,'native-equalization-lut-scratch');
  const accumulators=[];
  if(g.cvcPlan)for(let c=0;c<g.count;c++){
   const accumulator=createCvcAccumulator({target:luts.data.subarray(c*LEVELS,(c+1)*LEVELS),scratch:new Float64Array(scratch.data.buffer,scratch.data.byteOffset+c*g.cvcPlan.scratchBytes,g.cvcPlan.scratchLength),signal});
   scope.adopt(accumulator,'dispose',1);accumulators.push(accumulator);
  }
  const statsStarted=performance.now();
  for(let y=0;y<g.paddedHeight;y+=g.rows){
   await cooperate();const rows=Math.min(g.rows,g.paddedHeight-y);let top=g.height-1,bottom=0;
   for(let yy=-g.radius;yy<rows+g.radius;yy++){const sy=reflect(y+yy,g.height);top=Math.min(top,sy);bottom=Math.max(bottom,sy);}
   const part=await source.readWindow({x:0,y:top,width:g.width,height:bottom-top+1},{signal}),loan=scope.adopt(part,'release');
   let partFailure;
   try{
    const data=part.pixels?.data;requireValue(data instanceof Uint16Array&&data.length===g.width*(bottom-top+1)*3,'The native equalizer source window changed type or extent.');
    for(let yy=0;yy<rows;yy++){
     if((yy&31)===0)await cooperate();const sy=reflect(y+yy,g.height),tileY=g.local?Math.floor((y+yy)/g.tileHeight):0;
     for(let xx=0;xx<g.paddedWidth;xx++){
      const sx=reflect(xx,g.width);if(contains&&!contains(sx,sy))continue;
      const at=((sy-top)*g.width+sx)*3,tile=tileY*g.tiles+(g.local?Math.floor(xx/g.tileWidth):0);
      if(g.cvcPlan){
       for(let dy=-g.radius;dy<=g.radius;dy++)for(let dx=-g.radius;dx<=g.radius;dx++){
        const nx=reflect(sx+dx,g.width),ny=reflect(sy+dy,g.height);if(contains&&!contains(nx,ny))continue;
        const ni=((ny-top)*g.width+nx)*3;
        if(g.channels)for(let c=0;c<3;c++)accumulators[c].addPair(data[at+c],data[ni+c]);
        else accumulators[0].addPair(Math.max(data[at],data[at+1],data[at+2]),Math.max(data[ni],data[ni+1],data[ni+2]));
       }
      }else if(g.channels)for(let c=0;c<3;c++)hist.data[(c*g.tiles*g.tiles+tile)*LEVELS+data[at+c]]++;
      else hist.data[tile*LEVELS+Math.max(data[at],data[at+1],data[at+2])]++;
     }
    }
   }catch(error){partFailure=error;scope.adoptFailure(error);throw error;}finally{try{await scope.drop(loan);}catch(cleanup){throw withRetirementOwner(partFailure??cleanup,retirement,cleanup);}}
   metrics.sourceReads++;onProgress?.({phase:'equalization-statistics',fraction:Math.min(1,(y+rows)/g.paddedHeight)});
  }
  metrics.statisticsMs=performance.now()-statsStarted;const lutStarted=performance.now();
  if(g.cvcPlan){for(const accumulator of accumulators)await accumulator.finish();metrics.cvc=accumulators.map(value=>value.metrics);}
  else for(let table=0;table<g.histograms;table++){
   await cooperate();const start=table*LEVELS;for(let i=0;i<LEVELS;i++)one.data[i]=hist.data[start+i];
   const target=luts.data.subarray(start,start+LEVELS);
   if(!g.local)await histogramEqualizationNativeLut(one.data,g.id,g.value,{target,scratch:scratch.data,signal,cooperate});
   else{
    let area=0;for(let i=0;i<LEVELS;i++)area+=one.data[i];
    if(!area){for(let i=0;i<LEVELS;i++)target[i]=i;continue;}
    if(g.id==='clahe'){
     const limit=Math.max(1,Math.floor(g.value*area/LEVELS));let excess=0;
     for(let i=0;i<LEVELS;i++)if(one.data[i]>limit){excess+=one.data[i]-limit;one.data[i]=limit;}
     const batch=Math.floor(excess/LEVELS);let rest=excess-batch*LEVELS;for(let i=0;i<LEVELS;i++)one.data[i]+=batch;
     if(rest){const step=Math.max(1,Math.floor(LEVELS/rest));for(let i=0;i<LEVELS&&rest;i+=step,rest--)one.data[i]++;}
    }
    let cumulative=0;const scale=Math.fround(MAX/area);for(let i=0;i<LEVELS;i++){if((i&4095)===0)await cooperate();cumulative+=one.data[i];target[i]=round(even(Math.fround(cumulative*scale)));}
   }
  }
  metrics.lutMs=performance.now()-lutStarted;checkAbort(signal);await scope.dispose();
  let closed=false,closing=false,flight;const program={geometry:g,metrics:{...metrics,totalMs:performance.now()-started,retainedBytes:g.retainedBytes},
   get luts(){requireValue(!closed&&!closing,'Native equalization program was retired.');return luts.data;},
   map(data,rect={}){requireValue(!closed&&!closing,'Native equalization program was retired.');return mapNativeEqualization(data,luts.data,g,{...rect,contains});},
   dispose(){if(closed)return Promise.resolve();if(flight)return flight;closing=true;const task=(async()=>{try{await retained.dispose();closed=true;}catch(error){throw withRetirementOwner(error,program,error);}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}
  };return program;
 }catch(error){scope.adoptFailure(error);if(gpuRetirementBlocked(error))throw withRetirementOwner(error,retirement,error);try{await retirement.dispose();}catch(cleanup){throw withRetirementOwner(error,retirement,cleanup);}throw error;}
}
