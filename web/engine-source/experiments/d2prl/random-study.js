import{NativeRandom}from'./random.js';
export async function randomStudy(reference,hash){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);let calls=0,values=0;
 for(const record of [...reference.records,reference.model]){
  const generator=new NativeRandom(record.initial);
  try{for(const draw of record.draws){const result=await generator.values(draw.count);if(await hash(new Uint8Array(result.buffer))!==draw.sha256)throw Error('Native random stream '+draw.label);calls++;values+=draw.count;}if(!same(generator.snapshot(),record.final))throw Error('Native random state');}finally{generator.dispose();}
 }
 const generator=new NativeRandom(reference.model.initial),before=generator.snapshot(),controller=new AbortController();let cancelled=false,refused=false,busy=false;
 try{const pending=generator.values(4*1024**2,{signal:controller.signal});try{await generator.values(1);}catch(error){busy=error.code==='INVALID_INPUT';}setTimeout(()=>controller.abort(),0);try{await pending;}catch(error){cancelled=error.code==='CANCELLED';}if(!same(generator.snapshot(),before))throw Error('Cancelled RNG changed stream');const failure=new Error('memory refusal');try{await generator.values(1,{account:()=>{throw failure;}});}catch(error){refused=error===failure;}if(!same(generator.snapshot(),before))throw Error('Refused RNG changed stream');const draw=reference.model.draws[0],retry=await generator.values(draw.count);if(await hash(new Uint8Array(retry.buffer))!==draw.sha256||!cancelled||!refused||!busy)throw Error('RNG lifecycle');}finally{generator.dispose();}
 return{schema:1,status:'passed',scope:reference.scope,states:reference.records.length+1,calls,values,modelCalls:reference.model.draws.length,modelValues:reference.model.draws.reduce((a,d)=>a+d.count,0),lifecycle:{cancelled,refused,busy,retry:true,streamRolledBack:true}};
}
