// Whole-image counts are prepared once from bounded Original windows. This
// reader never holds a second image, and yields between tiles for local work.
export async function readWholeChannelHistogram(source,{signal,onProgress=()=>{},workerFactory=url=>new Worker(url,{type:'module'})}={}){
 const invalid=message=>Object.assign(Error(message),{code:'INVALID_INPUT'}),cancellation=()=>Object.assign(Error('Histogram source changed.'),{code:'CANCELLED'});
 let failure=null;const cancelled=()=>{if(signal?.aborted)throw cancellation();if(failure)throw failure;};
 cancelled();if(!source||typeof source.readPixels!=='function'||![source.width,source.height].every(value=>Number.isSafeInteger(value)&&value>0)||!Number.isSafeInteger(source.width*source.height))throw invalid('A native source with positive dimensions is required.');
 const capability=source.capability;if(capability&&(!['CMYK','RGB','GRAY'].includes(capability.space)||![8,16].includes(capability.depth)||!Array.isArray(capability.channels)||capability.channels.length!==({CMYK:4,RGB:3,GRAY:1}[capability.space])||capability.width!==undefined&&capability.width!==source.width||capability.height!==undefined&&capability.height!==source.height))throw invalid('A declared native channel layout is required.');
 const worker=workerFactory(new URL('./local-channel-histogram-worker.js?v=0.33.1',import.meta.url)),columns=Math.ceil(source.width/1024),rows=Math.ceil(source.height/1024),total=columns*rows,native=source.capability,expectedBins=native?native.channels.length*2**native.depth:1024,aggregateId='whole-'+crypto.randomUUID();let pending=null,seq=0,data,observations=0,interrupt;
 const interrupted=new Promise((_resolve,reject)=>interrupt=reject);void interrupted.catch(()=>{});
 const stop=error=>{failure??=error;worker.terminate();const owner=pending;pending=null;owner?.reject(error);interrupt(error);},abort=()=>stop(cancellation());
 worker.onmessage=({data:reply})=>{if(!pending||reply.id!==pending.id)return;const owner=pending;pending=null;reply.error?owner.reject(Object.assign(Error(reply.error.message),reply.error)):owner.resolve(reply);};
 worker.onerror=event=>stop(Error(event.message||'Whole-image histogram worker failed.'));signal?.addEventListener('abort',abort,{once:true});
 try{
  cancelled();
  for(let index=0;index<total;index++){
   cancelled();const x=(index%columns)*1024,y=Math.floor(index/columns)*1024,rect={x,y,width:Math.min(1024,source.width-x),height:Math.min(1024,source.height-y)},pixels=await Promise.race([source.readPixels(rect),interrupted]);cancelled();
   const answer=await Promise.race([new Promise((resolve,reject)=>{const id=++seq;pending={id,resolve,reject};try{worker.postMessage({id,pixels,params:{channel:3,start:0,end:255},aggregate:{id:aggregateId,reset:index===0,final:index===total-1}},[pixels.data.buffer]);}catch(error){pending=null;reject(error);}}),interrupted]);cancelled();
   observations+=rect.width*rect.height;
   if(answer.aggregate?.id!==aggregateId||answer.aggregate.pixels!==observations||answer.aggregate.count!==index+1||answer.aggregate.complete!==(index===total-1)||!(answer.data?.bins instanceof Float64Array)||answer.data.bins.length!==expectedBins||!(answer.data?.cumulative instanceof Float64Array)||answer.data.cumulative.length!==expectedBins)throw invalid('The whole-image histogram reply differs from its native source observations.');
   if(native&&(answer.data.space!==native.space||answer.data.depth!==native.depth||answer.data.binCount!==2**native.depth||answer.data.total!==observations||!Array.isArray(answer.data.channels)||answer.data.channels.length!==native.channels.length||answer.data.channels.some((value,index)=>value!==native.channels[index])||!Array.isArray(answer.data.channelMeans)||answer.data.channelMeans.length!==native.channels.length||answer.data.channelMeans.some(value=>!Number.isFinite(value))))throw invalid('The native colour histogram differs from its declared channels.');
   data=answer.data;onProgress({completed:index+1,total});cancelled();
   if(index+1<total)await Promise.race([new Promise(resolve=>setTimeout(resolve,0)),interrupted]);
  }
  return data;
 }finally{signal?.removeEventListener('abort',abort);worker.terminate();}
}
