// Presentation only. Scientific maps remain untouched in the engine worker.
import {ADAPTIVE_PREVIEW_MAX_SIDE} from './adaptive-preview.js';
export async function renderEnergy(data,source,{view='overlay',opacity=70,field='high',threshold=0,scoreView='map'}={}, {signal,preview,observedMaxima:knownMaxima,signedRanges:knownRanges}={}){
 if(view==='scores'&&field==='both')return renderBothEnergyV1(data,source,{view,opacity,field,threshold,scoreView},{signal,preview,observedMaxima:knownMaxima,signedRanges:knownRanges});
 if(!['overlay','labels','scores'].includes(view)||!Number.isInteger(opacity)||opacity<0||opacity>100)throw Error('Invalid energy presentation');
 const check=()=>{if(signal?.aborted)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});};check();
 if(view==='scores'){
  if(!['low','high','unified'].includes(field)||!Number.isFinite(threshold)||threshold<0||!['map','overlay'].includes(scoreView))throw Error('Invalid energy score presentation');
  const {width,height,energy_scope:scope,energy_high_score:high,energy_low_score:low}=data,n=width*height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||![high,low].every(scores=>scores instanceof Float32Array&&scores.length===n)||!(scope instanceof Int32Array)||scope.length!==n)throw Error('Invalid raw energy score map or reference scope');
  let scale=1;if(preview){const {maxWidth,maxHeight}=preview;if(!Number.isSafeInteger(maxWidth)||maxWidth<1||maxWidth>ADAPTIVE_PREVIEW_MAX_SIDE||!Number.isSafeInteger(maxHeight)||maxHeight<1||maxHeight>ADAPTIVE_PREVIEW_MAX_SIDE)throw Error('Invalid energy preview bounds');scale=Math.min(1,maxWidth/width,maxHeight/height);}
  const outputWidth=Math.max(1,Math.floor(width*scale)),outHeight=Math.max(1,Math.floor(height*scale)),isPreview=outputWidth!==width||outHeight!==height;
  if(scoreView==='overlay'&&(!source||(source.data?source.data.length!==n*3:source.width!==width||source.height!==height)))throw Error('Energy dimensions differ from original');
  const output=new Uint8Array(outputWidth*outHeight*3),alpha=.35;let highMaximum=0,lowMaximum=0,signedMinimum=Infinity,signedMaximum=-Infinity;
  // Drag previews are presentation-only samples. Exact views retain every source
  // pixel and consume bounded scanlines; neither path constructs signed arrays.
  let sampledSource,sourceStep;if(isPreview&&scoreView==='overlay'&&!source.data&&source.readSampled){sourceStep=Math.max(1,Math.ceil(Math.max(width/outputWidth,height/outHeight)));sampledSource=await source.readSampled({x:0,y:0,w:width,h:height,step:sourceStep});check();if(sampledSource.width!==Math.ceil(width/sourceStep)||sampledSource.height!==Math.ceil(height/sourceStep)||sampledSource.data?.length!==sampledSource.width*sampledSource.height*3)throw Error('Invalid sampled original');}
  for(let top=0;top<outHeight;top+=256){check();const bottom=Math.min(outHeight,top+256);
   let sourceRows;if(scoreView==='overlay'&&!source.data&&!isPreview){sourceRows=await source.readPixels({x:0,y:top,width,height:bottom-top});if(sourceRows.data?.length!==(bottom-top)*width*3)throw Error('Invalid original RGB rows');}
   for(let y=top;y<bottom;y++){
    const sy=isPreview?Math.min(height-1,Math.floor((y+.5)*height/outHeight)):y;
    const fallbackRow=scoreView==='overlay'&&!source.data&&isPreview&&!sampledSource?await source.readPixels({x:0,y:sy,width,height:1}):null;
    if(fallbackRow&&fallbackRow.data?.length!==width*3)throw Error('Invalid original RGB rows');check();
    if(!isPreview){
     const start=y*width,end=start+width;let at=start*3;
     if(scoreView==='map')for(let i=start;i<end;i++,at+=3){if((i&8191)===0)check();const h=high[i],l=low[i];if(!Number.isFinite(h)||h<0||!Number.isFinite(l)||l<0)throw Error('Invalid raw energy score');if(scope[i]<=0)continue;const signed=h-l,score=field==='unified'?Math.abs(signed):field==='high'?h:l;highMaximum=Math.max(highMaximum,h);lowMaximum=Math.max(lowMaximum,l);signedMinimum=Math.min(signedMinimum,signed);signedMaximum=Math.max(signedMaximum,signed);if(score>threshold)output[at+(field==='unified'&&signed<0?2:0)]=Math.min(255,Math.round(score*255));}
     else{const original=source.data??sourceRows.data,base=source.data?0:top*width*3;for(let i=start;i<end;i++,at+=3){if((i&8191)===0)check();const h=high[i],l=low[i];if(!Number.isFinite(h)||h<0||!Number.isFinite(l)||l<0)throw Error('Invalid raw energy score');const signed=h-l,admitted=scope[i]>0;if(admitted){highMaximum=Math.max(highMaximum,h);lowMaximum=Math.max(lowMaximum,l);signedMinimum=Math.min(signedMinimum,signed);signedMaximum=Math.max(signedMaximum,signed);}const score=field==='unified'?Math.abs(signed):field==='high'?h:l,intensity=admitted&&score>threshold?Math.min(255,Math.round(score*255)):0,blue=field==='unified'&&signed<0,index=i*3-base;
       output[at]=intensity===0?original[index]:Math.round(original[index]*(1-alpha)+(blue?0:intensity)*alpha);output[at+1]=intensity===0?original[index+1]:Math.round(original[index+1]*(1-alpha));output[at+2]=intensity===0?original[index+2]:Math.round(original[index+2]*(1-alpha)+(blue?intensity:0)*alpha);
      }}
     continue;
    }
    for(let x=0,at=y*outputWidth*3;x<outputWidth;x++,at+=3){if((x&8191)===0)check();const sx=Math.min(width-1,Math.floor((x+.5)*width/outputWidth)),i=sy*width+sx,h=high[i],l=low[i];if(!Number.isFinite(h)||h<0||!Number.isFinite(l)||l<0)throw Error('Invalid raw energy score');const signed=h-l,score=field==='unified'?Math.abs(signed):field==='high'?h:l,blue=field==='unified'&&signed<0,intensity=scope[i]>0&&score>threshold?Math.min(255,Math.round(score*255)):0;
     if(scoreView==='map')output[at+(blue?2:0)]=intensity;
     else{let original,index;if(source.data){original=source.data;index=(sy*width+sx)*3;}else if(sampledSource){original=sampledSource.data;index=(Math.floor(sy/sourceStep)*sampledSource.width+Math.floor(sx/sourceStep))*3;}else{original=fallbackRow.data;index=sx*3;}for(let c=0;c<3;c++)output[at+c]=intensity===0?original[index+c]:Math.round(original[index+c]*(1-alpha)+(c===(blue?2:0)?intensity:0)*alpha);}
    }
   }
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  // A preview borrows only complete native statistics. Sampled extrema must not
  // change the slider's range or masquerade as measurements of the full map.
  const haveMaxima=!isPreview||['high','low'].every(key=>Number.isFinite(knownMaxima?.[key])&&knownMaxima[key]>=0),haveRanges=!isPreview||['high','low'].every(key=>Number.isFinite(knownRanges?.[key]?.minimum)&&Number.isFinite(knownRanges[key].maximum));
  if(!isPreview&&!Number.isFinite(signedMinimum))signedMinimum=signedMaximum=0;
  const maxima=haveMaxima?(isPreview?{high:knownMaxima.high,low:knownMaxima.low}:{high:highMaximum,low:lowMaximum}):null,signedRanges=haveRanges?(isPreview?{high:{...knownRanges.high},low:{...knownRanges.low}}:{high:{minimum:signedMinimum,maximum:signedMaximum},low:{minimum:-signedMaximum,maximum:-signedMinimum}}):null;
  check();return {width:outputWidth,height:outHeight,logicalWidth:width,logicalHeight:height,preview:isPreview,format:'rgb8',data:output,presentation:{view,field,threshold,scoreView,thresholdCondition:'magnitude>threshold',preview:isPreview,nativeResolution:!isPreview,sourceWidth:width,sourceHeight:height,...(isPreview?{sampling:'nearest-source-pixel-center',sampleWidth:outputWidth,sampleHeight:outHeight}:{}),...(maxima?{observedMaxima:maxima,observedMaximum:field==='unified'?Math.max(maxima.high,maxima.low):maxima[field]}:{}),...(signedRanges?{signedRanges}:{}),color:field==='unified'?'clamp(round(abs(high-low)*255),0,255); HIGH=red; LOW=blue':'clamp(round(raw-score*255),0,255); green=blue=0',...(field==='unified'?{signedScore:'high-low'}:{}),referenceScope:'energy_scope>0',...(scoreView==='overlay'?{overlayOpacity:alpha,blackTransparent:true}:{}),probability:false}};
 }
 const {width,height,energy_labels:labels,regionColors}=data,n=width*height;
 if(labels.length!==n||(source.data?source.data.length!==n*3:source.width!==width||source.height!==height))throw Error('Energy dimensions differ from original');
 if(preview){
  const {maxWidth,maxHeight}=preview;if(!Number.isSafeInteger(maxWidth)||maxWidth<1||maxWidth>ADAPTIVE_PREVIEW_MAX_SIDE||!Number.isSafeInteger(maxHeight)||maxHeight<1||maxHeight>ADAPTIVE_PREVIEW_MAX_SIDE)throw Error('Invalid energy preview bounds');
  const scale=Math.min(1,maxWidth/width,maxHeight/height),ow=Math.max(1,Math.floor(width*scale)),oh=Math.max(1,Math.floor(height*scale)),colors=new Map(regionColors.map(x=>[x.id,x.rgb])),output=new Uint8Array(ow*oh*3),alpha=opacity/100;
  let sampled,step;if(view==='overlay'&&!source.data&&source.readSampled){step=Math.max(1,Math.ceil(Math.max(width/ow,height/oh)));sampled=await source.readSampled({x:0,y:0,w:width,h:height,step});check();if(sampled.width!==Math.ceil(width/step)||sampled.height!==Math.ceil(height/step)||sampled.data?.length!==sampled.width*sampled.height*3)throw Error('Invalid sampled original');}
  for(let y=0;y<oh;y++){check();const sy=Math.min(height-1,Math.floor((y+.5)*height/oh)),row=view==='overlay'&&!source.data&&!sampled?await source.readPixels({x:0,y:sy,width,height:1}):null;
   if(row&&row.data?.length!==width*3)throw Error('Invalid original RGB rows');
   for(let x=0;x<ow;x++){const sx=Math.min(width-1,Math.floor((x+.5)*width/ow)),rgb=colors.get(labels[sy*width+sx]),at=(y*ow+x)*3;
    if(view==='labels'){for(let c=0;c<3;c++)output[at+c]=rgb?.[c]??0;continue;}
    const original=source.data??sampled?.data??row.data,index=source.data?(sy*width+sx)*3:sampled?(Math.floor(sy/step)*sampled.width+Math.floor(sx/step))*3:sx*3;
    for(let c=0;c<3;c++)output[at+c]=rgb?Math.round(original[index+c]*(1-alpha)+rgb[c]*alpha):original[index+c];
   }
   if((y&63)===63)await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();return{width:ow,height:oh,logicalWidth:width,logicalHeight:height,preview:true,format:'rgb8',data:output,presentation:{view,opacity,preview:true,nativeResolution:ow===width&&oh===height,sampling:'nearest-native-label-and-source',sampleWidth:ow,sampleHeight:oh}};
 }
 const colors=new Map(regionColors.map(x=>[x.id,x.rgb])),output=new Uint8Array(n*3),alpha=opacity/100;
 for(let top=0;top<height;top+=256){check();const end=Math.min(height,top+256)*width;
  const rowSource=source.data?null:await source.readPixels({x:0,y:top,width,height:Math.min(256,height-top)});
  const original=source.data??rowSource.data,base=source.data?0:top*width*3;
  for(let i=top*width;i<end;i++){const rgb=colors.get(labels[i]);for(let c=0;c<3;c++)output[i*3+c]=view==='labels'?(rgb?.[c]??0):(rgb?Math.round(original[i*3+c-base]*(1-alpha)+rgb[c]*alpha):original[i*3+c-base]);}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 check();return{width,height,format:'rgb8',data:output};
}

// Preserve the validated two-panel Both view, including signed thresholds.
async function renderBothEnergyV1(data,source,{view='overlay',opacity=70,field='high',threshold=0,scoreView='map'}={}, {signal,preview,observedMaxima:knownMaxima,signedRanges:knownRanges}={}){
 if(!['overlay','labels','scores'].includes(view)||!Number.isInteger(opacity)||opacity<0||opacity>100)throw Error('Invalid energy presentation');
 const check=()=>{if(signal?.aborted)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});};check();
 if(view==='scores'){
  if(!['low','high','both'].includes(field)||!Number.isFinite(threshold)||!['map','overlay'].includes(scoreView))throw Error('Invalid energy score presentation');
  const {width,height,energy_scope:scope}=data,n=width*height,fields=field==='both'?['high','low']:[field],logicalWidth=width*fields.length;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||!Number.isSafeInteger(logicalWidth)||['high','low'].some(key=>!(data['energy_'+key+'_score'] instanceof Float32Array)||data['energy_'+key+'_score'].length!==n)||!(scope instanceof Int32Array)||scope.length!==n)throw Error('Invalid raw energy score map or reference scope');
  let scale=1;if(preview){const {maxWidth,maxHeight}=preview;if(!Number.isSafeInteger(maxWidth)||maxWidth<fields.length||maxWidth>ADAPTIVE_PREVIEW_MAX_SIDE||!Number.isSafeInteger(maxHeight)||maxHeight<1||maxHeight>ADAPTIVE_PREVIEW_MAX_SIDE)throw Error('Invalid energy preview bounds');scale=Math.min(1,maxWidth/logicalWidth,maxHeight/height);}
  const paneWidth=Math.max(1,Math.floor(width*scale)),outHeight=Math.max(1,Math.floor(height*scale)),outputWidth=paneWidth*fields.length,isPreview=paneWidth!==width||outHeight!==height;
  if(scoreView==='overlay'&&(!source||(source.data?source.data.length!==n*3:source.width!==width||source.height!==height)))throw Error('Energy dimensions differ from original');
  const output=new Uint8Array(outputWidth*outHeight*3),observedMaxima=Object.fromEntries(fields.map(key=>[key,0])),ranges=Object.fromEntries(fields.map(key=>[key,{minimum:Infinity,maximum:-Infinity}])),alpha=.35;
  // Only a small, explicitly approximate RGB source is read for a drag preview.
  // Exact views retain native pixels and read bounded source scanlines.
  let sampledSource,sourceStep;if(isPreview&&scoreView==='overlay'&&!source.data&&source.readSampled){sourceStep=Math.max(1,Math.ceil(Math.max(width/paneWidth,height/outHeight)));sampledSource=await source.readSampled({x:0,y:0,w:width,h:height,step:sourceStep});check();if(sampledSource.width!==Math.ceil(width/sourceStep)||sampledSource.height!==Math.ceil(height/sourceStep)||sampledSource.data?.length!==sampledSource.width*sampledSource.height*3)throw Error('Invalid sampled original');}
  for(let top=0;top<outHeight;top+=256){check();const bottom=Math.min(outHeight,top+256);
   let sourceRows;if(scoreView==='overlay'&&!source.data&&!isPreview)sourceRows=await source.readPixels({x:0,y:top,width,height:bottom-top});
   for(let y=top;y<bottom;y++){
    const sy=isPreview?Math.min(height-1,Math.floor((y+.5)*height/outHeight)):y;
    const fallbackRow=scoreView==='overlay'&&!source.data&&isPreview&&!sampledSource?await source.readPixels({x:0,y:sy,width,height:1}):null;
    if(fallbackRow&&fallbackRow.data?.length!==width*3)throw Error('Invalid original RGB rows');
    check();for(let panel=0;panel<fields.length;panel++){
     const key=fields[panel],scores=data['energy_'+key+'_score'],opposite=data['energy_'+(key==='high'?'low':'high')+'_score'];let maximum=observedMaxima[key],minimum=ranges[key].minimum,signedMaximum=ranges[key].maximum,at=(y*outputWidth+panel*paneWidth)*3;
     if(!isPreview){
      const start=y*width,end=start+width;
      if(scoreView==='map')for(let i=start;i<end;i++,at+=3){if((i&8191)===0)check();const positive=scores[i],negative=opposite[i];if(!Number.isFinite(positive)||positive<0||!Number.isFinite(negative)||negative<0)throw Error('Invalid raw energy score');if(scope[i]<=0)continue;const score=positive-negative;maximum=Math.max(maximum,positive);minimum=Math.min(minimum,score);signedMaximum=Math.max(signedMaximum,score);if(score>=threshold)output[at+(score<0?2:0)]=Math.max(0,Math.min(255,Math.round(Math.abs(score)*255)));}
      else{const original=source.data??sourceRows.data,base=source.data?0:top*width*3;if(original?.length!==(source.data?n*3:(bottom-top)*width*3))throw Error('Invalid original RGB rows');for(let i=start;i<end;i++,at+=3){if((i&8191)===0)check();const positive=scores[i],negative=opposite[i];if(!Number.isFinite(positive)||positive<0||!Number.isFinite(negative)||negative<0)throw Error('Invalid raw energy score');const score=positive-negative,admitted=scope[i]>0;if(admitted){maximum=Math.max(maximum,positive);minimum=Math.min(minimum,score);signedMaximum=Math.max(signedMaximum,score);}const intensity=admitted&&score>=threshold?Math.max(0,Math.min(255,Math.round(Math.abs(score)*255))):0,index=i*3-base;
        output[at]=intensity===0?original[index]:Math.round(original[index]*(1-alpha)+(score<0?0:intensity)*alpha);output[at+1]=intensity===0?original[index+1]:Math.round(original[index+1]*(1-alpha));output[at+2]=intensity===0?original[index+2]:Math.round(original[index+2]*(1-alpha)+(score<0?intensity:0)*alpha);
       }}
      observedMaxima[key]=maximum;ranges[key]={minimum,maximum:signedMaximum};continue;
     }
     for(let x=0;x<paneWidth;x++,at+=3){if((x&8191)===0)check();const sx=Math.min(width-1,Math.floor((x+.5)*width/paneWidth)),i=sy*width+sx,positive=scores[i],negative=opposite[i];if(!Number.isFinite(positive)||positive<0||!Number.isFinite(negative)||negative<0)throw Error('Invalid raw energy score');const score=positive-negative,admitted=scope[i]>0;if(admitted){maximum=Math.max(maximum,positive);minimum=Math.min(minimum,score);signedMaximum=Math.max(signedMaximum,score);}const intensity=admitted&&score>=threshold?Math.max(0,Math.min(255,Math.round(Math.abs(score)*255))):0;
      if(scoreView==='map')output[at+(score<0?2:0)]=intensity;
      else{let original,index;if(source.data){original=source.data;index=(sy*width+sx)*3;}else if(sampledSource){original=sampledSource.data;index=(Math.floor(sy/sourceStep)*sampledSource.width+Math.floor(sx/sourceStep))*3;}else if(fallbackRow){original=fallbackRow.data;index=sx*3;}else{original=sourceRows.data;index=((y-top)*width+sx)*3;}
       const channel=score<0?2:0;for(let c=0;c<3;c++)output[at+c]=intensity===0?original[index+c]:Math.round(original[index+c]*(1-alpha)+(c===channel?intensity:0)*alpha);
      }
     }
     observedMaxima[key]=maximum;ranges[key]={minimum,maximum:signedMaximum};
    }
   }
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  // A sampled maximum must never masquerade as the native map's maximum.
  const maxima=isPreview?Object.fromEntries(fields.filter(key=>Number.isFinite(knownMaxima?.[key])&&knownMaxima[key]>=0).map(key=>[key,knownMaxima[key]])):observedMaxima;
  const signedRanges=isPreview?Object.fromEntries(fields.filter(key=>Number.isFinite(knownRanges?.[key]?.minimum)&&Number.isFinite(knownRanges[key].maximum)).map(key=>[key,{...knownRanges[key]}])):Object.fromEntries(fields.map(key=>[key,Number.isFinite(ranges[key].minimum)?ranges[key]:{minimum:0,maximum:0}]));
  let observedMaximum=0,signedMinimum=Infinity,signedMaximum=-Infinity;for(const key of fields){if(maxima[key]!==undefined)observedMaximum=Math.max(observedMaximum,maxima[key]);if(signedRanges[key]){signedMinimum=Math.min(signedMinimum,signedRanges[key].minimum);signedMaximum=Math.max(signedMaximum,signedRanges[key].maximum);}}
  check();return {width:outputWidth,height:outHeight,logicalWidth,logicalHeight:height,preview:isPreview,format:'rgb8',data:output,presentation:{view,field,threshold,scoreView,preview:isPreview,nativeResolution:!isPreview,sourceWidth:width,sourceHeight:height,...(isPreview?{sampling:'nearest-source-pixel-center',sampleWidth:outputWidth,sampleHeight:outHeight}:{}),...(Object.keys(maxima).length?{observedMaxima:maxima,...(Object.keys(maxima).length===fields.length?{observedMaximum}:{})}:{}),...(Object.keys(signedRanges).length?{signedRanges,...(Object.keys(signedRanges).length===fields.length?{signedMinimum,signedMaximum}:{})}:{}),...(field==='both'?{panels:fields.map((key,index)=>({field:key,x:index*width,y:0,width,height}))}:{}),color:'clamp(round(abs(signed-score)*255),0,255); positive=red; negative=blue',signedScore:field==='both'?'high-low; low-high':field==='high'?'high-low':'low-high',referenceScope:'energy_scope>0',...(scoreView==='overlay'?{overlayOpacity:alpha,blackTransparent:true}:{}),probability:false}};
 }
}
