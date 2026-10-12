import{NativeRandom}from'./random.js';
import{initialOffsets,searchBounds,randomCandidates,wrapOffsets,propagateOffsets,nonlocalOffsets}from'./candidates.js';
export async function candidateStudy(reference,payload,hash,{diagnose}={}){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),results=[];
 for(const row of reference.records){
  const n=row.side**2,bytes=payload.slice(row.input.offset,row.input.offset+row.input.bytes);if(await hash(bytes)!==row.input.sha256)throw Error('Input identity');const values=new Float32Array(bytes.buffer),pair={x:values.subarray(0,n),y:values.subarray(n)},bounds=await searchBounds(pair,row.side);
  for(const op of row.operations){let rng,result;if(op.initial)rng=new NativeRandom(op.initial);
   try{
    switch(op.operation){
     case'bounds':result=[bounds.minX,bounds.maxX,bounds.minY,bounds.maxY];break;
     case'random':result=await randomCandidates(pair,bounds,row.side,rng);break;
     case'wrap':result=await wrapOffsets(pair,row.side);break;
     case'propagate':result=await propagateOffsets(pair,row.side);break;
     case'propagateWrap':result=await wrapOffsets(await propagateOffsets(pair,row.side),row.side);break;
     case'nonlocal':result=await nonlocalOffsets(pair,row.side,rng);break;
     case'initial':{const r=await initialOffsets(row.side,rng);result=[r.zm.x,r.zm.y,r.cnn.x,r.cnn.y];break;}
     default:throw Error('Unknown operation');
    }
    if(!Array.isArray(result))result=[result.x,result.y];let passed=true;
    for(let i=0;i<result.length;i++){const a=result[i],expected=op.outputs[i];if(a.byteLength!==expected.bytes||await hash(new Uint8Array(a.buffer,a.byteOffset,a.byteLength))!==expected.sha256){passed=false;await diagnose?.(row,op,i,a);}}
    if(rng&&!same(rng.snapshot(),op.final))throw Error('Native RNG order');results.push({name:row.name,operation:op.operation,passed});
   }finally{rng?.dispose();}
  }
  if(await hash(bytes)!==row.input.sha256)throw Error('Input mutation');
 }
 const pair={x:new Float32Array(448**2),y:new Float32Array(448**2)},controller=new AbortController();let cancelled=false,refused=false;
 const pending=propagateOffsets(pair,448,{signal:controller.signal});setTimeout(()=>controller.abort(),0);try{await pending;}catch(error){cancelled=error.code==='CANCELLED';}
 const denial=new Error('Memory refusal');try{await propagateOffsets(pair,448,{account:()=>{throw denial;}});}catch(error){refused=error===denial;}if(!cancelled||!refused)throw Error('Candidate lifecycle');
 return{schema:1,status:results.every(x=>x.passed)?'passed':'rejected',scope:reference.scope,cases:reference.records.length,operations:results.length,results,lifecycle:{cancelled,refused,inputPreserved:true}};
}
