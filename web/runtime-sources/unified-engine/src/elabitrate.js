import "../../runtime-context.js?v=0.33.3";
import {requireValue,checkAbort,createCooperator} from './errors.js';

// Qualified prototype kernel 8d4e90d8c7c9a37294bad4aaec3c8ff09abb4e8cf2f58bb509a99c3e09d59fda.
// The product admits only SDR RGB8. Fractional settings describe an equivalent
// quantization step, never a physical fractional bit or inferred sensor depth.
export const ELABITRATE_SEMANTICS='Absolute truncation residual on SDR RGB8 codes, globally stretched across admitted RGB components. Fractional settings are equivalent quantization steps, not physical fractional bits. No authenticity verdict.';
export function elabitrateParams(input={}){
 requireValue(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>key==='removed'),'Last Bit Analysis accepts only the removed-bit setting.');
 const value=input.removed??1,units=Math.round(value*10);
 requireValue(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value*10-units)<=1e-8&&units>=0&&units<=20,'Last Bit Analysis removes 0…2 bits in increments of 0.1.');
 return{removed:units/10};
}
export function elabitrateQuantization(params){
 const {removed}=elabitrateParams(params),keep=(80-Math.round(removed*10))/10,step=2**removed;
 return{depth:8,keep,removed,step,mode:'truncate',defaultRule:'N-1',fractional:Math.round(removed*10)%10!==0,quantization:'Q(x)=floor(x/step)*step; step=2^(8-k)',residual:'abs(x-Q(x))',analysisDomain:'sdr-rgb8-presentation',informationDepth:'not-estimated',inputTransform:'none-after-canonical-RGB8-import'};
}
export function elabitrateResiduals(params){
 const contract=elabitrateQuantization(params),values=new Float64Array(256);
 // These operations and their order are the qualified prototype quantizer.
 for(let code=0;code<256;code++)values[code]=Math.abs(code-Math.floor(code/contract.step)*contract.step);
 return{contract,values};
}
export function elabitrateNormalize(histogram,params){
 requireValue(histogram instanceof Float64Array&&histogram.length===256,'Funded RGB8 histogram required.');
 const{contract,values}=elabitrateResiduals(params);let minimum=255,maximum=0,count=0,sum=0,nonzero=0;
 for(let code=0;code<256;code++){const n=histogram[code];requireValue(Number.isSafeInteger(n)&&n>=0,'Invalid RGB8 histogram population.');if(!n)continue;const r=values[code];minimum=Math.min(minimum,r);maximum=Math.max(maximum,r);count+=n;sum+=n*r;if(r)nonzero+=n;}
 requireValue(Number.isSafeInteger(count)&&count>0,'Last Bit Analysis needs admitted RGB8 components.');
 const span=maximum-minimum,lut=new Uint8Array(256);
 for(let code=0;code<256;code++)lut[code]=span?Math.max(0,Math.min(255,Math.round((values[code]-minimum)*255/span))):0;
 return{lut,data:{contract,minimum,maximum,constant:span===0,componentCount:count,nonzeroComponents:nonzero,meanAbsoluteCodeResidual:sum/count,statisticsReduction:'RGB8 histogram weighted in ascending code order',normalization:{scope:'global-all-admitted-pixels-all-RGB-components',minimum,maximum,outputMinimum:0,outputMaximum:span?255:0,rounding:'nearest; exact half upward'},analysisDomain:'sdr-rgb8-presentation',outputDepth:8,sourceMutated:false}};
}
export async function elabitrateHistogram(bytes,histogram,{signal}={}){
 requireValue(bytes instanceof Uint8Array&&histogram instanceof Float64Array&&histogram.length===256,'RGB8 bytes and histogram required.');const cooperate=createCooperator(signal);
 for(let start=0;start<bytes.length;start+=65536){await cooperate();const end=Math.min(bytes.length,start+65536);for(let i=start;i<end;i++)histogram[bytes[i]]++;}checkAbort(signal);
}
export async function elabitrateLookup(bytes,lut,{signal,target}={}){
 requireValue(bytes instanceof Uint8Array&&lut instanceof Uint8Array&&lut.length===256,'RGB8 bytes and normalized lookup required.');
 const output=target??new Uint8Array(bytes.length);requireValue(output instanceof Uint8Array&&output.length===bytes.length&&output.buffer!==bytes.buffer,'Independent funded RGB8 destination required.');const cooperate=createCooperator(signal);
 for(let start=0;start<bytes.length;start+=65536){await cooperate();const end=Math.min(bytes.length,start+65536);for(let i=start;i<end;i++)output[i]=lut[bytes[i]];}checkAbort(signal);return output;
}
export async function elabitrate(image,params,hooks={}){
 const p=elabitrateParams(params);requireValue(image?.format==='rgb8'&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'Canonical RGB8 input required.');
 const histogram=new Float64Array(256);await elabitrateHistogram(image.data,histogram,hooks);const normalized=elabitrateNormalize(histogram,p),data=await elabitrateLookup(image.data,normalized.lut,hooks);
 return{pixels:{width:image.width,height:image.height,format:'rgb8',data},data:normalized.data,semantics:ELABITRATE_SEMANTICS};
}
