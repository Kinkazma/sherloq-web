import "../../../../../runtime-context.js?v=0.31.0";
import {resolveRecompressionPlan,deriveRecompressionPlan,recompressionFormat} from './recompression-plan.js';
import {equalizationState} from './equalization-settings.js';
import {checkAbort,requireValue} from './errors.js';

export const ELA_SYNTHESIS_RECIPE=Object.freeze({schema:'sherloq.ela-synthesis-recipe/1',ela:Object.freeze({scale:1,contrast:0,linear:false,grayscale:false}),equalization:Object.freeze({method:'histogram',value:100,channels:false,position:'each-frame-before-median'}),aggregation:'per-channel-median',evenQuantization:'arithmetic-mean-of-two-central-values-then-uint8-truncation'});
const effective=plan=>{const {requestedQuality,...stage}=plan.stage;return JSON.stringify(stage);};

// This describes the existing encoder controls. A quality index is never
// interpreted as an equivalent JPEG quality or an inferred historical quality.
export async function resolveElaSynthesisAxis(image,params={}, {signal}={}){
 checkAbort(signal);const base=await resolveRecompressionPlan({...params,quality:params.quality||params.recompression?.quality||75},image,{signal}),format=recompressionFormat(base.stage.codec);
 requireValue(format,'A verified recompressor is required for ELA synthesis.');
 const codec=base.stage.codec,palette=!base.stage.lossless&&format.qualityKind==='palette-colors',variable=!base.stage.lossless&&format.qualityMeaningful!==false,kind=palette?'palette-colors':variable?'codec-quality':base.stage.lossless?'fixed-lossless':'fixed-no-quality-axis';
 const values=palette?Array.from({length:255},(_,i)=>i+2):variable?Array.from({length:codec==='jpeg'?99:100},(_,i)=>i+1):[null];
 const equalization=equalizationState();equalization.method='histogram';const seen=new Set(),states=[];let equivalentOptionsRemoved=0;
 for(const value of values){
  checkAbort(signal);const quality=palette||!variable?base.stage.requestedQuality:value,recompression={codec,lossless:base.stage.lossless,...(palette?{paletteColors:value}:{})},plan=deriveRecompressionPlan({quality,recompression},base,{signal}),key=effective(plan);
  // Preserve every historical JPEG contribution. Other providers may expose
  // several labels for the very same options; only options can be deduplicated.
  if(codec!=='jpeg'&&seen.has(key)){equivalentOptionsRemoved++;continue;}seen.add(key);
  const frameParams={quality,...ELA_SYNTHESIS_RECIPE.ela,equalization:structuredClone(equalization),...(codec==='jpeg'&&!base.stage.lossless?{}:{recompression})};
  states.push({index:states.length,value,params:frameParams,plan});
 }
 requireValue(states.length>0,'No effective synthesis state was selected.');
 return{schema:'sherloq.ela-synthesis-axis/1',codec,kind,variable:states.length>1,states,count:states.length,equivalentOptionsRemoved,sourceFormat:base.sourceFormat,sourceMode:base.sourceMode,selection:base.selection,definition:codec==='jpeg'?'Historical JPEG qualities1–99 inclusive; one contribution for every quality.':palette?'Every integer palette size2–256; no dithering, using the selected native palette encoder.':variable?'Every integer quality1–100 accepted by this provider; no JPEG-quality equivalence implied.':'One fixed effective encoder state; no variable quality axis is claimed.'};
}
