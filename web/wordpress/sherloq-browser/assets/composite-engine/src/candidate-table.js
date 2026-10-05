import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

export const CANDIDATE_COLUMNS=Object.freeze(['x','y','rgbChannelIndex','flag','originalValue','replacementValue']);
export const CANDIDATE_CSV_HEADER='x,y,channel,candidate,original_value,replacement_value,radius,minimum_deviation,maximum_neighbour_range\r\n';
export const candidateCsvLine=(rows,i,p)=>[rows[i],rows[i+1],'RGB'[rows[i+2]],rows[i+3]===1?'hot':'dead',rows[i+4],rows[i+5],p.radius,p.threshold,p.spread].join(',')+'\r\n';

export function createCandidateTable(store,{budget,params}={}){
 requireValue(store.byteLength%24===0&&budget&&params,'Invalid candidate table.');
 const descriptor=Object.freeze({id:crypto.randomUUID(),revision:1,format:'uint32-table',rowCount:store.byteLength/24,
  columns:CANDIDATE_COLUMNS,order:'y,x,BGR',coordinates:'full-resolution',storage:store.storage});
 const p=Object.freeze({...params});let disposed=false,disposing;
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Candidate table disposed.');};
 function range({offset=0,length=4096}={}){
  alive();requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>0&&offset<=descriptor.rowCount,'Invalid table range.');
  return {offset,length:Math.min(length,descriptor.rowCount-offset)};
 }
 const table={
  descriptor,
  async readRows(request,{signal}={}){
   const {offset,length}=range(request);checkAbort(signal);const release=budget.reserve(length*24);
   try{const data=new Uint32Array(length*6);await store.readInto(new Uint8Array(data.buffer),offset*24);checkAbort(signal);
    return {tableId:descriptor.id,revision:1,offset,length,totalRows:descriptor.rowCount,columns:CANDIDATE_COLUMNS,data,done:offset+length===descriptor.rowCount,release};
   }catch(error){release();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Candidate page allocation failed.');throw error;}
  },
  async readCsv(request,{signal}={}){
   const {offset,length}=range(request);checkAbort(signal);
   // UInt32 coordinates, fixed strings and validated byte-valued parameters:
   // 128 ASCII bytes per row bounds the string, its construction and encoding.
   const bound=128*length+CANDIDATE_CSV_HEADER.length,release=budget.reserve(bound*4);let page;
   try{
    page=await table.readRows({offset,length:Math.max(1,length)},{signal});let text=offset===0?CANDIDATE_CSV_HEADER:'';
    for(let i=0;i<page.data.length;i+=6){if(i%(4096*6)===0)await controlCheckpoint(signal);text+=candidateCsvLine(page.data,i,p);}
    const bytes=new TextEncoder().encode(text);checkAbort(signal);
    return {tableId:descriptor.id,revision:1,offset,length,nextOffset:offset+length,totalRows:descriptor.rowCount,done:page.done,mime:'text/csv',bytes,release};
   }catch(error){release();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Candidate CSV page allocation failed.');throw error;}
   finally{page?.release();}
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=Promise.resolve(store.dispose());return disposing;}
 };
 return table;
}
