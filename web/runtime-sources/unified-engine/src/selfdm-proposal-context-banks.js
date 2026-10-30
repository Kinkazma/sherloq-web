import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort} from './errors.js';
import {SELFDM_PROPOSAL_CONTEXT_GEOMETRY} from './selfdm-proposal-context-geometry.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {registerArrayViews} from './allocation.js';

const MASK=112**2;
export const SELFDM_PROPOSAL_CONTEXT_BANKS='selfdm-proposal-common-native-Top500-per-scale-and-final/1';
const rank=(a,b)=>b.score-a.score||a.globalSlot-b.globalSlot;

/** Consume the unchanged native DeepMask outputs of the prepared literal
 * contexts. A context is an input owner, never an independent Top500 bank.
 * Global slots are integer addresses in canonical context order; they never
 * enter a learned tensor or change the native Float32 score/mask values.
 * The parent keeps geometry/source ownership until this owner is retired. */
export async function createSelfDMProposalContextBanks(geometry,{budget,signal,onOwner}={}){
 requireValue(geometry?.policy===SELFDM_PROPOSAL_CONTEXT_GEOMETRY&&Array.isArray(geometry.contexts)&&geometry.commonBanks?.length===7&&budget?.reserve,'Verified Proposal context geometry and shared budget required');
 checkAbort(signal);
 const credits=[],backings=[],banks=[];let offsets,finalized,released=false,closing,active;
 const retireCredit=async free=>{await free();credits.splice(credits.indexOf(free),1)};
 const owner={policy:SELFDM_PROPOSAL_CONTEXT_BANKS,cloneWindowMode:geometry.cloneWindowMode,banks,
  provenance:{...geometry.provenance,bankPolicy:SELFDM_PROPOSAL_CONTEXT_BANKS,commonTopKPerScale:500,commonFinalTopK:500,tieOrder:'native score descending; scale then canonical context and native slot'},
  release(){if(released)return Promise.resolve();if(closing)return closing;closing=(async()=>{await active;while(backings.length){await backings.at(-1)();backings.pop()}while(credits.length){await credits.at(-1)();credits.pop()}finalized=null;banks.length=0;released=true})().finally(()=>{closing=null});return closing;},
  state:()=>({released,retiring:!!closing,reservations:credits.length}),
  async consume(contextIndex,scaleIndex,tileIndex,output){
   requireValue(!released&&!closing&&!finalized&&!active,'Proposal common banks are busy, finalized, retiring or released');checkAbort(signal);
   let finished;active=new Promise(resolve=>finished=resolve);
   try{
   const context=geometry.contexts[contextIndex],scale=context?.scales?.[scaleIndex],window=scale?.windows?.[tileIndex],bank=banks[scaleIndex],done=bank?.done?.[contextIndex];
   requireValue(window&&done&&!done[tileIndex],'Invalid or repeated native DeepMask owner/window');
   const localRows=Math.ceil(window.height/16)-9,localCols=Math.ceil(window.width/16)-9,slots=localRows*localCols,masks=output?.mask,scores=output?.score;
   requireValue(masks?.data instanceof Float32Array&&JSON.stringify(masks.dims)===JSON.stringify([1,slots,112,112])&&masks.data.length===slots*MASK&&scores?.data instanceof Float32Array&&JSON.stringify(scores.dims)===JSON.stringify([1,1,localRows,localCols])&&scores.data.length===slots,'Native DeepMask output geometry differs');
   requireValue(masks.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1.00001)&&scores.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1.00001),'Native DeepMask probability contract');
   // Object sort scratch is admitted before any candidate records are made.
   const core=(window.row1-window.row0)*(window.col1-window.col0),free=budget.reserve(4096+(bank.count+core)*96);credits.push(free);
   try{
    const candidates=[];
    for(let row=0;row<bank.count;row++)candidates.push({score:bank.scores[row],globalSlot:bank.globalSlots[row],slot:bank.slots[row],contextIndex:bank.contextIndices[row],kept:row});
    for(let y=window.row0;y<window.row1;y++)for(let x=window.col0;x<window.col1;x++){
     const local=(y-window.y/16)*localCols+x-window.x/16,slot=y*scale.cols+x;
     requireValue(Number.isSafeInteger(local)&&local>=0&&local<slots,'Native DeepMask core address differs');
     candidates.push({score:scores.data[local],globalSlot:offsets[scaleIndex][contextIndex]+slot,slot,contextIndex,local});
    }
    candidates.sort(rank);candidates.length=Math.min(bank.capacity,candidates.length);
    const used=new Set(candidates.filter(v=>v.kept!==undefined).map(v=>v.kept)),available=[];
    for(let row=0;row<bank.capacity;row++)if(!used.has(row))available.push(row);
    for(const candidate of candidates)if(candidate.kept===undefined){
     const row=available.pop();bank.data.set(masks.data.subarray(candidate.local*MASK,(candidate.local+1)*MASK),row*MASK);bank.scores[row]=candidate.score;bank.slots[row]=candidate.slot;bank.globalSlots[row]=candidate.globalSlot;bank.contextIndices[row]=candidate.contextIndex;used.add(row);
    }
    // Same in-place compaction as the native caller, no second mask bank.
    const occupied=[...used].sort((a,b)=>a-b);
    for(let row=0;row<occupied.length;row++){const old=occupied[row];if(old!==row){bank.data.copyWithin(row*MASK,old*MASK,(old+1)*MASK);bank.scores[row]=bank.scores[old];bank.slots[row]=bank.slots[old];bank.globalSlots[row]=bank.globalSlots[old];bank.contextIndices[row]=bank.contextIndices[old]}}
    bank.count=candidates.length;done[tileIndex]=1;bank.nativeWindowsConsumed++;
   }catch(primary){await retireCompositeOwners([()=>retireCredit(free)],{primary});throw primary}
   // A failed release stays in credits and remains reachable by release().
   await retireCredit(free);
   }finally{active=null;finished()}
  },
  finalize(){
   requireValue(!released&&!closing&&!active&&banks.every(b=>b.done.every(d=>d.every(Boolean))),'Every native context/scale/window must complete before the common final Top500');checkAbort(signal);if(finalized)return finalized;
   // The returned descriptors borrow this owner's compact mask buffers.
   // No copy, deduplication, threshold, context TopK or new normalization.
   const free=budget.reserve(4096+banks.reduce((n,b)=>n+b.count,0)*128);credits.push(free);
   const candidates=[];
   for(const bank of banks)for(let row=0;row<bank.count;row++){
    const contextIndex=bank.contextIndices[row],context=geometry.contexts[contextIndex],scale=context.scales[bank.scaleIndex];
    candidates.push({score:bank.scores[row],scale:bank.scaleIndex,row,slot:bank.slots[row],globalSlot:bank.globalSlots[row],contextIndex,contextId:context.id,contextBounds:context.bounds,cols:scale.cols,data:bank.data.subarray(row*MASK,(row+1)*MASK)});
   }
   candidates.sort((a,b)=>b.score-a.score||a.scale-b.scale||a.globalSlot-b.globalSlot);candidates.length=Math.min(500,candidates.length);finalized=candidates;return finalized;
  }};
 try{
  onOwner?.(owner);
  // The entire metadata/mask bank admission precedes every corresponding
  // typed-array allocation. These banks are bounded independently of RGB.
  credits.push(budget.reserve(65536));offsets=Array.from({length:7},()=>[]);let admission=0;
  for(let index=0;index<7;index++){
   let offset=0;
   for(const context of geometry.contexts){const scale=context.scales[index],count=scale.rows*scale.cols;requireValue(Number.isSafeInteger(count)&&count>=0&&(count>0||scale.status==='not-evaluable'&&scale.windows.length===0)&&count<=0x7fffffff&&Number.isSafeInteger(offset+count),'Native DeepMask slot geometry exceeds exact integer storage');offsets[index].push(offset);offset+=count}
   const capacity=Math.min(500,offset);requireValue(capacity===geometry.commonBanks[index].maximumRows,'Common bank admission differs from verified geometry');
   admission+=capacity*(MASK*4+4+4+8+4)+geometry.contexts.reduce((n,c)=>n+c.scales[index].windows.length,0);
  }
  requireValue(Number.isSafeInteger(admission),'Proposal common bank memory exceeds exact admission');credits.push(budget.reserve(admission));
  for(let index=0;index<7;index++){
   const capacity=geometry.commonBanks[index].maximumRows;
   banks.push({scaleIndex:index,capacity,count:0,data:new Float32Array(capacity*MASK),scores:new Float32Array(capacity),slots:new Int32Array(capacity),globalSlots:new Float64Array(capacity),contextIndices:new Int32Array(capacity),done:geometry.contexts.map(c=>new Uint8Array(c.scales[index].windows.length)),nativeWindowsConsumed:0});
   const bank=banks.at(-1);backings.push(registerArrayViews(budget,{...bank,...Object.fromEntries(bank.done.map((v,i)=>['done'+i,v]))},{owner:'selfdm-proposal',label:'proposal-common-native-mask-bank'}));
  }
  return owner;
 }catch(primary){await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
}
