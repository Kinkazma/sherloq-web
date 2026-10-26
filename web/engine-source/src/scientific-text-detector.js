/* Detector-only scientific text exclusions, PP-OCRv6 small.
 * Pre/postprocessing specifications: PaddleOCR (PaddlePaddle Authors),
 * Apache-2.0, https://github.com/PaddlePaddle/PaddleOCR and RapidOCR
 * (RapidAI), Apache-2.0, https://github.com/RapidAI/RapidOCR.
 * This implementation uses connected-component convex hulls and a direct
 * rectangle offset; it does not claim bit parity with OpenCV/PyClipper.
 */
import {EngineError,requireValue,checkAbort,createCooperator,serializeEngineError} from './errors.js';
async function retireTextSource(lease,primary){try{await lease?.release?.();}catch(error){if(!primary)throw error;primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),serializeEngineError(error)]};}}


export const SCIENTIFIC_TEXT_MODEL=Object.freeze({
 id:'PP-OCRv6_small_det',file:'PP-OCRv6_det_small.onnx',bytes:9929594,
 sha256:'090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f',
 source:'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv6/det/PP-OCRv6_det_small.onnx',
 specification:'https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det/blob/main/inference.yml',
 license:'Apache-2.0',input:'x',output:'fetch_name_0',version:'sherloq.text-detection/1',
 channels:'BGR',mean:Object.freeze([.485,.456,.406]),std:Object.freeze([.229,.224,.225]),
 minSide:736,bitmapThreshold:.2,boxThreshold:.45,unclipRatio:1.4,maxCandidates:3000,
});
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function hull(points){
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const unique=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);if(unique.length<3)return unique;
 const lower=[],upper=[];for(const p of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}lower.pop();upper.pop();return lower.concat(upper);
}
export function minimumTextRectangle(points){
 const boundary=hull(points);if(boundary.length<3)return null;let best;
 for(let edge=0;edge<boundary.length;edge++){
  const a=boundary[edge],b=boundary[(edge+1)%boundary.length],d=distance(a,b);if(!d)continue;const u=[(b[0]-a[0])/d,(b[1]-a[1])/d],v=[-u[1],u[0]];let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const p of boundary){const x=p[0]*u[0]+p[1]*u[1],y=p[0]*v[0]+p[1]*v[1];left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const area=(right-left)*(bottom-top);if(!best||area<best.area-1e-9)best={u,v,left,right,top,bottom,width:right-left,height:bottom-top,area};
 }
 if(best)best.polygon=rectanglePolygon(best);return best;
}
function rectanglePolygon(rect,padding=0){const {u,v}=rect;return [[rect.left-padding,rect.top-padding],[rect.right+padding,rect.top-padding],[rect.right+padding,rect.bottom+padding],[rect.left-padding,rect.bottom+padding]].map(([x,y])=>[x*u[0]+y*v[0],x*u[1]+y*v[1]]);}
function insideRectangle(rect,x,y){const a=x*rect.u[0]+y*rect.u[1],b=x*rect.v[0]+y*rect.v[1];return a>=rect.left-1e-6&&a<=rect.right+1e-6&&b>=rect.top-1e-6&&b<=rect.bottom+1e-6;}

/** All original pixels are visited. Large/slender images use overlapping
 * windows before model preprocessing, rather than shrinking whole figures.
 * maxInputSide bounds a window's neural activation size, not image resolution.
 */
export function scientificTextTiles(width,height,{maxInputSide=1536,overlap=128}={}){
 requireValue([width,height,maxInputSide,overlap].every(Number.isSafeInteger)&&width>0&&height>0&&maxInputSide>=736&&overlap>=32&&overlap<maxInputSide/2,'Invalid text detector dimensions or window settings.');
 const scale=Math.max(1,SCIENTIFIC_TEXT_MODEL.minSide/Math.min(width,height)),side=Math.max(1,Math.floor(maxInputSide/scale)),shared=Math.min(side-1,Math.max(1,Math.ceil(overlap/scale)));
 const origins=n=>{if(n<=side)return [0];const list=[];for(let p=0;p<n-side;p+=Math.max(1,side-shared))list.push(p);if(list.at(-1)!==n-side)list.push(n-side);return list;};
 const result=[];for(const y of origins(height))for(const x of origins(width))result.push([x,y,Math.min(width,x+side),Math.min(height,y+side)]);return result;
}
function resizeShape(width,height){const scale=Math.max(1,SCIENTIFIC_TEXT_MODEL.minSide/Math.min(width,height));return [Math.max(32,Math.round(width*scale/32)*32),Math.max(32,Math.round(height*scale/32)*32)];}
async function borrowedPixels(image,tile,signal){
 const [x,y,r,b]=tile,width=r-x,height=b-y;
 if(typeof image.readWindow==='function'){
  const lease=await image.readWindow({x,y,width,height},{signal});const data=lease.pixels?.data??lease.data??lease.pixels??lease;
  if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*3){const error=new EngineError('INVALID_INPUT','Text window is not original RGB8 pixels.');await retireTextSource(lease,error);throw error;}
  return {data,release:()=>lease.release?.()};
 }
 if(typeof image.readRows==='function'){
  const data=new Uint8Array(width*height*3),cooperate=createCooperator(signal);
  for(let top=0;top<height;top+=32){await cooperate();const rows=Math.min(32,height-top),lease=await image.readRows(y+top,rows,{signal});try{const rgb=lease.pixels?.data??lease.data??lease.pixels??lease;requireValue(rgb instanceof Uint8Array&&rgb.length===image.width*rows*3,'Text row source is not original RGB8 pixels.');for(let row=0;row<rows;row++)data.set(rgb.subarray((row*image.width+x)*3,(row*image.width+r)*3),(top+row)*width*3);}finally{await lease.release?.();}}
  return {data,release:()=>{}};
 }
 requireValue(image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray,'Text detector requires RGB8 pixels or bounded source windows.');
 if(!x&&width===image.width)return {data:image.data.subarray(y*image.width*3,b*image.width*3),release:()=>{}};
 const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)data.set(image.data.subarray(((y+row)*image.width+x)*3,((y+row)*image.width+r)*3),row*width*3);return {data,release:()=>{}};
}

/** Bilinear half-pixel resize, RGB source -> BGR NCHW. Original pixels remain
 * immutable. Input release is the caller's responsibility through finally.
 */
export async function prepareScientificTextInput(image,tile,{signal,budget}={}){
 requireValue(image?.format==='rgb8'&&Number.isSafeInteger(image.width)&&Number.isSafeInteger(image.height),'Text detector requires original RGB8 pixels.');
 const [x,y,r,b]=tile,width=r-x,height=b-y,[rw,rh]=resizeShape(width,height),count=rw*rh;
 requireValue(width>0&&height>0&&x>=0&&y>=0&&r<=image.width&&b<=image.height,'Invalid text source window.');
 const release=budget?.reserve(count*12+width*height*3)??(()=>{});let source,complete=false,primaryError;
 try{
  source=await borrowedPixels(image,tile,signal);checkAbort(signal);const data=new Float32Array(count*3),cooperate=createCooperator(signal);
  for(let yy=0;yy<rh;yy++){
   await cooperate();const sy=clamp((yy+.5)*height/rh-.5,0,height-1),y0=Math.floor(sy),y1=Math.min(height-1,y0+1),fy=sy-y0;
   for(let xx=0;xx<rw;xx++){
    const sx=clamp((xx+.5)*width/rw-.5,0,width-1),x0=Math.floor(sx),x1=Math.min(width-1,x0+1),fx=sx-x0,at=yy*rw+xx;
    for(let c=0;c<3;c++){const channel=2-c,tl=source.data[(y0*width+x0)*3+channel],tr=source.data[(y0*width+x1)*3+channel],bl=source.data[(y1*width+x0)*3+channel],br=source.data[(y1*width+x1)*3+channel];const value=tl*(1-fx)*(1-fy)+tr*fx*(1-fy)+bl*(1-fx)*fy+br*fx*fy;data[c*count+at]=(value/255-SCIENTIFIC_TEXT_MODEL.mean[c])/SCIENTIFIC_TEXT_MODEL.std[c];}
   }
  }
  const retired=source;source=null;await retired.release();checkAbort(signal);complete=true;return {tensor:{data,dims:[1,3,rh,rw],type:'float32'},width:rw,height:rh,tile,release};
 }catch(error){primaryError=error;throw error;}finally{try{await retireTextSource(source,primaryError);}finally{if(!complete)release();}}
}

/** Connected text components are converted into oriented minimum rectangles.
 * A round offset of a rectangle has the same minimum rectangle as expanding
 * each side by area * unclipRatio / perimeter. No extra Cv/PyClipper runtime.
 * The published candidate cap is reported as needs-review, never silent loss.
 */
export async function scientificTextBoxes(probabilities,width,height,{tile=[0,0,width,height],sourceWidth=tile[2],sourceHeight=tile[3],signal,budget,bitmapThreshold=SCIENTIFIC_TEXT_MODEL.bitmapThreshold,boxThreshold=SCIENTIFIC_TEXT_MODEL.boxThreshold,unclipRatio=SCIENTIFIC_TEXT_MODEL.unclipRatio,maxCandidates=SCIENTIFIC_TEXT_MODEL.maxCandidates}={}){
 requireValue(probabilities instanceof Float32Array&&probabilities.length===width*height&&[width,height].every(Number.isSafeInteger)&&width>0&&height>0,'Invalid text detector probability map.');
 requireValue(bitmapThreshold>0&&bitmapThreshold<1&&boxThreshold>0&&boxThreshold<1&&unclipRatio>0&&Number.isSafeInteger(maxCandidates)&&maxCandidates>0,'Invalid text detector thresholds.');
 const release=budget?.reserve(width*height*5+height*8)??(()=>{});const boxes=[];let candidates=0,truncated=false;
 try{
  const binary=new Uint8Array(width*height),queue=new Int32Array(width*height),lefts=new Int32Array(height),rights=new Int32Array(height),cooperate=createCooperator(signal);
  for(let at=0;at<binary.length;at++){const p=probabilities[at];if(!Number.isFinite(p)||p<0||p>1)throw new EngineError('MODEL_OUTPUT_INVALID','Text detector returned invalid probabilities.');binary[at]=p>bitmapThreshold?1:0;if(at%65536===0)await cooperate();}
  for(let start=0;start<binary.length;start++){
   if(start%65536===0)await cooperate();if(!binary[start])continue;let tail=1,head=0,minY=height,maxY=-1;queue[0]=start;binary[start]=0;
   while(head<tail){
    const at=queue[head++],y=Math.floor(at/width),x=at-y*width;
    if(y<minY){for(let yy=y;yy<minY;yy++){lefts[yy]=width;rights[yy]=-1;}minY=y;}if(y>maxY){for(let yy=maxY+1;yy<=y;yy++){lefts[yy]=width;rights[yy]=-1;}maxY=y;}
    lefts[y]=Math.min(lefts[y],x);rights[y]=Math.max(rights[y],x);
    for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=height)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if((!dx&&!dy)||xx<0||xx>=width)continue;const next=yy*width+xx;if(binary[next]){binary[next]=0;queue[tail++]=next;}}}
    if(head%65536===0)await cooperate();
   }
   const points=[];for(let yy=minY;yy<=maxY;yy++)if(rights[yy]>=lefts[yy]){points.push([lefts[yy],yy]);if(rights[yy]!==lefts[yy])points.push([rights[yy],yy]);}
   const rectangle=minimumTextRectangle(points);if(!rectangle||Math.min(rectangle.width,rectangle.height)<3)continue;
   candidates++;if(candidates>maxCandidates){truncated=true;continue;}
   const q=rectangle.polygon,x0=clamp(Math.floor(Math.min(...q.map(p=>p[0]))),0,width-1),x1=clamp(Math.ceil(Math.max(...q.map(p=>p[0]))),0,width-1),y0=clamp(Math.floor(Math.min(...q.map(p=>p[1]))),0,height-1),y1=clamp(Math.ceil(Math.max(...q.map(p=>p[1]))),0,height-1);let sum=0,pixels=0;
   for(let yy=y0;yy<=y1;yy++){await cooperate();for(let xx=x0;xx<=x1;xx++)if(insideRectangle(rectangle,xx,yy)){sum+=probabilities[yy*width+xx];pixels++;}}
   const confidence=pixels?sum/pixels:0;if(confidence<boxThreshold)continue;
   const padding=rectangle.area*unclipRatio/(2*(rectangle.width+rectangle.height)),polygon=rectanglePolygon(rectangle,padding).map(([x,y])=>[clamp(tile[0]+x/width*(tile[2]-tile[0]),0,sourceWidth-1),clamp(tile[1]+y/height*(tile[3]-tile[1]),0,sourceHeight-1)]);
   if(Math.min(distance(polygon[0],polygon[1]),distance(polygon[1],polygon[2]))<=3)continue;
   boxes.push({polygon,confidence,source:'ppocrv6-detector',tile:[...tile]});
  }
  return {detections:boxes,candidates,truncated};
 }finally{release();}
}
function area(poly){return Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;}
function intersection(subject,clip){
 let output=subject;for(let i=0;i<clip.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],input=output;output=[];if(!input.length)break;let previous=input.at(-1),previousInside=cross(a,b,previous)>=-1e-7;
  for(const current of input){const currentInside=cross(a,b,current)>=-1e-7;if(currentInside!==previousInside){const dx=current[0]-previous[0],dy=current[1]-previous[1],ex=b[0]-a[0],ey=b[1]-a[1],den=dx*ey-dy*ex;if(Math.abs(den)>1e-12){const t=((a[0]-previous[0])*ey-(a[1]-previous[1])*ex)/den;output.push([previous[0]+t*dx,previous[1]+t*dy]);}}if(currentInside)output.push(current);previous=current;previousInside=currentInside;}
 }
 return output;
}
function deduplicate(detections){
 const kept=[];for(const d of detections.sort((a,b)=>b.confidence-a.confidence)){
  const own=area(d.polygon);const duplicate=kept.some(other=>{const common=area(intersection(d.polygon,other.polygon)),total=own+area(other.polygon)-common;return total>0&&common/total>.65;});if(!duplicate)kept.push(d);
 }return kept.sort((a,b)=>Math.min(...a.polygon.map(p=>p[1]))-Math.min(...b.polygon.map(p=>p[1]))||Math.min(...a.polygon.map(p=>p[0]))-Math.min(...b.polygon.map(p=>p[0])));
}

/** run accepts (feeds, options) and returns ONNX tensors or the existing
 * NeuralGraphPool {result, release, metrics} lease. The host verifies the model
 * bytes/hash through that pool; no URL fetch or network API is used here.
 */
export class ScientificTextDetector {
 constructor({run,budget,model=SCIENTIFIC_TEXT_MODEL}={}){if(typeof run!=='function')throw new EngineError('MODEL_UNAVAILABLE','PP-OCRv6 text detector is not configured.');requireValue(model.sha256===SCIENTIFIC_TEXT_MODEL.sha256&&model.bytes===SCIENTIFIC_TEXT_MODEL.bytes,'Unqualified text detector model identity.');this.run=run;this.budget=budget;}
 async detect(image,{signal,onProgress,backend='auto',maxInputSide=1536,overlap=128,...options}={}){
  requireValue(image?.format==='rgb8'&&Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0,'Scientific text detector requires RGB8 image dimensions.');
  const started=performance.now(),tiles=scientificTextTiles(image.width,image.height,{maxInputSide,overlap}),all=[],metrics=[],preprocessing=[];let candidates=0,truncated=false;
  for(let index=0;index<tiles.length;index++){
   checkAbort(signal);onProgress?.({phase:'scientific-text',current:index,total:tiles.length});const input=await prepareScientificTextInput(image,tiles[index],{signal,budget:this.budget});let run;
   try{
    const count=input.width*input.height;run=await this.run({[SCIENTIFIC_TEXT_MODEL.input]:input.tensor},{...options,signal,backend,workspaceBytes:count*512,outputBytes:count*4});checkAbort(signal);
    const result=run?.result??run,map=result?.[SCIENTIFIC_TEXT_MODEL.output];requireValue(map?.dims?.length===4&&map.dims[0]===1&&map.dims[1]===1&&map.dims[2]===input.height&&map.dims[3]===input.width,'Text detector output dimensions do not match its source window.');
    const decoded=await scientificTextBoxes(map.data,input.width,input.height,{signal,budget:this.budget,tile:tiles[index],sourceWidth:image.width,sourceHeight:image.height});all.push(...decoded.detections);candidates+=decoded.candidates;truncated ||=decoded.truncated;if(run?.metrics)metrics.push(run.metrics);preprocessing.push({tile:tiles[index],inputDimensions:[input.width,input.height]});
   }finally{run?.release?.();input.release();}
  }
  const detections=deduplicate(all),warnings=[];
  // A detector may call blot bands "text". Never treat a massive candidate as
  // a confidently safe exclusion: preserve it for the shared semantic guard.
  // This geometric routing policy does not change model thresholds or pixels.
  const qualityGuard={version:'large-text-region/1',minimumCoverage:.2,minimumThicknessFraction:.2};
  for(let index=0;index<detections.length;index++){
   const polygon=detections[index].polygon,coverage=area(polygon)/(image.width*image.height),thickness=Math.min(distance(polygon[0],polygon[1]),distance(polygon[1],polygon[2]));
   if(coverage>=qualityGuard.minimumCoverage&&thickness>=Math.min(image.width,image.height)*qualityGuard.minimumThicknessFraction)warnings.push({code:'large-text-region',detection:index,coverage,thickness,message:'Large OCR candidate requires acquisition-aware review before exclusion.'});
  }
  if(truncated)warnings.push({code:'candidate-limit',candidates,message:'The published detector candidate limit was reached.'});
  onProgress?.({phase:'scientific-text',current:tiles.length,total:tiles.length});return {status:warnings.length?'needs-review':'complete',width:image.width,height:image.height,polygons:detections.map(d=>d.polygon),detections,warnings,metadata:{version:SCIENTIFIC_TEXT_MODEL.version,model:{id:SCIENTIFIC_TEXT_MODEL.id,sha256:SCIENTIFIC_TEXT_MODEL.sha256,bytes:SCIENTIFIC_TEXT_MODEL.bytes},method:'text-detection-only',recognition:false,originalPixelsModified:false,coordinateSpace:'original-image-pixels',sourceSha256:image.sha256??image.sourceSha256??null,preprocess:{channels:'BGR',mean:[...SCIENTIFIC_TEXT_MODEL.mean],std:[...SCIENTIFIC_TEXT_MODEL.std],minSide:SCIENTIFIC_TEXT_MODEL.minSide,interpolation:'bilinear-half-pixel',maxInputSide,overlap,windows:preprocessing},postprocess:{bitmapThreshold:SCIENTIFIC_TEXT_MODEL.bitmapThreshold,boxThreshold:SCIENTIFIC_TEXT_MODEL.boxThreshold,unclipRatio:SCIENTIFIC_TEXT_MODEL.unclipRatio,maxCandidates:SCIENTIFIC_TEXT_MODEL.maxCandidates,implementation:'connected-component-hull/minimum-rectangle-offset',candidates,truncated},qualityGuard,execution:metrics,elapsedMs:performance.now()-started}};
 }
}
