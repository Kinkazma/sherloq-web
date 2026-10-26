import "../../runtime-context.js?v=0.25.0";
import {assertCloningDetectionMask} from './cloning-detection-mask.js';
import {gray} from './pixel-utils.js';
import {cloningDetect,cloningDescribeBrisk} from './cloning-math.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
async function releaseWindows(windows,primary){let failure;for(const window of windows)try{await window?.release?.();}catch(error){failure??=error;}if(failure){if(primary){if(Object.isExtensible(primary))primary.briskReadCleanupError={code:failure.code,message:failure.message};}else throw failure;}}
/** Native observations from independent, completely admitted rectangles.
 * The detector's original scale-dependent border rejection and integral-image
 * descriptor support run inside each real context, before global selection.
 * A detection mask restricts centres only, as in the ordinary native tool. */
export async function briskNativeContexts(view,{domain=view.domain,mask=null,signal,account=()=>{},onProgress}={}){
 requireValue(view?.domain?.fingerprint===domain?.fingerprint,'BRISK needs the verified native source view.');
 assertCloningDetectionMask(mask,domain);
 const contexts=[],cooperate=createCooperator(signal);let total=0,completed=0;
 for(const rect of view.admittedRectangles()){
  await cooperate();account(1024);const count=rect.width*rect.height;if(rect.width<7||rect.height<7){contexts.push({rect:{...rect},start:total,count:0,status:'not-evaluable',reason:'The unchanged native detector requires both dimensions >=7.'});completed+=count;onProgress?.(completed/domain.countIncluded);continue;}account(count*(mask?2:1));const values=new Uint8Array(count),region=mask?new Uint8Array(count):null,width=Math.min(rect.width,view.maxReadPixels),rows=Math.max(1,Math.floor(view.maxReadPixels/width));
  for(let y=0;y<rect.height;y+=rows)for(let x=0;x<rect.width;x+=width){await cooperate();const part={x:rect.x+x,y:rect.y+y,width:Math.min(width,rect.width-x),height:Math.min(rows,rect.height-y)};let window,maskWindow,primary;
   try{window=await view.readWindow(part,{signal});checkAbort(signal);if(mask){const original={...part,x:part.x+domain.origin[0],y:part.y+domain.origin[1]};if(mask.surface)maskWindow=await mask.surface.readWindow(original,{signal});else{const d=mask.pixels;account(original.width*original.height*3);const data=new Uint8Array(original.width*original.height*3);for(let row=0;row<original.height;row++)data.set(d.data.subarray(((original.y+row)*d.width+original.x)*3,((original.y+row)*d.width+original.x+original.width)*3),row*original.width*3);maskWindow={pixels:{...original,format:'rgb8',data}};}checkAbort(signal);requireValue(maskWindow.pixels?.format==='rgb8'&&maskWindow.pixels.data instanceof Uint8Array&&maskWindow.pixels.width===part.width&&maskWindow.pixels.height===part.height&&maskWindow.pixels.data.length===part.width*part.height*3,'The BRISK detection mask changed its native grid.');}
    const rgb=window.pixels.data,m=maskWindow?.pixels.data;for(let row=0;row<part.height;row++)for(let col=0;col<part.width;col++){const from=(row*part.width+col)*3,to=(y+row)*rect.width+x+col;values[to]=gray(rgb[from],rgb[from+1],rgb[from+2]);if(region)region[to]=gray(m[from],m[from+1],m[from+2])>0?1:0;}
   }catch(error){primary=error;throw error;}finally{await releaseWindows([maskWindow,window],primary);}}
  const detected=await cloningDetect(values,region,rect.width,rect.height,{signal,account,algorithm:'BRISK',pointsOnly:true});checkAbort(signal);contexts.push({rect:{...rect},start:total,count:detected.total,gray:values,points:detected.points,status:'native'});total+=detected.total;completed+=count;onProgress?.(completed/domain.countIncluded);
 }
 account(total*56);const points=new Float64Array(total*7);for(const context of contexts){if(!context.points)continue;points.set(context.points,context.start*7);for(let i=context.start;i<context.start+context.count;i++){points[i*7]+=context.rect.x;points[i*7+1]+=context.rect.y;}delete context.points;}
 checkAbort(signal);return{contexts,total,points,descriptors:new Uint8Array(),descriptorSize:64,pointsOnly:true,semantics:'Independent native BRISK contexts; stable rectangle and native-keypoint order, then one union-global response selection and matching. Crop boundaries use native BRISK rejection; not a whole-image descriptor equivalence claim.'};
}
/** Source indices come from the actual native selector, never point equality or
 * class-id guesses. Reassemble descriptors in its unchanged selected order. */
export async function briskDescribeNativeContexts(detected,selected,{signal,account=()=>{}}={}){
 const n=selected.points.length/7;requireValue(selected.sourceIndices instanceof Uint32Array&&selected.sourceIndices.length===n,'Strict BRISK needs the native selection source indices.');account(n*120);const points=new Float64Array(n*7),descriptors=new Uint8Array(n*64);let offset=0;
 for(const context of detected.contexts){checkAbort(signal);const start=offset;while(offset<n&&selected.sourceIndices[offset]<context.start+context.count){requireValue(selected.sourceIndices[offset]>=context.start,'Native BRISK selection order changed.');offset++;}const count=offset-start;if(!count)continue;account(count*56);const local=new Float64Array(count*7);for(let i=0;i<count;i++){local.set(selected.points.subarray((start+i)*7,(start+i)*7+7),i*7);local[i*7]-=context.rect.x;local[i*7+1]-=context.rect.y;}
  const described=await cloningDescribeBrisk({points:local},context.gray,context.rect.width,context.rect.height,{signal,account});checkAbort(signal);for(let i=0;i<count;i++){points.set(described.points.subarray(i*7,i*7+7),(start+i)*7);points[(start+i)*7]+=context.rect.x;points[(start+i)*7+1]+=context.rect.y;}descriptors.set(described.descriptors,start*64);
 }
 requireValue(offset===n,'Native BRISK selection refers to an absent context.');checkAbort(signal);return{points,descriptors,descriptorSize:64};
}
