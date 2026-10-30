import "../../runtime-context.js?v=0.30.0";
import{SELFDM_WINDOW_FEATURES,SELFDM_WINDOW_ATTENDED,SELFDM_WINDOW_QUERIES,SELFDM_WINDOW_BANK,SELFDM_WINDOW_GLOBAL}from'./selfdm-window-context-graph.js';
import{requireValue,checkAbort,controlCheckpoint,EngineError}from'./errors.js';
const channels=[256,512,512],tensor=(data,dims)=>({data,dims,type:'float32'});
/** Stable copies only: original context order and native grid row order.
 * No descriptor normalization, clustering, sorting or additional TopK. */
export function createSelfDMWindowFeatureBank(plan,{budget}={}){
 const n=plan.nativeCandidateRows;requireValue(plan.status==='ready'&&Number.isSafeInteger(n)&&n>0&&budget?.reserve,'Actual native SelfDM plan and admitted bank required');
 const free=budget.reserve(n*1280*4+65536),arrays=[],consumed=new Set();let sealed=false,released=false;
 try{for(const c of channels)arrays.push(new Float32Array(n*c));}catch(error){free();throw error;}
 return{
  async consume(context,result,{signal}={}){requireValue(!released&&!sealed&&plan.contexts.includes(context)&&!consumed.has(context)&&context.count>0,'Unique live native context bank row required');checkAbort(signal);
   for(let i=0;i<3;i++){const value=result[SELFDM_WINDOW_FEATURES[i]],c=channels[i];requireValue(value?.data instanceof Float32Array&&JSON.stringify(value.dims)===JSON.stringify([1,c,64,64])&&value.data.length===c*4096,'Original native SelfDM encoder grid required');for(let ch=0;ch<c;ch++){if((ch&31)===0)await controlCheckpoint(signal);for(let k=0;k<context.count;k++)arrays[i][ch*n+context.offset+k]=value.data[ch*4096+context.gridIndices[k]];}}
   checkAbort(signal);consumed.add(context);
  },
  seal(){requireValue(!released&&!sealed&&plan.contexts.filter(c=>c.count>0).every(c=>consumed.has(c)),'Every actual native context must complete before common relations');sealed=true;return Object.fromEntries(SELFDM_WINDOW_FEATURES.map((name,i)=>[name,tensor(arrays[i],[1,channels[i],1,n])]));},
  release(){if(released)return;released=true;free();},
  get rows(){return n;}
 };
}
/** Restore one native64×64 map for the spatial decoder. Refused candidate
 * positions were absent from BOTH common relation operands, not merely hidden
 * after a full-context attention run. These zero slots are latent absence. */
export function scatterSelfDMWindowCorrelations(plan,context,result,{budget}={}){
 const value=result[SELFDM_WINDOW_BANK],n=plan.nativeCandidateRows;requireValue(plan.contexts.includes(context)&&context.count>0&&value?.data instanceof Float32Array&&JSON.stringify(value.dims)===JSON.stringify([1,144,1,n]),'Common native correlation bank required');
 const free=budget.reserve(144*4096*4);try{const data=new Float32Array(144*4096);for(let c=0;c<144;c++)for(let k=0;k<context.count;k++)data[c*4096+context.gridIndices[k]]=value.data[c*n+context.offset+k];let released=false;return{tensor:tensor(data,[1,144,64,64]),release(){if(released)return;released=true;free();}};}catch(error){free();throw error;}
}
export function selfDMWindowGlobalValue(result){const value=result[SELFDM_WINDOW_GLOBAL];requireValue(value?.data instanceof Float32Array&&value.data.length===48&&JSON.stringify(value.dims)==='[1,48,1,1]','The SAME native48-channel ASPP global branch must feed every spatial context');return value;}

/** Only the query axis is partitioned. Every native job receives the SAME full
 * candidate bank, and these disjoint ranges exhaust0..N-1 in native order. */
export function* selfDMWindowQueryRanges(n,{maximumQueries=4096,maximumMatrixElements=4096**2}={}){
 requireValue(Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(maximumQueries)&&maximumQueries>0&&Number.isSafeInteger(maximumMatrixElements),'Valid native query activation admission required');
 if(n>maximumMatrixElements)throw new EngineError('MEMORY_LIMIT','Even one complete native candidate row exceeds query activation admission',{details:{nativeCandidates:n,maximumMatrixElements}});
 const count=Math.min(n,maximumQueries,Math.floor(maximumMatrixElements/n));for(let offset=0;offset<n;offset+=count)yield{offset,count:Math.min(count,n-offset),candidates:n};
}
export function createSelfDMWindowQuery(range,{budget}={}){
 requireValue(Number.isSafeInteger(range.offset)&&Number.isSafeInteger(range.count)&&range.count>0&&range.offset>=0&&range.offset+range.count<=range.candidates&&budget?.reserve,'Admitted exhaustive SelfDM query range required');const free=budget.reserve(range.count*8+1024);try{const data=new BigInt64Array(range.count);for(let i=0;i<range.count;i++)data[i]=BigInt(range.offset+i);let released=false;return{range,tensor:{data,dims:[range.count],type:'int64'},release(){if(released)return;released=true;free();}};}catch(error){free();throw error;}
}
function createQueryBank(plan,names,sizes,{budget}){
 const n=plan.nativeCandidateRows,free=budget.reserve(n*sizes.reduce((a,b)=>a+b,0)*4+65536),arrays=[];let count=0,sealed=false,released=false;try{for(const c of sizes)arrays.push(new Float32Array(n*c));}catch(error){free();throw error;}
 return{async consume(range,result,{signal}={}){requireValue(!released&&!sealed&&range.offset===count&&range.candidates===n&&range.count>0&&count+range.count<=n,'Native query blocks must cover every candidate exactly once in order');for(let i=0;i<names.length;i++){const t=result[names[i]],c=sizes[i];requireValue(t?.data instanceof Float32Array&&JSON.stringify(t.dims)===JSON.stringify([1,c,1,range.count]),'Native compact query output shape required');for(let ch=0;ch<c;ch++){if((ch&31)===0)await controlCheckpoint(signal);arrays[i].set(t.data.subarray(ch*range.count,(ch+1)*range.count),ch*n+range.offset);}}checkAbort(signal);count+=range.count;},seal(){requireValue(!released&&!sealed&&count===n,'Complete native query bank required before dependent relations or mean');sealed=true;return Object.fromEntries(names.map((name,i)=>[name,tensor(arrays[i],[1,sizes[i],1,n])]));},release(){if(released)return;released=true;free();}};
}
export const createSelfDMWindowAttentionBank=(plan,options)=>createQueryBank(plan,SELFDM_WINDOW_ATTENDED,[256,512,512],options);
export const createSelfDMWindowCorrelationBank=(plan,options)=>createQueryBank(plan,[SELFDM_WINDOW_BANK],[144],options);
