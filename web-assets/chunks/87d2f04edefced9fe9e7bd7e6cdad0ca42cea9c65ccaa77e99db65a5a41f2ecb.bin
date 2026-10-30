import "../../runtime-context.js?v=0.30.0";
import {planDocTamperBlockContexts} from './doctamper-block-contexts.js';
import {planDocTamperNativeCoverage} from './doctamper-native-coverage.js';
import {requireValue,checkAbort} from './errors.js';
/** Mode belongs to the unchanged Original, not to the size of a crop. A small
 * native-JPEG scope must never silently turn into a new Q90 working JPEG. */
export function doctamperOriginalMode({sourceWidth,sourceHeight,sourceFormat,orientation=1,hasEncodedSource=false}){
 requireValue([sourceWidth,sourceHeight].every(v=>Number.isSafeInteger(v)&&v>0)&&(Number.isInteger(orientation)&&orientation>=1&&orientation<=8||['unknown','unverified'].includes(orientation)),'Invalid DTD Original geometry/orientation.');
 return String(sourceFormat??'').toUpperCase()==='JPEG'&&hasEncodedSource===true&&orientation===1&&Math.min(sourceWidth,sourceHeight)>=512?'native-original-JPEG':'native-gray-Q90-working-copy';
}
/** Reuse the qualified complete-physical-Y-block certificate only. CAT-Net's
 * normalization, network padding and tensors are deliberately not reused.
 * DTD keeps its own512 tile, native white Q90 padding and last-write order. */
export async function planDocTamperStrictContexts(domain,original,{budget,signal}={}){
 requireValue(original?.sourceWidth===domain?.sourceWidth&&original?.sourceHeight===domain?.sourceHeight,'DTD scope must use the oriented Original grid.');
 const mode=doctamperOriginalMode(original),native=mode==='native-original-JPEG',blocks=await (native?planDocTamperNativeCoverage:planDocTamperBlockContexts)(domain,{budget,signal});let complete=false;
 try{
  const contexts=blocks.contexts.map((c,index)=>{
   const width=c.bounds[2]-c.bounds[0],height=c.bounds[3]-c.bounds[1],analysisWidth=Math.floor(Math.max(512,width)/8)*8,analysisHeight=Math.floor(Math.max(512,height)/8)*8,evaluable=mode!=='native-original-JPEG'||Math.min(width,height)>=512,evaluatedPixels=evaluable?Math.min(width,analysisWidth)*Math.min(height,analysisHeight):0;
   return Object.freeze({index,bounds:Object.freeze([...c.bounds]),originalBounds:Object.freeze([...c.bounds]),width,height,analysisWidth,analysisHeight,rawOrigin:Object.freeze([c.bounds[0],c.bounds[1]]),domainFingerprint:domain.fingerprint,mode,evaluable,evaluatedPixels,unprocessedPixels:width*height-evaluatedPixels,...(!evaluable?{reason:'native-JPEG-DTD-requires-a-complete-admitted512x512-RGB-context'}:{})});
  });
  let evaluatedPixels=0,nativeBorderPixels=0,smallContextPixels=0;for(const c of contexts){evaluatedPixels+=c.evaluatedPixels;if(c.evaluable)nativeBorderPixels+=c.unprocessedPixels;else smallContextPixels+=c.unprocessedPixels;}
  const contextObservedPixels=evaluatedPixels;if(native){evaluatedPixels=blocks.evaluatedPixels;nativeBorderPixels=blocks.nativeBorderPixels;smallContextPixels=blocks.noNativeContextPixels;}
  const partialStoredBlockPixels=native?blocks.partialStoredBlockPixels:blocks.nonEvaluablePixels;requireValue(evaluatedPixels+nativeBorderPixels+smallContextPixels+partialStoredBlockPixels===domain.countIncluded,'DTD context/native-footprint counts differ from the selected Original.');checkAbort(signal);complete=true;
  return Object.freeze({schema:'sherloq.doctamper-strict-context-plan/2',mode,originalSourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,contexts:Object.freeze(contexts),selectedPixels:domain.countIncluded,evaluatedPixels,contextObservedPixels,partialStoredBlockPixels,smallContextPixels,noNativeContextPixels:smallContextPixels,nativeBorderPixels,nonEvaluablePixels:domain.countIncluded-evaluatedPixels,originalGridPhase:8,modelTile:512,coverage:native?blocks.coverage:'complete admitted Original8x8 rectangles with native working-Q90 white512 padding',overlapOwnership:native?blocks.overlapOwnership:'disjoint contexts',semantics:'True admitted Original RGB and complete native block support only; no crop JPEG, no artificial adjacency or excluded RGB. Native-JPEG coefficients/QT stay Original; declared non-native mode keeps original DTD grayQ90 white-padding method.',release:blocks.release});
 }finally{if(!complete)blocks.release();}
}
