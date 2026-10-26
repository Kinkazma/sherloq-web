import {OCR_ASSETS} from './ocr-assets.js?v=0.25.0';
const root=new URL('./ocr-assets/',import.meta.url),shared=new URL('./unified-assets/',import.meta.url);
const resolve=spec=>({...spec,url:new URL(spec.file,root).href});
/** Configuration only: language and model bodies are fetched by the admitted
 * native OCR adapter on demand, never while opening unrelated tools. */
export async function ocrConfiguration({algorithm='ppocr-medium'}={}){
 const languages=Object.fromEntries(Object.entries(OCR_ASSETS.languages).map(([key,spec])=>[key,resolve(spec)]));
 if(algorithm==='tesseract')return{languages};
 const response=await fetch(new URL('neural-runtime/manifest.json',shared));
 if(!response.ok)throw Object.assign(Error('OCR runtime configuration could not load.'),{code:'ASSET_HTTP'});
 const manifest=await response.json(),runtimes=Object.fromEntries(Object.entries(manifest.providers).map(([provider,item])=>[provider,{factoryUrl:new URL('neural-runtime/'+item.factory,shared).href,ortUrl:new URL('ort/ort.'+(provider==='wasm'?'wasm':'webgpu')+'.min.mjs',shared).href,wasmUrl:new URL('ort/'+item.wasm,shared).href}]));
 return {languages,ppocr:{assets:Object.fromEntries(Object.entries(OCR_ASSETS.ppocr.assets).map(([key,spec])=>[key,resolve(spec)])),dictionary:resolve(OCR_ASSETS.ppocr.dictionary),runtimes}};
}
