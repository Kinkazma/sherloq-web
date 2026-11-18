import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
// Lazy presentation reads of already-owned PCA finals. No PCA is recomputed.
// A captured existing UI memory grant funds arrays/vertices/GPU palette before
// allocation, and is retired only after the caller drops its scene references.
export async function readPcaTablePresentation(client,output,{isCurrent,onOwner,onPeerUnavailable}={}){
 const model=output.tables?.pca_model,cloud=output.tables?.pca_cloud,count=cloud?.rowCount,depth=output.data?.inputDepth??8;
 if(model?.format!=='float64-table'||model.rowCount!==5||cloud?.format!=='float32-table'||!Number.isSafeInteger(count)||count<1||count>131072||![8,16].includes(depth)||typeof onOwner!=='function'||typeof isCurrent!=='function')throw Error('Invalid retained PCA tables.');
 const original=client.source,bytes=count*(depth===16?60:54)+120+2*4096*6*4+4096;let grant,admission,modelValues,rgb,rgb16,data,invalid=false,closing=false,retirement;const reads=new Set();
 const valid=()=>!closing&&!invalid&&isCurrent?.()===true&&client.source===original;
 const drop=()=>{if(data){data.mean=data.eigenvectors=data.eigenvalues=null;if(data.cloud)data.cloud.rgb=data.cloud.rgb16=null;}data=modelValues=rgb=rgb16=null;};
 const owner={get data(){return data;},dispose(){if(retirement)return retirement;closing=true;const task=Promise.resolve().then(async()=>{await Promise.allSettled([admission,...reads]);drop();await grant?.dispose();}).catch(primary=>{throw withRetirementOwner(primary,owner,primary);});retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;}};const adopted=onOwner(owner);if(adopted===false||adopted===0||adopted&&typeof adopted.then==='function')throw Error('PCA presentation adoption must be synchronous.');
 try{
  admission=client.reservePcaCloudPresentation(bytes,{onOwner:held=>{grant=held;return true;},onPeerUnavailable:event=>{invalid=true;onPeerUnavailable?.(event);drop();}});await admission;if(!valid())throw Error('PCA presentation authority changed.');
  modelValues=new Float64Array(15);rgb=new Uint8Array(count*3);if(depth===16)rgb16=new Uint16Array(count*3);
  const readPage=(table,offset,length,consume)=>{const task=(async()=>{let page=await client.readTable(table,offset,length);try{if(!valid())throw Error('PCA table authority changed during its read.');return consume(page);}finally{page.data=null;page=null;}})();reads.add(task);void task.finally(()=>reads.delete(task)).catch(()=>{});return task;};
  await readPage(model,0,5,page=>{if(!(page.data instanceof Float64Array)||page.length!==5||page.data.length!==15)throw Error('Incomplete PCA model table.');modelValues.set(page.data);});
  for(let offset=0;offset<count;){offset+=await readPage(cloud,offset,4096,page=>{if(!(page.data instanceof Float32Array)||page.length<1||page.offset!==offset||page.data.length!==page.length*6)throw Error('Incomplete PCA cloud table.');for(let row=0;row<page.length;row++)for(let c=0;c<3;c++){const value=page.data[row*6+c],color=page.data[row*6+3+c];if(!Number.isInteger(value)||value<0||value>(depth===16?65535:255)||!Number.isInteger(color)||color<0||color>255)throw Error('Invalid PCA coordinates or canonical colors.');(rgb16??rgb)[(offset+row)*3+c]=value;rgb[(offset+row)*3+c]=color;}return page.length;});}
  data={...output.data,channelOrder:'BGR',mean:modelValues.subarray(0,3),eigenvectors:modelValues.subarray(3,12),eigenvalues:modelValues.subarray(12,15),cloud:{...output.data.cloud,rgb,...(rgb16?{rgb16}:{}),inputDepth:depth}};return owner;
 }catch(primary){try{await owner.dispose();}catch(cleanup){throw Object.assign(Error(String(primary?.message??primary),{cause:primary}),{cleanupOwner:owner,cleanupErrors:[cleanup]});}throw primary;}
}
