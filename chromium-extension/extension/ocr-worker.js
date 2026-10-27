import './native-runtime.js';
import {createPpocrAnalyzer} from './ocr-native/ppocr-analyzer.js';
import {Budget} from './vendor/unified-engine/src/cache.js';
import {resolveComputeProfile} from './vendor/unified-engine/src/profiles.js';
let analyzer;const controllers=new Map();
self.onmessage=async({data})=>{
 if(data.type==='dispose'){for(const c of controllers.values())c.abort();analyzer?.dispose();close();return;}if(data.type!=='recognize')return;
 const controller=new AbortController();controllers.set(data.id,controller);let result;
 try{
  if(!analyzer){const c=await(await fetch(new URL('./resource-catalog.json',import.meta.url))).json(),url=hash=>new URL('./resource/'+hash,import.meta.url).href,root=new URL('./pdf-models/',import.meta.url),runtime={factoryUrl:new URL('wasm-factory.mjs',root).href,ortUrl:new URL('ort.wasm.min.mjs',root).href,wasmUrl:new URL('ort-wasm-simd-threaded.wasm',root).href};analyzer=createPpocrAnalyzer({budget:new Budget(2*1024**3),profile:resolveComputeProfile('aggressive',{hardwareConcurrency:1}),configuration:{assets:Object.fromEntries(Object.entries(c.ocr.assets).map(([key,v])=>[key,{...v,url:url(v.sha256)}])),dictionary:{...c.ocr.dictionary,url:url(c.ocr.dictionary.sha256)},runtimes:{wasm:runtime}}});}
  const image=data.pixels;image.readWindow=async rect=>{const out=new Uint8Array(rect.width*rect.height*3);for(let row=0;row<rect.height;row++)out.set(image.data.subarray(((rect.y+row)*image.width+rect.x)*3,((rect.y+row)*image.width+rect.x+rect.width)*3),row*rect.width*3);return {pixels:{width:rect.width,height:rect.height,format:'rgb8',data:out},release(){}};};
  result=await analyzer.analyze(image,{orientationCorrection:true},{signal:controller.signal,backend:'cpu',onProgress:value=>self.postMessage({id:data.id,progress:value.phase})});self.postMessage({id:data.id,text:result.nativeText,regions:result.regions,metadata:result.metadata});
 }catch(error){self.postMessage({id:data.id,error:{code:error.code,message:error.message}});}finally{result?.release();controllers.delete(data.id);}
};
