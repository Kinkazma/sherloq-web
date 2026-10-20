import {histogramSummary} from './unified-engine/src/histogram.js';
import {roundEven} from './unified-engine/src/pixel-utils.js';
import {VIRIDIS} from './unified-engine/src/viridis.js';
import {ZERO_PALETTE} from './unified-engine/src/zero-palette.js';
import {GRAY_PALETTE} from './unified-engine/src/gray-palette.js';
import {GHOST_PALETTES} from './unified-engine/src/ghost-palettes.js';
import {INFERNO,SAFIRE_COLORS} from './unified-engine/src/research-palettes.js';
import {illuminantCellDisplay} from './unified-engine/src/illuminant.js';
import {detectionBiomes} from './detection-biomes.js?v=0.23.0';
import {composeBiomeWindow} from './detection-biome-presentation.js?v=0.23.0';
import {createAdaptivePreview} from './adaptive-preview.js?v=0.23.0';

const MAX_SIDE=2048,LEGACY_SIDE=256,MAX_CELLS=131072;
const adaptive=createAdaptivePreview(),adaptiveSafire=createAdaptivePreview({targetMs:200});
const now=()=>globalThis.performance?.now?.()??Date.now();
const invalid=message=>Object.assign(new TypeError(message),{code:'INVALID_INPUT'});
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Preview cancelled'),{code:'CANCELLED'});};
const array=value=>ArrayBuffer.isView(value)||Array.isArray(value);
const finiteArray=(value,length)=>array(value)&&value.length===length;
const clamp=value=>Math.max(0,Math.min(255,roundEven(value)));
function geometry(width,height,maxSide=LEGACY_SIDE){
 if(![width,height,maxSide].every(Number.isSafeInteger)||width<1||height<1||maxSide<1||maxSide>MAX_SIDE)throw invalid('Invalid retained preview geometry.');
 const step=Math.max(1,Math.ceil(Math.max(width,height)/maxSide));return {x:0,y:0,w:width,h:height,step,width:Math.ceil(width/step),height:Math.ceil(height/step)};
}
function dimensions(output,source){const d=output?.data??{},s=source?.surface??source?.pixels??source;return [d.geometry?.imageWidth??d.width??output?.surface?.width??output?.pixels?.width??d.sourceDimensions?.[0]??s?.width,d.geometry?.imageHeight??d.height??output?.surface?.height??output?.pixels?.height??d.sourceDimensions?.[1]??s?.height];}
/** Plan before admitting memory. The key describes rendering cost only, never
 * the source identity. Native final windows do not use this provisional plan. */
export function planRetainedPreview(args={}){
 const operation=args.operation??args.output?.operation,d=args.output?.data??{},p=args.params??{},v=args.view??{};
 if(!args.output||operation==='inspection.histogram')return null;
 let [width,height]=dimensions(args.output,args.source);
 if(operation==='jpeg.ghosts'){width=d.cols;height=d.rows;}
 else if(operation==='tampering.resampling'||operation==='tampering.resampling.fourier')width=height=d.geometry?.outputSide??width;
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0))return null;
 const variant=operation==='colors.pca'?p.mode??'distance':operation?.startsWith('ai.')?v.mode??'overlay':operation?.startsWith('tampering.copyMove.')?`${!!v.areas}/${!!v.circles}/${!!v.lines}/${!!p.showPoints}/${!!p.hideLines}`:'';
 const grouping=operation==='ai.sources.safire'&&['groups','kind','eps','minimum','binary'].includes(args.field),controller=grouping?adaptiveSafire:adaptive,cost=grouping?`${p.kind??'kmeans'}/${p.binary?'binary':'sources'}/${Math.floor(Math.log2(Math.max(1,p.groups??3)))}`:variant;
 return controller.plan({key:'retained/'+operation+'/'+cost,width,height,maxSide:args.maxSide??MAX_SIDE,maxPixels:args.maxPixels??MAX_SIDE**2,feedback:args.adaptiveFeedback});
}
function sampled(pixels,g){
 if(pixels?.pixels)pixels=pixels.pixels;
 if(!pixels||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3)return null;
 if(pixels.width===g.width&&pixels.height===g.height)return {...pixels,data:pixels.data.slice()};
 if(pixels.width!==g.w||pixels.height!==g.h)return null;
 const data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const at=(y*g.step*pixels.width+x*g.step)*3;data.set(pixels.data.subarray(at,at+3),(y*g.width+x)*3);}return {width:g.width,height:g.height,format:'rgb8',data};
}
async function sourceFrame(a,g){
 abort(a.signal);let value;
 if(typeof a.readSource==='function')value=await a.readSource(g);
 else if(a.source?.data||a.source?.pixels?.data)value=a.source;
 else if(a.source&&a.readTile)value=await a.readTile(a.source.surface??a.source,g);
 else return null;
 try{abort(a.signal);return sampled(value,g);}finally{value?.release?.();}
}
async function descriptorFrame(a,descriptor,g){if(!descriptor)return null;if(descriptor.data)return sampled(descriptor,g);if(!a.readTile)return null;const answer=await a.readTile(descriptor,g);try{abort(a.signal);return sampled(answer,g);}finally{answer?.release?.();}}
function frame(g,data){return {width:g.width,height:g.height,format:'rgb8',data,logicalWidth:g.w,logicalHeight:g.h,provisional:true};}
const gray=(data,i)=>.299*data[i*3]+.587*data[i*3+1]+.114*data[i*3+2];
function sampleIndex(g,x,y,width=g.w){return y*g.step*width+x*g.step;}
function paintPoint(data,g,x,y,color,radius=0){x=roundEven(x/g.step);y=roundEven(y/g.step);const r=Math.max(0,Math.min(32,roundEven(radius/g.step)));if(x+r<0||x-r>=g.width||y+r<0||y-r>=g.height)return;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(r===0||Math.abs(Math.hypot(dx,dy)-r)<.8){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<g.width&&yy>=0&&yy<g.height)data.set(color,(yy*g.width+xx)*3);}}
function paintLine(data,g,ax,ay,bx,by,color){const dx=(bx-ax)/g.step,dy=(by-ay)/g.step,steps=Math.min(512,Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)))));for(let i=0;i<=steps;i++)paintPoint(data,g,ax+(bx-ax)*i/steps,ay+(by-ay)*i/steps,color);}
async function classicalClones(a,d,p,g){
 if(!array(d.points)||d.points.length%7||!array(d.matches)||d.matches.length%3||d.matches.length>2048*3||!array(d.groupLengths)||!array(d.groupIndices)||d.groupIndices.length>8192||d.groupLengths.length>2048||p.showPoints&&d.points.length>4096*7)return null;
 const base=await sourceFrame(a,g);if(!base)return null;const data=base.data,minimum=d.minimum??p.minimum??5;
 if(p.showPoints)for(let at=0;at<d.points.length;at+=7)paintPoint(data,g,Math.trunc(d.points[at]),Math.trunc(d.points[at+1]),[72,227,250],2);
 let offset=0;for(const length of d.groupLengths){abort(a.signal);if(!Number.isSafeInteger(length)||length<0||offset+length>d.groupIndices.length)return null;if(length>=minimum)for(let j=offset;j<offset+length;j++){
  const row=d.groupIndices[j];if(!Number.isSafeInteger(row)||row<0||row>=d.matches.length/3)return null;const at=row*3,ai=d.matches[at]*7,bi=d.matches[at+1]*7;if(!Number.isSafeInteger(ai)||!Number.isSafeInteger(bi)||ai<0||bi<0||ai+6>=d.points.length||bi+6>=d.points.length)return null;
  const ax=Math.trunc(d.points[ai]),ay=Math.trunc(d.points[ai+1]),bx=Math.trunc(d.points[bi]),by=Math.trunc(d.points[bi+1]);let angle=Math.atan2(by-ay,bx-ax);if(angle<0)angle+=Math.PI;const h=(Math.trunc(angle/Math.PI*180)&255)/30,v=Math.trunc(d.matches[at+2]/((p.matching??20)/100*255)*255)&255,x=v*(1-Math.abs(h%2-1)),color=(h<1?[v,x,0]:h<2?[x,v,0]:h<3?[0,v,x]:h<4?[0,x,v]:h<5?[x,0,v]:[v,0,x]).map(roundEven);
  paintPoint(data,g,ax,ay,color,roundEven(d.points[ai+2]));paintPoint(data,g,bx,by,color,roundEven(d.points[bi+2]));if(!p.hideLines)paintLine(data,g,ax,ay,bx,by,color);
 }offset+=length;}return frame(g,data);
}
function histogram(output,params){
 const d=output?.data;if(!finiteArray(d?.bins,1024))return null;const channel=params.channel??3,start=params.start??0,end=params.end??255;
 if(![channel,start,end].every(Number.isInteger)||channel<0||channel>3||start<0||start>255||end<0||end>255)throw invalid('Invalid histogram preview range.');
 const bins=d.bins instanceof Float64Array?d.bins:Float64Array.from(d.bins);let total=0;for(let i=0;i<256;i++)total+=bins[i];
 return {summary:histogramSummary(bins,channel,start,end,total),bins:d.bins,cumulative:d.cumulative,channel,start,end};
}
function updated(output,params,patch){return {...output,...patch,provenance:{...output.provenance,params:{...output.provenance?.params,...params}},metrics:{...output.metrics,previewCommit:{nativeAnalysisCalls:0,retained:true}}};}
function sameAnalysis(output,params,displayKeys){const prior=output.provenance?.params??{};return Object.keys(params).every(key=>displayKeys.includes(key)||!Object.hasOwn(prior,key)||JSON.stringify(params[key])===JSON.stringify(prior[key]));}
function parameterView(output,kind,params,view,width,height){const identity=JSON.stringify([kind,params,view]);return {id:output.id+'-presentation-'+identity,revision:1,width,height,format:'rgb8',retainedParameterView:{kind,params:{...params},view:{...view},nativeData:output.data,sourceSize:[width,height]}};}
/** Return a separate exact final output only when no native raster work is
 * needed. Other finals must use the existing cache-aware native pipeline. */
export function updateRetainedParameters({output,operation=output?.operation,params={},view={}}={}){
 if(!output)return null;
 if(operation==='inspection.histogram'){const result=histogram(output,params);return result?updated(output,params,{data:{...output.data,summary:result.summary}}):null;}
 const d=output.data??{},[width,height]=dimensions(output);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height))return null;
 if(operation?.startsWith('ai.sources.')||operation?.startsWith('ai.localization.')){
  if(!sameAnalysis(output,params,[]))return null;const mode=view.mode??'overlay',method=d.metadata?.method,multi=method==='safire'&&!d.metadata?.binary,[rows,cols]=d.metadata?.native_shape??[],field=mode==='mask'?'mask':multi&&mode!=='confidence'?'source_labels':'map';
  if(!['overlay','map',...(method==='adaifl'?['mask']:[]),...(multi?['confidence']:[])].includes(mode)||!finiteArray(d[field],rows*cols))return null;
  return updated(output,params,{parameterViews:[parameterView(output,'research',params,{mode},width,height)],style:{...output.style,mode}});
 }
 if(operation==='jpeg.ghosts'&&sameAnalysis(output,params,['grayscale'])&&!params.includeOriginal&&finiteArray(d.maps,d.cols*d.rows*d.qualities?.length))return updated(output,params,{parameterViews:Array.from(d.qualities,(_,index)=>parameterView(output,'ghosts',params,{index},d.cols,d.rows))});
 if(operation==='various.illuminant'&&sameAnalysis(output,params,['mode'])&&(params.block??d.block)===d.block&&finiteArray(d.rgb,d.rows*d.cols*3)&&finiteArray(d.counts,d.rows*d.cols)&&finiteArray(d.areas,d.rows*d.cols)&&finiteArray(d.valid,d.rows*d.cols)&&finiteArray(d.globalRGB,3))return updated(output,params,{parameterViews:[parameterView(output,'illuminant',params,{},width,height)]});
 return null;
}
function windowGeometry(display,tile={}){const x=tile.x??0,y=tile.y??0,w=tile.w??display.width,h=tile.h??display.height,step=tile.step??1;if(![x,y,w,h,step,display.width,display.height].every(Number.isSafeInteger)||x<0||y<0||w<1||h<1||step<1||x+w>display.width||y+h>display.height)throw invalid('Invalid retained presentation window.');return {x,y,w,h,step,width:Math.ceil(w/step),height:Math.ceil(h/step)};}
/** Exact native-grid presentation. The caller admits the requested RGB window
 * and preserves the original engine handles for export and resource disposal. */
export async function renderRetainedWindow({display,tile={},readSource,signal}={}){
 abort(signal);const v=display?.retainedParameterView;if(!v)throw invalid('Missing retained presentation contract.');const g=windowGeometry(display,tile),d=v.nativeData,p=v.params??{},mode=v.view?.mode??'overlay',data=new Uint8Array(g.width*g.height*3);let source;
 if(v.kind==='research'&&mode==='overlay'){if(typeof readSource!=='function')throw invalid('Native source reader required.');source=await readSource({x:g.x,y:g.y,w:g.w,h:g.h,step:g.step});if(source?.pixels)source=source.pixels;if(!source||source.format!=='rgb8'||source.width!==g.width||source.height!==g.height||!(source.data instanceof Uint8Array)||source.data.length!==data.length)throw invalid('Retained source window geometry changed.');abort(signal);}
 const [rows,cols]=d.metadata?.native_shape??[],multi=d.metadata?.method==='safire'&&!d.metadata.binary,palette=GHOST_PALETTES[p.grayscale!==false?'gray':'viridis'],cellColors=new Map();
 for(let y=0;y<g.height;y++){if(y%32===0){abort(signal);await Promise.resolve();}for(let x=0;x<g.width;x++){const xx=g.x+x*g.step,yy=g.y+y*g.step,at=(y*g.width+x)*3;let color;
  if(v.kind==='research'){const i=Math.floor(yy*rows/display.height)*cols+Math.floor(xx*cols/display.width);if(mode==='mask'){const value=d.mask[i]*255;color=[value,value,value];}else if(multi&&mode!=='confidence')color=SAFIRE_COLORS[d.source_labels[i]];else{const index=roundEven(Math.fround(Math.max(0,Math.min(1,d.map[i]))*255))*3;color=INFERNO.subarray(index,index+3);}if(!color||color.length!==3)throw invalid('Invalid retained research sample.');for(let c=0;c<3;c++)data[at+c]=mode==='overlay'?roundEven((source.data[at+c]+color[c])*.5):color[c];}
  else if(v.kind==='ghosts'){const index=Math.max(0,Math.min(255,Math.floor(d.maps[(yy*d.cols+xx)*d.qualities.length+v.view.index]*256)));data.set(palette.slice(index*3,index*3+3),at);}
  else if(v.kind==='illuminant'){const cell=Math.floor(yy/d.block)*d.cols+Math.floor(xx/d.block);let color=cellColors.get(cell);if(!color){const unit=d.rgb.subarray(cell*3,cell*3+3);color=illuminantCellDisplay(unit,d.counts[cell],d.areas[cell],d.valid[cell],d.globalRGB,{...p,mode:p.mode??0,linear:p.linear!==false}).color;if(cellColors.size>=256)cellColors.clear();cellColors.set(cell,color);}data.set(color,at);}
  else throw invalid('Unsupported retained presentation.');
 }}abort(signal);return {width:g.width,height:g.height,format:'rgb8',data};
}
export function retainedPreviewWorkingBytes({maxSide=LEGACY_SIDE,plan}={}){if(plan){if(plan.token?.schema!=='adaptive-preview-token/1'||![plan.width,plan.height,plan.side,plan.pixels].every(Number.isSafeInteger)||plan.side<1||plan.side>MAX_SIDE||plan.pixels<1||plan.pixels>MAX_SIDE**2)throw invalid('Invalid retained preview plan.');return plan.pixels*40+MAX_CELLS*16+65536;}if(!Number.isInteger(maxSide)||maxSide<1||maxSide>MAX_SIDE)throw invalid('Invalid retained preview bound.');return maxSide*maxSide*40+MAX_CELLS*16+65536;}
function median(d,p,g,signal){
 const q=d.geometry,n=q?.width*q?.height;if(!Number.isSafeInteger(n)||n<1||n>MAX_CELLS||!finiteArray(d.probabilities,n)||!finiteArray(d.variances,n))return null;
 const rgb=new Uint8Array(n*3),neighbors=new Float32Array(9),threshold=Math.fround(p.threshold??.4),variance=p.variance??5;
 if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(variance)||variance<0)throw invalid('Invalid retained median threshold.');
 for(let y=0;y<q.height;y++){abort(signal);for(let x=0;x<q.width;x++){const i=y*q.width+x;let score=d.probabilities[i];if(p.speckle!==false){let k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)neighbors[k++]=d.probabilities[Math.max(0,Math.min(q.height-1,y+dy))*q.width+Math.max(0,Math.min(q.width-1,x+dx))];neighbors.sort();score=neighbors[4];}const valid=d.variances[i]>=variance;if(p.showScore)rgb.fill(valid?clamp(Math.fround(score*255)):0,i*3,i*3+3);else rgb.set(valid?score>=threshold?[255,0,0]:[0,255,0]:[0,0,255],i*3);}}
 const data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const at=(Math.min(q.height-1,Math.floor(y*g.step/64))*q.width+Math.min(q.width-1,Math.floor(x*g.step/64)))*3;data.set(rgb.subarray(at,at+3),(y*g.width+x)*3);}return frame(g,data);
}
function contrast(d,p,g,signal){
 const n=d.cols*d.rows,mode=p.mode??2,b=p.block??d.block;if(!Number.isInteger(n)||n<1||n>MAX_CELLS||!finiteArray(d.values,n*3)||b!==d.block||![0,1,2].includes(mode))return null;
 const grid=new Uint8Array(n),nine=new Uint8Array(9);for(let i=0;i<n;i++)grid[i]=clamp(Math.abs(d.values[i*3+mode]*255));
 const data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++){abort(signal);for(let x=0;x<g.width;x++){const cy=Math.min(d.rows-1,Math.floor(y*g.step/b)),cx=Math.min(d.cols-1,Math.floor(x*g.step/b));let k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)nine[k++]=grid[Math.max(0,Math.min(d.rows-1,cy+dy))*d.cols+Math.max(0,Math.min(d.cols-1,cx+dx))];nine.sort();data.fill(nine[4],(y*g.width+x)*3,(y*g.width+x)*3+3);}}return frame(g,data);
}
function illuminant(d,p,g,signal){
 const n=d.rows*d.cols,b=p.block??d.block,mode=p.mode??0;if(!Number.isInteger(n)||n<1||n>MAX_CELLS||!finiteArray(d.rgb,n*3)||!finiteArray(d.counts,n)||!finiteArray(d.areas,n)||!finiteArray(d.valid,n)||!finiteArray(d.globalRGB,3)||b!==d.block||![0,1,2].includes(mode))return null;
 const data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++){abort(signal);for(let x=0;x<g.width;x++){const cell=Math.min(d.rows-1,Math.floor(y*g.step/b))*d.cols+Math.min(d.cols-1,Math.floor(x*g.step/b)),at=(y*g.width+x)*3;if(mode===2)data.fill(clamp(d.counts[cell]/d.areas[cell]*255),at,at+3);else if(!d.valid[cell])data.fill(64,at,at+3);else if(mode===1){const [r,gg,bb]=d.rgb.subarray(cell*3,cell*3+3),[R,G,B]=d.globalRGB,cross=[gg*B-bb*G,bb*R-r*B,r*G-gg*R],angle=Math.atan2(Math.hypot(...cross),r*R+gg*G+bb*B)*180/Math.PI,index=clamp(angle/90*255)*3;data.set(VIRIDIS.slice(index,index+3),at);}else{const max=Math.max(...d.rgb.subarray(cell*3,cell*3+3));for(let c=0;c<3;c++){let v=d.rgb[cell*3+c]/max;if(p.linear!==false)v=v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;data[at+c]=clamp(v*255);}}}}return frame(g,data);
}
async function pca(a,d,p,g){
 if(!finiteArray(d.mean,3)||!finiteArray(d.eigenvectors,9))return null;const base=await sourceFrame(a,g);if(!base)return null;const component=p.component??0,mode=p.mode??'distance';if(![0,1,2].includes(component)||!['distance','project','crossprod'].includes(mode))throw invalid('Invalid PCA preview view.');
 const v=Array.from(d.eigenvectors).slice(component*3,component*3+3),channels=mode==='crossprod'?3:1,values=new Float64Array(g.width*g.height*channels),lo=Array(channels).fill(Infinity),hi=Array(channels).fill(-Infinity);
 for(let i=0;i<g.width*g.height;i++){const delta=[base.data[i*3+2]-d.mean[0],base.data[i*3+1]-d.mean[1],base.data[i*3]-d.mean[2]],cross=[delta[1]*v[2]-delta[2]*v[1],delta[2]*v[0]-delta[0]*v[2],delta[0]*v[1]-delta[1]*v[0]],result=mode==='project'?[delta[0]*v[0]+delta[1]*v[1]+delta[2]*v[2]]:mode==='distance'?[Math.hypot(...cross)/(Math.hypot(...v)||1)]:cross;for(let c=0;c<channels;c++){values[i*channels+c]=result[c];lo[c]=Math.min(lo[c],result[c]);hi[c]=Math.max(hi[c],result[c]);}}
 const data=new Uint8Array(base.data.length);for(let i=0;i<g.width*g.height;i++)for(let c=0;c<3;c++){const k=channels===1?0:2-c,value=hi[k]>lo[k]?clamp((values[i*channels+k]-lo[k])/(hi[k]-lo[k])*255):0;data[i*3+c]=p.invert?255-value:value;}
 if(p.equalize)for(let c=0;c<3;c++){const bins=new Uint32Array(256);for(let i=c;i<data.length;i+=3)bins[data[i]]++;let first=0;while(first<255&&!bins[first])first++;if(bins[first]===g.width*g.height)continue;let sum=0;const lut=new Uint8Array(256),scale=255/(g.width*g.height-bins[first]);for(let i=first+1;i<256;i++){sum+=bins[i];lut[i]=clamp(sum*scale);}for(let i=c;i<data.length;i+=3)data[i]=lut[data[i]];}
 abort(a.signal);return frame(g,data);
}
async function research(a,d,g){
 const [rows,cols]=d.metadata?.native_shape??[],n=rows*cols,mode=a.view?.mode??'overlay',method=d.metadata?.method,multi=method==='safire'&&!d.metadata.binary;
 if(!Number.isSafeInteger(n)||n<1||!['overlay','map',...(method==='adaifl'?['mask']:[]),...(multi?['confidence']:[])].includes(mode))return null;
 const field=mode==='mask'?'mask':multi&&mode!=='confidence'?'source_labels':'map';if(!finiteArray(d[field],n))return null;const base=mode==='overlay'?await sourceFrame(a,g):null;if(mode==='overlay'&&!base)return null;
 const data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++){abort(a.signal);const sy=Math.min(rows-1,Math.floor(y*g.step*rows/g.h));for(let x=0;x<g.width;x++){const i=sy*cols+Math.min(cols-1,Math.floor(x*g.step*cols/g.w)),at=(y*g.width+x)*3;let color;if(mode==='mask'){const value=d.mask[i]*255;color=[value,value,value];}else if(multi&&mode!=='confidence')color=SAFIRE_COLORS[d.source_labels[i]];else{const index=roundEven(Math.fround(Math.max(0,Math.min(1,d.map[i]))*255))*3;color=INFERNO.subarray(index,index+3);}if(!color||color.length!==3)return null;for(let c=0;c<3;c++)data[at+c]=mode==='overlay'?roundEven((base.data[at+c]+color[c])*.5):color[c];}}return frame(g,data);
}
async function zero(a,d,p,g){
 const mode=p.view??0,data=new Uint8Array(g.width*g.height*3),n=g.w*g.h,raw=key=>finiteArray(d[key],n)?d[key]:null;
 if(mode===1||mode===2){const votes=raw(mode===1?'votes':'votes_jpeg');if(!votes)return null;for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const vote=votes[sampleIndex(g,x,y)],at=(y*g.width+x)*3;if(vote>=0&&vote<64)data.set(ZERO_PALETTE.slice(vote*3,vote*3+3),at);}return frame(g,data);}
 const sampleMask=async key=>{const mask=raw(key);if(mask){const out=new Uint8Array(g.width*g.height);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)out[y*g.width+x]=Number(mask[sampleIndex(g,x,y)]>0);return out;}const descriptor=a.output.maskSurfaces?.[key]??a.output.masks?.[key],pixels=await descriptorFrame(a,descriptor,g);return pixels?Uint8Array.from({length:g.width*g.height},(_,i)=>Number(pixels.data[i*3]>0)):null;};
 const foreign=mode===4?null:await sampleMask('mask_f_reg'),missing=mode===3?null:await sampleMask('mask_m_reg');if((mode!==4&&!foreign)||(mode!==3&&!missing))return null;
 if(mode===3||mode===4){const m=mode===3?foreign:missing;for(let i=0;i<m.length;i++)data.fill(m[i]?255:0,i*3,i*3+3);return frame(g,data);}
 const base=await sourceFrame(a,g);if(!base)return null;const hasRegion=(d.metadata?.foreign_regions?.length??0)+(d.metadata?.missing_regions?.length??0)>0||foreign.some(Boolean)||missing.some(Boolean);for(let i=0;i<foreign.length;i++){data.fill(Math.trunc(gray(base.data,i)*(hasRegion?.2:1)),i*3,i*3+3);if(foreign[i])data[i*3]=255;else if(missing[i])data[i*3+2]=255;}return frame(g,data);
}
async function noisesniffer(a,d,p,g){
 if(p.view==='distribution'){const raw=d.distribution;if(!finiteArray(raw,g.w*g.h*3))return null;return frame(g,sampled({width:g.w,height:g.h,format:'rgb8',data:raw},g).data);}
 const nativeParams=d.metadata?.parameters??[],block=nativeParams[1]??p.cellSize;if(!Number.isInteger(block)||block<1)return null;
 const mask=finiteArray(d.mask,g.w*g.h)?d.mask:null,regions=d.metadata?.regions;if(!mask&&!Array.isArray(regions))return null;
 const cells=new Set();if(!mask)for(const region of regions)for(const [y,x]of region.cells??[]){if(cells.size>MAX_CELLS)return null;cells.add(y+','+x);}
 const base=p.view==='mask'?null:await sourceFrame(a,g);if(p.view!=='mask'&&!base)return null;const data=base?base.data.slice():new Uint8Array(g.width*g.height*3);
 for(let y=0;y<g.height;y++){abort(a.signal);for(let x=0;x<g.width;x++){const i=y*g.width+x,on=mask?mask[sampleIndex(g,x,y)]>0:cells.has(Math.floor(y*g.step/block)+','+Math.floor(x*g.step/block));if(p.view==='mask')data.fill(on?255:0,i*3,i*3+3);else if(on)for(let c=0;c<3;c++)data[i*3+c]=Math.trunc(Math.fround(data[i*3+c]*Math.fround(.55))+(c===0?255*.45:0));}}return frame(g,data);
}
async function resampling(a,d,p,g){
 let values;if(finiteArray(d.magnitude,g.w*g.h)){values=new Float64Array(g.width*g.height);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)values[y*g.width+x]=d.magnitude[sampleIndex(g,x,y)];}
 else{const table=a.output.tableSurfaces?.magnitude;if(!table||!a.readTable)return null;const key='spectrum/'+table.id+'/'+table.revision+'/'+g.step;values=a.cache?.get(key);if(!values){values=new Float64Array(g.width*g.height);const span=(g.width-1)*g.step+1;if(span>32768)return null;for(let y=0;y<g.height;y++){abort(a.signal);const answer=await a.readTable(table,y*g.step*g.w,span),columns=answer.columns?.length??3;if(!(answer.data instanceof Float64Array)||answer.data.length!==span*columns)return null;for(let x=0;x<g.width;x++)values[y*g.width+x]=answer.data[x*g.step*columns+columns-1];}a.cache?.set(key,values);}}
 const params=p.fourier??p,low=d.minimumMagnitude,high=d.maximumMagnitude;if(![low,high,params.gamma??4].every(Number.isFinite))return null;const data=new Uint8Array(values.length*3);for(let i=0;i<values.length;i++){const value=Math.pow(high>low?(values[i]-low)/(high-low):0,params.gamma??4)*(params.rescale===false?1:high);data.fill(GRAY_PALETTE[Math.max(0,Math.min(255,Math.floor(value*256)))],i*3,i*3+3);}return frame(g,data);
}
/** Read only existing native arrays/fields. This function has no engine.run,
 * release-result, detector or model-loading capability. Missing retained data
 * returns null so the caller can keep its last valid frame until native work. */
export async function renderRetainedPreview(args={}){
 const started=now(),a={...args},output=a.output,operation=a.operation??output?.operation,params=a.params??{},d=output?.data??{};abort(a.signal);if(!output)return null;
 if(operation==='inspection.histogram'){const result=histogram(output,params);return result?{...result,data:{...d,...result},operation,output:updateRetainedParameters({output,operation,params}),provisional:true,exact:false,summaryExact:true,metrics:{nativeAnalysisCalls:0,inferenceCalls:0,sourceReads:0}}:null;}
 let [width,height]=dimensions(output,a.source);if(operation==='tampering.resampling'||operation==='tampering.resampling.fourier')width=height=d.geometry?.outputSide??width;
 if(operation==='jpeg.ghosts'){width=d.cols;height=d.rows;}
 if(!Number.isInteger(width)||!Number.isInteger(height))return null;
 const plan=a.adaptivePlan;if(plan&&(plan.token?.schema!=='adaptive-preview-token/1'||plan.logicalWidth!==width||plan.logicalHeight!==height||!Number.isSafeInteger(plan.step)||plan.step<1||plan.width!==Math.ceil(width/plan.step)||plan.height!==Math.ceil(height/plan.step)||plan.side!==Math.max(plan.width,plan.height)||plan.side>MAX_SIDE||plan.pixels!==plan.width*plan.height||plan.pixels>MAX_SIDE**2))throw invalid('Retained preview plan differs from its source.');
 const g=plan?{x:0,y:0,w:width,h:height,step:plan.step,width:plan.width,height:plan.height}:geometry(width,height,a.maxSide??LEGACY_SIDE);let pixels;
 if(operation==='various.median')pixels=median(d,params,g,a.signal);
 else if(operation==='tampering.contrast')pixels=contrast(d,params,g,a.signal);
 else if(operation==='various.illuminant')pixels=illuminant(d,params,g,a.signal);
 else if(operation==='colors.pca')pixels=await pca(a,d,params,g);
 else if(operation.startsWith('ai.sources.')||operation.startsWith('ai.localization.'))pixels=await research(a,d,g);
 else if(operation==='jpeg.zero')pixels=await zero(a,d,params,g);
 else if(operation==='noise.noisesniffer')pixels=await noisesniffer(a,d,params,g);
 else if(operation==='tampering.resampling'||operation==='tampering.resampling.fourier')pixels=await resampling(a,d,params,g);
 else if(['tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze'].includes(operation))pixels=await classicalClones(a,d,params,g);
 else if(operation==='jpeg.ghosts'){
  if(!finiteArray(d.maps,d.cols*d.rows*d.qualities?.length)||params.includeOriginal)return null;const index=Math.min(d.qualities.length-1,Math.max(0,Math.trunc(a.view?.index??0))),step=g,data=new Uint8Array(step.width*step.height*3),palette=GHOST_PALETTES[params.grayscale!==false?'gray':'viridis'];for(let y=0;y<step.height;y++)for(let x=0;x<step.width;x++){const value=Math.max(0,Math.min(255,Math.floor(d.maps[(y*step.step*d.cols+x*step.step)*d.qualities.length+index]*256))),at=(y*step.width+x)*3;data.set(palette.slice(value*3,value*3+3),at);}pixels=frame(step,data);
 }
 else if(operation==='tampering.copyMove.sparse'||operation==='tampering.copyMove.dense'){
  const style=a.view??{};if(!d.pairs||d.pairs.length>2048*4||d.groups?.length>2048)return null;let memberships=0;for(const group of d.groups??[]){memberships+=group.length;if(memberships>8192)return null;}let selectedRows=0;for(const group of output.selectedGroups??[]){selectedRows+=group.rows?.length??0;if(selectedRows>8192)return null;}
  const base=await sourceFrame(a,g);if(!base)return null;const groups=detectionBiomes(output,{style}).groups;pixels=style.areas===false?frame(g,base.data):frame(g,(a.composeBiomes??composeBiomeWindow)(base,groups,g,{signal:a.signal,scope:a.view?.scope,source:{width,height,sha256:output.provenance?.originalSha256}}).data);
  if(style.circles||style.lines||style.points)for(const group of groups){abort(a.signal);for(const row of group.pairIndexIds){const at=row*4,ai=d.pairs[at]*7,bi=d.pairs[at+1]*7,ax=d.points[ai],ay=d.points[ai+1],bx=d.points[bi],by=d.points[bi+1];if(style.lines)paintLine(pixels.data,g,ax,ay,bx,by,group.color);if(style.circles){paintPoint(pixels.data,g,ax,ay,group.color,d.points[ai+2]/2);paintPoint(pixels.data,g,bx,by,group.color,d.points[bi+2]/2);}if(style.points){paintPoint(pixels.data,g,ax,ay,group.color);paintPoint(pixels.data,g,bx,by,group.color);}}}
 }
 abort(a.signal);if(!pixels)return null;const milliseconds=now()-started,adaptivePreview=plan?{token:plan.token,milliseconds,setupMilliseconds:0,cold:false,pixels:pixels.width*pixels.height}:null;
 if(plan)adaptive.observe(plan,{milliseconds,pixels:pixels.width*pixels.height});
 return {pixels,logicalWidth:width,logicalHeight:height,provisional:true,exact:false,approximate:true,metrics:{nativeAnalysisCalls:0,inferenceCalls:0,maximumFramePixels:g.width*g.height,...(adaptivePreview?{adaptivePreview}:{})}};
}
export const previewRetainedParameters=renderRetainedPreview;
