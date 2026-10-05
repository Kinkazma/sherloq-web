import {resamplingFft2,resamplingPyrUp} from '../src/resampling-math.js';
import {resamplingFourierParams,resamplingFourierGeometry,resamplingSpectrum,resamplingMagnitude,resamplingFourierView} from '../src/resampling-fourier.js';
export const ensure=(ok,message)=>{if(!ok)throw Error(message);};
export function binaryRecord(payload,record){const bytes=payload.slice(record.offset,record.offset+record.bytes);return record.dtype==='u1'?bytes:new Float64Array(bytes.buffer,bytes.byteOffset,bytes.length/8);}
export function compareFourier(actual,item,payload,label){
 const expected=binaryRecord(payload,item.values),rgb=binaryRecord(payload,item.rgb);ensure(actual.data.values.length===expected.length&&actual.pixels.data.length===rgb.length,label+' output shape');
 let maxAbsolute=0,maxScaled=0,differingScalars=0,differingBytes=0,peak=0;
 for(let i=0;i<expected.length;i++){const a=actual.data.values[i],e=expected[i],error=Math.abs(a-e);ensure(Number.isFinite(a),label+' finite');maxAbsolute=Math.max(maxAbsolute,error);maxScaled=Math.max(maxScaled,error/Math.max(1,Math.abs(e)));differingScalars+=!Object.is(a,e);if(a>actual.data.values[peak])peak=i;}
 for(let i=0;i<rgb.length;i++)differingBytes+=actual.pixels.data[i]!==rgb[i];
 ensure(maxScaled<=1e-8,label+' declared scalar bound '+maxScaled);ensure(differingBytes===0,label+' native Matplotlib byte differences '+differingBytes);
 return {maxAbsolute,maxScaled,differingScalars,differingBytes,peakChanged:peak!==item.peak};
}
export async function verifyResamplingKernels(reference,payload){
 const primitive=[];for(const item of reference.primitives){const source=binaryRecord(payload,item.source),expected=binaryRecord(payload,item.expected),[height,width]=item.source.shape;
  const actual=await(item.kind==='fft'?resamplingFft2:resamplingPyrUp)(source,width,height);ensure(actual.length===expected.length,'Primitive shape');let differingScalars=0;for(let i=0;i<expected.length;i++)differingScalars+=!Object.is(actual[i],expected[i]);ensure(differingScalars===0,item.kind+' native bit identity '+height+'×'+width);primitive.push({kind:item.kind,shape:item.source.shape,differingScalars});}
 const cases=[];let expectedErrors=0;for(const field of reference.kernels){const source=binaryRecord(payload,field.source),[height,width]=field.source.shape,spectra=new Map(),magnitudes=new Map();
  for(const item of field.cases){const p=resamplingFourierParams(item.params),label=field.name+'/'+JSON.stringify(p);if(item.error){let error;try{resamplingFourierGeometry(width,height,p);}catch(e){error=e;}ensure(error?.code==='INVALID_INPUT','Native small-center error');expectedErrors++;continue;}
   const key=JSON.stringify([p.window,p.upsample]);if(!spectra.has(key))spectra.set(key,await resamplingSpectrum(source,width,height,{...p,center:false}));const mk=key+'/'+p.center+'/'+p.highpass;if(!magnitudes.has(mk))magnitudes.set(mk,await resamplingMagnitude(spectra.get(key),p));const m=magnitudes.get(mk),actual={data:{magnitude:m.values,minimumMagnitude:m.low,maximumMagnitude:m.high,geometry:m.geometry}};await resamplingFourierView(actual,p);cases.push({field:field.name,params:p,...compareFourier(actual,item,payload,label)});
  }
 }
 return {primitives:primitive,cases,summary:{cases:cases.length,expectedErrors,maxAbsolute:Math.max(...cases.map(x=>x.maxAbsolute)),maxScaled:Math.max(...cases.map(x=>x.maxScaled)),differingBytes:cases.reduce((s,x)=>s+x.differingBytes,0),peakChanges:cases.filter(x=>x.peakChanged).length,peakMeaning:'Diagnostic first-argmax changes include conjugate equal/near-equal peaks; native Fourier has no argmax-based classification.'}};
}
