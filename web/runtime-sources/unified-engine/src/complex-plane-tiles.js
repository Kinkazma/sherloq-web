import "../../runtime-context.js?v=0.33.3";
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Physical tiles have no padding or index table. The caller keeps this layout
// for the lifetime of the plane and serializes RMW writes against all readers.
export function createComplexPlaneTiles({store,width,height,stride,budget,tileSize}){
 requireValue(Number.isSafeInteger(tileSize)&&tileSize>0&&tileSize<=128,'Invalid complex tile size.');
 const maximumScratchBytes=Math.min(128*1024,Math.min(width,tileSize)*Math.min(height,tileSize)*stride),metrics={layout:'temporary-tiles',tileSize,physicalBytes:store.byteLength,maximumScratchBytes,scratchRefusals:0,readTileCalls:0,writeTileCalls:0,directTileRowReads:0,directTileRowWrites:0,readBytes:0,writeBytes:0,batchReadCalls:0,batchWriteCalls:0,batchedTilesRead:0,batchedTilesWritten:0,batchScratchAllocations:0,batchScratchRefusals:0,maximumBatchScratchBytes:0,peakScratchCreditBytes:0};
 const read=async(bytes,at,tile,signal)=>{await store.readInto(bytes,at,{signal});metrics.readBytes+=bytes.length;metrics[tile?'readTileCalls':'directTileRowReads']++;};
 const write=async(bytes,at,tile,signal)=>{await store.write(bytes,at,{signal});metrics.writeBytes+=bytes.length;metrics[tile?'writeTileCalls':'directTileRowWrites']++;};
 async function transfer(writing,bytes,x,y,w,h,{signal,cooperate=createCooperator(signal)}={}){
  checkAbort(signal);let scratch,batch,io,failed=false,primary;
  const reserveScratch=amount=>{if(amount>budget.limit-budget.total())throw new EngineError('MEMORY_LIMIT','Optional complex scratch exceeds current funded grants.');return budget.reserve(amount);};
  const refusal=error=>['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)&&!error?.cleanupOwner&&!error?.cleanupError&&!error?.cleanupErrors?.length;
  try{
   try{io=store.pinIoWorkspace?.();scratch=allocateOwnedTypedArray(Uint8Array,maximumScratchBytes,{budget,owner:'complex-plane',label:'complex-tile',reserve:reserveScratch});}
   catch(error){if(!refusal(error))throw error;metrics.scratchRefusals++;}
   // Extra batching is optional and financed after all live worker grants and
   // I/O staging. Never reclaim an endpoint to create this scratch. A refusal
   // occurs before I/O and leaves the exact one-tile fallback below available.
   const firstTile=Math.floor(x/tileSize)*tileSize,lastTile=Math.min(width,Math.ceil((x+w)/tileSize)*tileSize),spanBytes=(lastTile-firstTile)*Math.min(tileSize,height)*stride;
   const batchBytes=store.storage==='temporary'?Math.min(bytes.byteLength,spanBytes,Math.max(0,budget.limit-budget.total())):0;
   if(lastTile-firstTile>tileSize&&batchBytes>maximumScratchBytes){
    try{batch=allocateOwnedTypedArray(Uint8Array,batchBytes,{budget,owner:'complex-plane',label:'complex-tile-batch',reserve:reserveScratch});metrics.batchScratchAllocations++;metrics.maximumBatchScratchBytes=Math.max(metrics.maximumBatchScratchBytes,batchBytes);}
    catch(error){if(!refusal(error))throw error;metrics.batchScratchRefusals++;}
   }
   metrics.peakScratchCreditBytes=Math.max(metrics.peakScratchCreditBytes,(scratch?.data.byteLength??0)+(batch?.data.byteLength??0));

   const selectedStride=w*stride;
   for(let ty=Math.floor(y/tileSize)*tileSize;ty<y+h;ty+=tileSize){
    const th=Math.min(tileSize,height-ty),top=Math.max(y,ty),bottom=Math.min(y+h,ty+th);
    for(let tx=Math.floor(x/tileSize)*tileSize;tx<x+w;tx+=tileSize){
     checkAbort(signal);await cooperate();checkAbort(signal);
     const tw=Math.min(tileSize,width-tx),left=Math.max(x,tx),right=Math.min(x+w,tx+tw),selectedBytes=(right-left)*stride,tileBytes=tw*th*stride,offset=ty*width*stride+tx*th*stride;
     if(batch){
      let end=tx+tw,groupBytes=tileBytes,tiles=1;
      while(end<x+w){const nextWidth=Math.min(tileSize,width-end),nextBytes=nextWidth*th*stride;if(groupBytes+nextBytes>batch.data.length)break;groupBytes+=nextBytes;end+=nextWidth;tiles++;}
      if(tiles>1){
       const group=batch.data.subarray(0,groupBytes),complete=top===ty&&bottom===ty+th&&x<=tx&&x+w>=end;
       if(!writing||!complete){await read(group,offset,true,signal);metrics.batchReadCalls++;metrics.batchedTilesRead+=tiles;checkAbort(signal);}
       // Physical tiles are consecutive, but each keeps its own row stride.
       // Writers use the plane's existing RMW serialization and preserve all
       // bytes outside the requested logical rectangle in this physical span.
       let base=0;
       for(let tileX=tx;tileX<end;tileX+=tileSize){
        const tileWidth=Math.min(tileSize,width-tileX),from=Math.max(x,tileX),until=Math.min(x+w,tileX+tileWidth);
        for(let row=top;row<bottom;row++){const at=(row-y)*selectedStride+(from-x)*stride,physical=base+((row-ty)*tileWidth+from-tileX)*stride,length=(until-from)*stride,selected=bytes.subarray(at,at+length),target=group.subarray(physical,physical+length);if(writing)target.set(selected);else selected.set(target);}
        base+=tileWidth*th*stride;
       }
       if(writing){checkAbort(signal);await write(group,offset,true,signal);metrics.batchWriteCalls++;metrics.batchedTilesWritten+=tiles;checkAbort(signal);}
       tx=end-tileSize;continue;
      }
     }
     const fullColumns=left===tx&&right===tx+tw,bufferTop=fullColumns?top:ty,bufferBytes=fullColumns?(bottom-top)*tw*stride:tileBytes,physicalOffset=offset+(bufferTop-ty)*tw*stride;
     if(fullColumns&&w===tw){const part=bytes.subarray((top-y)*selectedStride,(bottom-y)*selectedStride);await(writing?write(part,physicalOffset,true,signal):read(part,physicalOffset,true,signal));checkAbort(signal);continue;}
     if(!scratch||bufferBytes>scratch.data.length){
      // A tiled plane can never fall back to row-major interpretation. Refusal
      // uses its exact physical row offsets without optional scratch or RMW.
      for(let row=top;row<bottom;row++){checkAbort(signal);const at=(row-y)*selectedStride+(left-x)*stride,part=bytes.subarray(at,at+selectedBytes),physical=offset+((row-ty)*tw+left-tx)*stride;await(writing?write(part,physical,false,signal):read(part,physical,false,signal));}
      continue;
     }
     // Whole physical tile rows are contiguous even when the window covers
     // only a few of them. Gather/scatter just those rows; writes need no RMW.
     const tile=scratch.data.subarray(0,bufferBytes);
     if(!writing||!fullColumns){await read(tile,physicalOffset,true,signal);checkAbort(signal);}
     for(let row=top;row<bottom;row++){
      const at=(row-y)*selectedStride+(left-x)*stride,physical=((row-bufferTop)*tw+left-tx)*stride,selected=bytes.subarray(at,at+selectedBytes),target=tile.subarray(physical,physical+selectedBytes);if(writing)target.set(selected);else selected.set(target);
     }
     if(writing){checkAbort(signal);await write(tile,physicalOffset,true,signal);checkAbort(signal);}
    }
   }
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   await retireCompositeOwners([()=>batch?.release(),()=>scratch?.release(),()=>io?.release()],failed?{primary,requireAck:true}:{requireAck:true});
  }
 }
 return {read:(...args)=>transfer(false,...args),write:(...args)=>transfer(true,...args),metrics:()=>({...metrics})};
}
