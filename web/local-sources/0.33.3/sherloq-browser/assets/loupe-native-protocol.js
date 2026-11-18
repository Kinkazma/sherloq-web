// Native loupe transport contracts. Pixel processing and scientific parameters
// remain owned by the native engine; this module only checks wire data.
export const isRecord=value=>{if(value===null||typeof value!=='object')return false;const prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;};
export const positiveId=value=>Number.isSafeInteger(value)&&value>0;
export function validRect(rect,width,height){
 if(!isRecord(rect)||![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1)return false;
 const right=rect.x+rect.width,bottom=rect.y+rect.height;
 return Number.isSafeInteger(right)&&Number.isSafeInteger(bottom)&&(width===undefined||right<=width)&&(height===undefined||bottom<=height);
}
export function validRgb(pixels,rect){
 if(!isRecord(pixels)||pixels.format!=='rgb8'||!positiveId(pixels.width)||!positiveId(pixels.height)||!(pixels.data instanceof Uint8Array))return false;
 const bytes=pixels.width*pixels.height*3;
 return Number.isSafeInteger(bytes)&&pixels.data.length===bytes&&(!rect||pixels.width===rect.width&&pixels.height===rect.height);
}
const MAX_CAUSES=16;
const errorText=value=>{try{return String(value);}catch{return 'Unprintable error';}};
export function validError(value,seen=new Set(),depth=0){
 if(!isRecord(value)||typeof value.message!=='string'||seen.has(value)||depth>MAX_CAUSES)return false;
 for(const key of ['name','code','stack'])if(value[key]!==undefined&&typeof value[key]!=='string')return false;
 seen.add(value);return value.cause===undefined||validError(value.cause,seen,depth+1);
}
export function protocolFailure(message,details={},cause){return Object.assign(Error(message,cause===undefined?undefined:{cause}),{code:'WORKER_MESSAGE_FAILED',details});}
export function encodeError(error,seen=new Set(),depth=0){
 if(depth>=MAX_CAUSES)return{code:'WORKER_FAILED',message:'Error cause depth exceeded'};
 if(error!==null&&(typeof error==='object'||typeof error==='function')){if(seen.has(error))return{code:'WORKER_FAILED',message:'Circular error cause'};seen.add(error);}
 const value={name:typeof error?.name==='string'?error.name:'Error',code:typeof error?.code==='string'?error.code:'WORKER_FAILED',message:typeof error?.message==='string'?error.message:errorText(error)};
 if(typeof error?.stack==='string')value.stack=error.stack;
 if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:errorText(error.details)};}
 if(error?.cause!==undefined)value.cause=encodeError(error.cause,seen,depth+1);return value;
}
export function decodeError(value){
 if(!validError(value))throw protocolFailure('Invalid native loupe error response.',{executionPhase:'error-receive'});
 const error=Object.assign(Error(value.message),value);if(value.cause!==undefined)error.cause=decodeError(value.cause);return error;
}
