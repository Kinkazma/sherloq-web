import {requireValue} from './errors.js';
/** No probing: choose the shipped equivalent operator from real tensor sizes.
 * Eight padded score arrays cover logits/probabilities, Pad/Transpose and
 * partial products/reduction. Two key/value banks also cover padded V.
 */
export function truforQueryPlan(block,keys,channels,attentionBytes,{backend='auto',gpuAvailable=Boolean(globalThis.navigator?.gpu),cpuOnly=false}={}){
 const split=block.querySplitValue;
 if(split)requireValue(typeof split.name==='string'&&split.chunkKeys===1024&&Number.isSafeInteger(split.minKeys)&&split.minKeys>0,'Invalid TruFor split-value graph contract.');
 const useSplit=Boolean(split&&backend!=='cpu'&&!cpuOnly&&gpuAvailable&&keys>=split.minKeys),paddedKeys=useSplit?Math.ceil(keys/split.chunkKeys)*split.chunkKeys:keys,scoreFactor=useSplit?8:4,bankBytes=keys*channels*8;
 const bytesPerQuery=paddedKeys*block.heads*4*scoreFactor+channels*4*16;
 return {name:useSplit?split.name:block.query,splitValue:useSplit,paddedKeys,queries:Math.max(1,Math.floor(attentionBytes/bytesPerQuery)),workspaceBytes:count=>(useSplit?bankBytes*2:bankBytes)+count*bytesPerQuery};
}
