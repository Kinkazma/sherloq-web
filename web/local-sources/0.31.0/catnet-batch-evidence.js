import {checkAbort,requireValue,createCooperator} from './unified-engine/src/errors.js';

/** Threshold evidence is a count of native map observations, not a new model
 * score or a mean of context scores. Intrinsically unsupported selected pixels
 * remain explicit; no support means inconclusive, never a fabricated zero. */
export async function catnetNativeMapEvidence(output,recipe,client,image,{scope,signal}={}){
 const d=client.source,domain=output.sourceRegionDomain,threshold=Number(recipe.signal.threshold),minimum=Number(recipe.signal.minimumPixels),field={m2Result:output.m2Result.id,sourceRegionFingerprint:domain?.fingerprint,coordinateSpace:'original'};
 requireValue(d?.sha256===output.provenance?.originalSourceSha256&&(!image.sourceSha256||image.sourceSha256===d.sha256)&&image.width===d.surface.width&&image.height===d.surface.height,'Batch CAT-Net evidence requires the same Original source and grid.');
 requireValue(Number.isFinite(threshold)&&threshold>=0&&threshold<=1&&Number.isSafeInteger(minimum)&&minimum>0,'Invalid native CAT-Net map threshold or minimum population.');
 const cooperate=createCooperator(signal);let positivePixels=0,eligiblePixels=0,selectedPixels=0,modeledPixels=0,nonEvaluablePixels=0,candidateExcludedPixels=0,rawPositivePixels=0,maximum=null,rawMaximum=null,left=image.width,top=image.height,right=-1,bottom=-1;
 for(let y=0;y<image.height;y+=32){
  // The coverage window (1 byte), map (4 bytes), and a native map transfer
  // (at most 4 bytes) may coexist; the credit belongs to this M2 result.
  checkAbort(signal);const height=Math.min(32,image.height-y),rect={x:0,y,width:image.width,height},release=await client.reserveExport(image.width*height*9+65536,field);let eligible,primary;
  try{
   const support=await client.readScalar(field,rect,'analysis_scope',{signal}),values=await client.readScalar(field,rect,'map',{signal});checkAbort(signal);
   requireValue(support instanceof Uint8Array&&values instanceof Float32Array&&support.length===values.length&&values.length===image.width*height,'Batch CAT-Net scalar and coverage grids differ.');eligible=scope?.readRows(y,height,{signal});
   for(let i=0;i<values.length;i++){
    if(i%8192===0)await cooperate();
    const code=support[i],value=values[i];requireValue(code===0||code===1||code===2,'Unknown CAT-Net native coverage state.');if(code)selectedPixels++;
    if(code!==2){requireValue(Number.isNaN(value),'A CAT-Net score was fabricated outside modeled native support.');if(code===1)nonEvaluablePixels++;continue;}
    requireValue(Number.isFinite(value),'Nonfinite modeled CAT-Net observation.');modeledPixels++;rawMaximum=rawMaximum===null?value:Math.max(rawMaximum,value);if(value>=threshold)rawPositivePixels++;
    if(eligible&&!eligible.data[i]){candidateExcludedPixels++;continue;}eligiblePixels++;maximum=maximum===null?value:Math.max(maximum,value);if(value>=threshold){positivePixels++;const x=i%image.width,yy=y+Math.floor(i/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
   }
  }catch(error){primary=error;throw error;}finally{const failures=[];for(const action of[()=>eligible?.release(),()=>release()])try{await action();}catch(error){failures.push(error);}if(failures.length){if(primary&&Object.isExtensible(primary))primary.cleanupErrors=failures;else if(!primary)throw new AggregateError(failures,'Batch CAT-Net evidence retirement failed');}}
 }
 requireValue(selectedPixels===output.metrics.selectedPixels&&modeledPixels===output.metrics.analysedPixels&&nonEvaluablePixels===output.metrics.unanalysablePixels,'Batch CAT-Net coverage differs from its native result population.');
 const inconclusive=eligiblePixels===0;
 return{positive:!inconclusive&&positivePixels>=minimum,inconclusive,...(inconclusive?{reason:'No admissible native CAT-Net map observations; no score was invented.'}:{}),pixels:positivePixels,maximum,threshold,minimumPixels:minimum,scoreMeaning:'Thresholded independent native-context CAT-Net map observations; no averaged network score.',evidencePreparation:{...(scope?.policy??{}),adapter:'catnet-original-native-map-support',coordinates:'original-source-pixels',sourceSha256:d.sha256,sourceRegionFingerprint:domain.fingerprint,filtered:true,selectedPixels,modeledPixels,selectedButNonEvaluablePixels:nonEvaluablePixels,eligiblePixels,candidateExcludedPixels,excludedPixels:image.width*image.height-selectedPixels,rawPositivePixels,rawMaximum,nativeContexts:output.data.metadata.fragments.map(f=>({index:f.index,bounds:[...f.bounds],nativeShape:[...f.nativeShape]}))},regions:right<0?[]:[{bbox:[left,top,right-left+1,bottom-top+1],kind:'threshold-envelope',note:'Envelope of modeled admitted pixels above threshold; not a filled support mask.'}]};
}
