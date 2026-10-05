import {recompressionLosses} from './jpeg-recompression.js';
import {parameters,roundEven} from './pixel-utils.js';import {jpegHeader} from './image-headers.js';import {checkAbort,requireValue} from './errors.js';
import {normalizeQualityCurve} from './quality-arithmetic.js';
export function qualityParams(input={}){const p=parameters(input,{modelId:null});requireValue(p.modelId===null||typeof p.modelId==='string'&&p.modelId.length>0&&p.modelId.length<=128&&!p.modelId.includes('\0'),'Invalid JPEG-quality model id.');return p;}
export const qualityReferences=p=>p.modelId===null?[]:[p.modelId];
const luma=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
const chroma=[17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99,...Array(32).fill(99)];
export function tableEstimate(tables,components){
 if(![1,3].includes(components.length)||components.some(k=>!tables[k]||tables[k].length!==64))return null;
 const distance=new Float64Array(101);let closest=0;
 for(let q=0;q<=100;q++){
  const scale=q<50?Math.floor(5000/Math.max(q,1)):200-2*q;let total=0;
  for(let c=0;c<components.length;c++){
   const base=c===0?luma:chroma,table=tables[components[c]];let sum=0;
   for(let k=0;k<64;k++)sum+=Math.abs(table[k]-Math.max(1,Math.min(255,Math.floor((base[k]*scale+50)/100))));
   total+=sum/64;
  }
  distance[q]=total/components.length;if(distance[q]<distance[closest])closest=q;
 }
 const deviation=distance[closest],quality=Math.max(1,Math.min(100,deviation===0?closest:roundEven(closest-deviation)));
 return {quality,deviation,distance};
}
export async function jpegQuality(image,p,hooks={},context){
 let computed=false;
 const computeCurve=async()=>{computed=true;
 const losses=await recompressionLosses(image,Array.from({length:100},(_,i)=>i+1),hooks,context),raw=losses.raw;
 const recompressed=performance.now(),curve=await normalizeQualityCurve(raw,hooks),normalized=performance.now();
 let minimum=0;for(let i=1;i<95;i++)if(curve[i]<curve[minimum])minimum=i;minimum=minimum===94?100:minimum+1;
 return {raw,curve,minimum,metrics:{...losses.metrics,qualityNormalizationMs:normalized-recompressed}};
 };
 const base=await(context.memoImage?context.memoImage('loss-curve',computeCurve):computeCurve()),{raw,curve,minimum}=base;
 let quantization=null,estimate=null,metadataError=null;
 if(context.jpegHeader||context.bytes?.[0]===255&&context.bytes?.[1]===216){try{const h=context.jpegHeader??jpegHeader(context.bytes);requireValue(h.quantization&&Object.keys(h.quantization).length>0&&Object.values(h.quantization).every(table=>table.every(x=>x>0)),'Missing or invalid JPEG quantization tables.');quantization={tables:h.quantization,components:h.components};estimate=tableEstimate(h.quantization,h.components);}catch(error){metadataError=error.message;}}
 let prediction=null,modelError=null;const predictionStart=performance.now();
 if(!quantization&&!metadataError){const model=context.references?.[0]?.model;if(model){const output=await model.predict(curve,{signal:hooks.signal});try{prediction=output.scores[0];}finally{output.release();}}else modelError='Load a local JPEG-quality JSON model to enable this estimate.';}
 checkAbort(hooks.signal);
 return {data:{qualities:Uint8Array.from({length:100},(_,i)=>i+1),raw,curve,minimum,quantization,estimate,metadataError,prediction,modelError},engineMetrics:{...(computed?base.metrics:{workers:1,kernel:'jpeg-quality-cached-curve',qualityKernelMs:0,qualityPreparationMs:0,qualityRecompressionMs:0,qualityNormalizationMs:0}),qualityPredictionMs:performance.now()-predictionStart},semantics:'Grayscale recompression curve and quantization-table estimate; for non-JPEG signatures only, optional learned estimate of previous JPEG quality. Minimum, table estimate and learned prediction are distinct evidence, not proof of compression history or authenticity.'};
}
