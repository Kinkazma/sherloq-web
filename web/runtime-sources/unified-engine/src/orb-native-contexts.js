import "../../runtime-context.js?v=0.30.0";
import {gray} from './pixel-utils.js';
import {cloningDetect} from './cloning-math.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
async function releaseWindows(windows,primary){let failure;for(const window of windows)try{await window?.release?.();}catch(error){failure??=error;}if(failure){if(primary){if(Object.isExtensible(primary))primary.orbReadCleanupError={code:failure.code,message:failure.message};}else throw failure;}}

/** Both pixel-only and surface-backed references keep the Original grid. */
export function validateOrbDetectionMask(mask,domain){
 if(!mask)return;const d=mask.surface?.descriptor??mask.pixels;
 requireValue(d&&d.width===domain.sourceWidth&&d.height===domain.sourceHeight&&typeof mask.sha256==='string'&&/^[a-f0-9]{64}$/.test(mask.sha256),'The ORB detection mask must identify the full Original native grid.');
 if(mask.surface)requireValue(typeof mask.surface.readWindow==='function','The ORB mask needs a native window reader.');
 else requireValue(d.format==='rgb8'&&d.data instanceof Uint8Array&&d.data.length===d.width*d.height*3,'The ORB pixel mask must contain exact RGB8 Original-grid observations.');
}

/** ORB detects/describes native32-byte features before global response selection.
 * Native context borders remain intact. A separate mask selects centres only. */
export async function orbNativeContexts(view,{domain=view.domain,mask=null,signal,account=()=>{},onProgress}={}){
 requireValue(view?.domain?.fingerprint===domain?.fingerprint&&view.domain.sourceSha256===domain.sourceSha256,'ORB needs its verified native source view.');
 requireValue(Number.isSafeInteger(view.maxReadPixels)&&view.maxReadPixels>0,'ORB needs a finite native source-window limit.');
 validateOrbDetectionMask(mask,domain);
 const contexts=[],outputs=[],cooperate=createCooperator(signal);let total=0,completed=0;
 const ownOutput=bytes=>{const release=account(bytes);if(typeof release==='function')outputs.push(release);return release;};
 try{
  for(const rect of view.admittedRectangles()){
   await cooperate();account(1024);const count=rect.width*rect.height;
   if(rect.width<7||rect.height<7){contexts.push({rect:{...rect},start:total,count:0,status:'not-evaluable',reason:'The unchanged native detector requires both dimensions >=7.'});completed+=count;onProgress?.(completed/domain.countIncluded);continue;}
   const releasePixels=account(count*(mask?2:1));let detected;
   try{
    const values=new Uint8Array(count),region=mask?new Uint8Array(count):null,width=Math.min(rect.width,view.maxReadPixels),rows=Math.max(1,Math.min(32,Math.floor(view.maxReadPixels/width)));
    for(let y=0;y<rect.height;y+=rows)for(let x=0;x<rect.width;x+=width){await cooperate();const part={x:rect.x+x,y:rect.y+y,width:Math.min(width,rect.width-x),height:Math.min(rows,rect.height-y)};let window,maskWindow,primary;
     try{window=await view.readWindow(part,{signal});checkAbort(signal);if(mask){const original={...part,x:part.x+domain.origin[0],y:part.y+domain.origin[1]};if(mask.surface)maskWindow=await mask.surface.readWindow(original,{signal});else{const d=mask.pixels,release=account(original.width*original.height*3);try{const data=new Uint8Array(original.width*original.height*3);for(let row=0;row<original.height;row++)data.set(d.data.subarray(((original.y+row)*d.width+original.x)*3,((original.y+row)*d.width+original.x+original.width)*3),row*original.width*3);maskWindow={pixels:{width:original.width,height:original.height,format:'rgb8',data},release};}catch(error){release?.();throw error;}}checkAbort(signal);requireValue(maskWindow.pixels?.format==='rgb8'&&maskWindow.pixels.width===part.width&&maskWindow.pixels.height===part.height&&maskWindow.pixels.data.length===part.width*part.height*3,'The ORB detection mask changed its native grid.');}
      const rgb=window.pixels.data,m=maskWindow?.pixels.data;for(let row=0;row<part.height;row++)for(let col=0;col<part.width;col++){const from=(row*part.width+col)*3,to=(y+row)*rect.width+x+col;values[to]=gray(rgb[from],rgb[from+1],rgb[from+2]);if(region)region[to]=gray(m[from],m[from+1],m[from+2])>0?1:0;}
     }catch(error){primary=error;throw error;}finally{await releaseWindows([maskWindow,window],primary);}
    }
    detected=await cloningDetect(values,region,rect.width,rect.height,{signal,account:ownOutput,algorithm:'ORB'});checkAbort(signal);
   }finally{releasePixels?.();}
   contexts.push({rect:{...rect},start:total,count:detected.total,points:detected.points,descriptors:detected.descriptors,status:'native'});total+=detected.total;completed+=count;onProgress?.(completed/domain.countIncluded);
  }
  account(total*88);const points=new Float64Array(total*7),descriptors=new Uint8Array(total*32);
  for(const context of contexts){if(!context.points)continue;points.set(context.points,context.start*7);descriptors.set(context.descriptors,context.start*32);for(let i=context.start;i<context.start+context.count;i++){points[i*7]+=context.rect.x;points[i*7+1]+=context.rect.y;}delete context.points;delete context.descriptors;}
  checkAbort(signal);return{contexts,total,points,descriptors,descriptorSize:32,algorithm:'ORB',semantics:'Independent native ORB contexts in stable rectangle and native feature order; one union-global response selection and matching. Native ORB defaults and pyramid/border rejection are unchanged; context boundaries are not equivalent to uncut-image descriptors.'};
 }finally{for(const release of outputs)release();}
}
