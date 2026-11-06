import {computeLocalChannelHistogram,createChannelHistogramAggregate} from './local-channel-histogram-core.js?v=0.33.0';
import {computeNativeChannelHistogram,nativeColorLayout,createNativeHistogramAggregate} from './native-channel-histogram-core.js?v=0.33.0';

const workspace={seen:new Uint8Array(1<<21)};
const aggregateWorkspace={};let activeAggregate=null;
self.onmessage=event=>{
 const {id,pixels,params,returnPixels,aggregate}=event?.data??{};
 try{
  if(returnPixels!==undefined&&typeof returnPixels!=='boolean')throw Object.assign(Error('The native window return flag must be boolean.'),{code:'INVALID_INPUT'});
  // The maintained RGB8 render path is selected only when no native-space
  // declaration exists. An invalid declared space must never fall back to it.
  const native=pixels!==null&&typeof pixels==='object'&&Object.hasOwn(pixels,'space'),layout=native?nativeColorLayout(pixels):null,kind=native?'native:'+layout.space+':'+layout.depth+':'+layout.channels:'render:rgb8';
  if(aggregate!==undefined){
   const invalid=message=>{throw Object.assign(Error(message),{code:'INVALID_INPUT'});};
   if(!aggregate||typeof aggregate!=='object'||Array.isArray(aggregate)||typeof aggregate.id!=='string'||!aggregate.id)invalid('A non-empty histogram aggregate identity is required.');
   if(aggregate.reset!==undefined&&typeof aggregate.reset!=='boolean'||aggregate.final!==undefined&&typeof aggregate.final!=='boolean')invalid('Histogram aggregate reset and final flags must be boolean.');
   if(returnPixels===true)invalid('An aggregate histogram never returns source pixel windows.');
   if(aggregate.reset!==true&&activeAggregate?.id!==aggregate.id)invalid('The histogram aggregate must start with reset.');
   if(aggregate.reset!==true&&activeAggregate.kind!==kind)invalid('The histogram colour space or depth changed without an aggregate reset.');
   const owner=aggregate.reset===true?{id:aggregate.id,kind,native,value:native?createNativeHistogramAggregate():createChannelHistogramAggregate(aggregateWorkspace)}:activeAggregate;
   const data=owner.value.append(pixels,params),complete=aggregate.final===true;
   activeAggregate=complete?null:owner;
   self.postMessage({id,data,aggregate:{id:owner.id,pixels:owner.native?owner.value.total:owner.value.pixels,count:owner.value.count,complete}},[data.bins.buffer,data.cumulative.buffer]);
   return;
  }
  const data=native?computeNativeChannelHistogram(pixels):computeLocalChannelHistogram(pixels,params,workspace),transfer=[data.bins.buffer,data.cumulative.buffer];
  if(returnPixels===true){transfer.push(pixels.data.buffer);self.postMessage({id,data,pixels},transfer);}
  else self.postMessage({id,data},transfer);
 }
 catch(error){self.postMessage({id,error:{name:error?.name??'Error',code:error?.code??'INTERNAL',message:String(error?.message??error)}});}
};
