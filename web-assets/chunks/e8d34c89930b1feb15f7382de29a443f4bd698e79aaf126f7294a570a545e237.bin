import "../../runtime-context.js?v=0.31.0";
import {serializeEngineError} from './errors.js';

const read=(value,key)=>{try{return value?.[key];}catch{return undefined;}},text=value=>typeof value==='string'&&value.trim()?value.slice(0,2048):undefined;
function primitive(value){return typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value);}
// Emscripten can throw a C++ exception object containing only excPtr. It is
// not an Error and String(error) loses the only available native evidence.
// Keep that evidence without guessing the C++ exception type or its cause.
export function serializeRecompressionCodecError(error,context){
 const diagnostic={};for(const key of ['codec','phase'])if(text(context?.[key]))diagnostic[key]=text(context[key]);for(const key of ['width','height','quality','nativeMaximumBytes','codecHeapBytes'])if(typeof context?.[key]==='number'&&Number.isFinite(context[key]))diagnostic[key]=context[key];if(typeof context?.lossless==='boolean')diagnostic.lossless=context.lossless;
 diagnostic.thrownType=error===null?'null':typeof error;
 const pointer=read(error,'excPtr');if(Number.isSafeInteger(pointer)&&pointer>0){diagnostic.nativeCppException=true;diagnostic.nativeExceptionPointer=pointer;}
 for(const key of ['severity','errno']){const value=read(error,key);if(primitive(value))diagnostic[key]=value;}
 const related=read(error,'relatedErrors');if(Array.isArray(related))diagnostic.relatedErrors=related.slice(0,8).map(value=>{const item={},message=text(read(value,'message'));if(message)item.message=message;for(const key of ['code','severity']){const v=read(value,key);if(primitive(v))item[key]=v;}return item;});
 let encoded;try{encoded=serializeEngineError(error,'RECOMPRESSION_FAILED');}catch{
  // Diagnostic getters and objects without a string conversion must not hide
  // the codec failure itself. Only a small scalar projection crosses workers.
  encoded=serializeEngineError({name:text(read(error,'name'))??'Error',code:text(read(error,'code'))??'RECOMPRESSION_FAILED',message:text(read(error,'message'))??'[object Object]'},'RECOMPRESSION_FAILED');
 }
 if(encoded.message==='[object Object]'){
  const description=text(read(error,'description'))??text(read(error,'reason'))??text(read(error,'error'));
  if(description){
   const projected=serializeEngineError({message:description},'RECOMPRESSION_FAILED');encoded={...encoded,message:description,...(encoded.code==='RECOMPRESSION_FAILED'&&projected.code==='MEMORY_ALLOCATION'?{code:projected.code}:{})};
  }else encoded.message=`${diagnostic.nativeCppException?'Native C++':'Native'} codec exception during ${diagnostic.phase??'recompression'}${diagnostic.codec?` (${diagnostic.codec.toUpperCase()})`:''}; the native runtime provided no message.`;
 }
 const details=encoded.details;encoded.details={...(details&&typeof details==='object'&&!Array.isArray(details)?details:details===undefined?{}:{reportedDetails:details}),codecFailure:diagnostic};return encoded;
}
