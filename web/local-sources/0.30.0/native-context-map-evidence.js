import {requireValue,checkAbort,createCooperator} from './unified-engine/src/errors.js';
import {nativeContextScalarPlan} from './native-context-scalar.js?v=0.30.0';

export async function nativeContextMapEvidence(output,recipe,client,image,{scope,signal}={}){
 const plan=nativeContextScalarPlan(output,client.source),threshold=Number(recipe.signal.threshold),minimum=Number(recipe.signal.minimumPixels),field=plan.method==='trufor'?{m2Result:output.m2Result.id,sourceRegionFingerprint:plan.domain.fingerprint}:output.surface;
 requireValue(image.width===plan.width&&image.height===plan.height&&(!image.sourceSha256||image.sourceSha256===plan.sourceSha256),'Native batch map belongs to another Original source or grid.');
 requireValue(Number.isFinite(threshold)&&threshold>=0&&threshold<=1&&Number.isSafeInteger(minimum)&&minimum>0,'Invalid native map threshold or minimum population.');
 const cooperate=createCooperator(signal);let pixels=0,eligiblePixels=0,selectedPixels=0,modeledPixels=0,nonEvaluablePixels=0,candidateExcludedPixels=0,rawPositivePixels=0,maximum=null,rawMaximum=null,left=image.width,top=image.height,right=-1,bottom=-1;
 for(let y=0;y<image.height;y+=32){
  checkAbort(signal);const height=Math.min(32,image.height-y),rect={x:0,y,width:image.width,height},release=await client.reserveExport(image.width*height*(1+2*plan.bytes)+65536,field);let eligible,primary;
  try{
   const support=await client.readScalar(field,rect,'analysis_scope',{signal}),values=await client.readScalar(field,rect,'map',{signal});checkAbort(signal);
   requireValue(support instanceof Uint8Array&&values instanceof(plan.bytes===4?Float32Array:Float64Array)&&support.length===values.length&&values.length===image.width*height,'Native map and coverage grids differ.');eligible=scope?.readRows(y,height,{signal});
   for(let i=0;i<values.length;i++){
    if(i%8192===0)await cooperate();const code=support[i],value=values[i];requireValue(code===0||code===1||code===2,'Unknown native map support.');if(code)selectedPixels++;
    if(code!==2){requireValue(Number.isNaN(value),'A score was fabricated outside native modeled support.');if(code===1)nonEvaluablePixels++;continue;}
    requireValue(Number.isFinite(value),'Nonfinite modeled native map observation.');modeledPixels++;rawMaximum=rawMaximum===null?value:Math.max(rawMaximum,value);if(value>=threshold)rawPositivePixels++;
    if(eligible&&!eligible.data[i]){candidateExcludedPixels++;continue;}eligiblePixels++;maximum=maximum===null?value:Math.max(maximum,value);
    if(value>=threshold){pixels++;const x=i%image.width,yy=y+Math.floor(i/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
   }
  }catch(error){primary=error;throw error;}finally{const failures=[];for(const action of[()=>eligible?.release(),()=>release()])try{await action();}catch(error){failures.push(error);}if(failures.length){if(primary&&Object.isExtensible(primary))primary.cleanupErrors=failures;else if(!primary)throw new AggregateError(failures,'Native batch evidence retirement failed');}}
 }
 requireValue(selectedPixels===plan.selected&&modeledPixels===plan.modeled&&nonEvaluablePixels===plan.nonEvaluable,'Native map coverage changed during batch evidence.');
 const inconclusive=eligiblePixels===0;
 return{positive:!inconclusive&&pixels>=minimum,inconclusive,...(inconclusive?{reason:'No admissible native map observations; no zero score was invented.'}:{}),pixels,maximum,threshold,minimumPixels:minimum,scoreMeaning:plan.method==='comprint'?'Thresholded native Comprint anomaly-map observations; not a forgery probability.':'Thresholded independent native TruFor context-map observations; no averaged context score.',evidencePreparation:{...(scope?.policy??{}),adapter:plan.method+'-original-native-map-support',coordinates:'original-source-pixels',sourceSha256:plan.sourceSha256,sourceRegionFingerprint:plan.domain.fingerprint,filtered:true,selectedPixels,modeledPixels,selectedButNonEvaluablePixels:nonEvaluablePixels,eligiblePixels,candidateExcludedPixels,excludedPixels:image.width*image.height-selectedPixels,rawPositivePixels,rawMaximum,nativeContexts:plan.fragments.map(f=>({index:f.index,bounds:f.bounds,nativeShape:f.nativeShape,evaluable:f.evaluable}))},regions:right<0?[]:[{bbox:[left,top,right-left+1,bottom-top+1],kind:'threshold-envelope',note:'Envelope of modeled admitted pixels above threshold; not a filled support mask.'}]};
}
