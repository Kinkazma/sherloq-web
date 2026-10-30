import "../../runtime-context.js?v=0.30.0";
import {originalXfeatFrame,writeXfeatNormalizedZeroPadding} from './xfeat-strict-input-frame.js';
import createPost from '../vendor/xfeat-paged/post.js';
import {allocateWasmMemory} from './allocation.js';
import {prepareXfeatRows} from './xfeat-paged-prepare.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {sparseStrictContextRows} from './sparse-strict-native-features.js';
import {planAdmittedNativeContexts} from './admitted-native-context-cover.js';
import {createXfeatRetirementOwner} from './xfeat-retirement-owner.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Exact native floor32 and bilinear RGB/channel-mean preparation per real
 * admitted context. InstanceNorm moments are ONE weighted population of the
 * owned prepared Float32 values, not an average of fragment statistics.
 * Complete literal contexts may overlap. Fragment dimensions are aligned so
 * ownership is tested on the native pixel grid before moments or global top-k;
 * a single full rectangle keeps the exact existing bilinear preparation.
 * A context smaller than32 has no grid in the existing public XFeat preparer;
 * this is not asserted to be a mathematical minimum of its CNN backbone. */
export async function prepareXfeatStrictPopulation(source,{budget,signal,onProgress,storage='auto',moduleFactory=createPost,reserveInference,onOwner}={}){
 const{view,domain}=source??{};requireValue(view?.admittedRectangles&&domain?.sourceSha256&&budget?.reserve,'Certified XFeat RGB contexts and shared budget are required.');checkAbort(signal);const metadata=budget.reserve(65536),records=[],stores=[],plans=[];const owner=createXfeatRetirementOwner();owner.credit(()=>{coverage?.dispose();for(const free of plans)free();metadata();});let heap,runtime,coverage,returned=false,primary,failed=false;
 try{
  requireValue(onOwner===undefined||typeof onOwner==='function','XFeat preparation ownership callback must be synchronous.');onOwner?.(owner);
  coverage=await planAdmittedNativeContexts(view,{width:domain.width,height:domain.height,minimumWidth:32,minimumHeight:32,alignmentX:32,alignmentY:32,maximumWidth:16384,maximumHeight:16384,budget,signal});
  for(const [evaluable,rectangles]of [[true,coverage.contexts],[false,coverage.unsupportedRectangles]])for(const rect of rectangles){
   await controlCheckpoint(signal);const free=budget.reserve(4096);plans.push(free);const nativeFrame=originalXfeatFrame(rect,domain.origin,{evaluable,preservedRectangle:coverage.preservedRectangle}),{width,height,preparedWidth,preparedHeight}=nativeFrame;
   records.push({index:records.length,rect:Object.freeze({x:rect.x,y:rect.y,width:rect.width,height:rect.height}),ownedRectangles:evaluable?rect.ownedRectangles:Object.freeze([]),ownedPixels:evaluable?rect.ownedPixels:0,originalBounds:Object.freeze([rect.x+domain.origin[0],rect.y+domain.origin[1],rect.x+rect.width+domain.origin[0],rect.y+rect.height+domain.origin[1]]),width,height,nativeFrame,scaleX:preparedWidth?Math.fround(rect.width/preparedWidth):null,scaleY:preparedHeight?Math.fround(rect.height/preparedHeight):null,evaluable,status:evaluable?'native':'native-not-evaluable',reason:evaluable?null:'no fully admitted floor32 context contains these pixels'});
  }
  heap=budget.reserve(32*1024**2);await reserveInference?.(records);checkAbort(signal);
  runtime=await moduleFactory({wasmMemory:allocateWasmMemory({initial:256,maximum:32768},{label:'native XFeat floor32/bilinear preparation'})});let sum=0,sum2=0,samples=0,contextPixels=0;
  for(const record of records){
   await controlCheckpoint(signal);contextPixels+=record.rect.width*record.rect.height;if(!record.evaluable)continue;const gray=await createSegmentedBytes(record.width*record.height*4,{budget,storage,temporarySession:source.original?.temporarySession??source.original?.session,getTemporarySession:source.original?.getTemporarySession??source.original?.ensureTemporarySession,signal,owner:'xfeat-strict-gray',label:'native prepared context'});stores.push(gray);owner.own(()=>gray.dispose());record.gray=gray;
   // Keep every literal prepared row for the CNN. Only the deterministic
   // owner contributes its value to the one common InstanceNorm population.
   const sink={async write(bytes,offset){const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),y=offset/4/record.nativeFrame.preparedWidth;for(let x=0;x<values.length;x++){const px=record.rect.x+x,py=record.rect.y+y;if(coverage.preservedRectangle||record.ownedRectangles.some(r=>px>=r.x&&px<r.x+r.width&&py>=r.y&&py<r.y+r.height)){const value=values[x];sum+=value;sum2+=value*value;samples++;}}await gray.write(bytes,((y+record.nativeFrame.top)*record.width+record.nativeFrame.left)*4,{signal});}},rows=sparseStrictContextRows(view,record.rect,budget);record.preparation=await prepareXfeatRows(rows,sink,runtime,{signal,onProgress:e=>onProgress?.({...e,fraction:(record.index+e.fraction)/records.length,sourceFragment:record.index})});record.preparation={...record.preparation,localMomentsUsedForInference:false};onProgress?.({phase:'xfeat-native-context-preparation',completed:record.index+1,total:records.length,fraction:(record.index+1)/records.length});
  }
  checkAbort(signal);const mean=samples?Math.fround(sum/samples):null,variance=samples?Math.max(0,sum2/samples-(sum/samples)**2):null,inverseStd=samples?Math.fround(1/Math.sqrt(variance+1e-5)):null,normalization=Object.freeze({samples,mean,inverseStd,variance,sum,sum2,policy:'one uniquely owned native prepared population; Float64 accumulation and Float32 InstanceNorm coefficients',contextOrder:'first literal context in Original row/column/bottom/right order, then owned native rows/columns'});
  for(const record of records)await writeXfeatNormalizedZeroPadding(record,mean,{budget,owner,signal});
  checkAbort(signal);returned=true;
  return{contexts:records,normalization,sourceSha256:domain.sourceSha256,origin:[...domain.origin],width:domain.width,height:domain.height,metadata:{contextPixels,normalizationPixels:samples,coverage:{policy:coverage.policy,ownership:coverage.ownership,sourceAdmittedPixels:coverage.sourceAdmittedPixels,uniqueObservedPixels:coverage.uniqueObservedPixels,contextObservedPixels:coverage.contextObservedPixels,noNativeSupportPixels:coverage.noNativeSupportPixels,preservedRectangle:coverage.preservedRectangle},contexts:records.map(({gray,preparation,...record})=>({...record,preparation:preparation?structuredClone(preparation):null})),floor32:'unchanged full rectangle; admitted literal context RGB with Original phase32 normalized-zero extension',tensorPadding:'synthetic mean before common normalization equals algebraic zero; no excluded RGB read or population participation',normalization:structuredClone(normalization),rgbExcludedParticipation:'absent before bilinear/channel mean and InstanceNorm'},dispose:()=>owner.dispose()};
 }catch(error){failed=true;primary=error;throw error;}finally{
  owner.finish();const errors=[];if(!returned)try{await owner.dispose();}catch(error){errors.push(error);}try{heap?.();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.xfeatPreparationCleanupErrors=errors;}else throw new AggregateError(errors,'XFeat preparation cleanup failed.');}
 }
}
