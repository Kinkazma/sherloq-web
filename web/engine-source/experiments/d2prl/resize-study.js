export async function resizeStudy(module,reference,read){const records=[];
 for(const row of reference.records){const input=await read(row.input),expected=await read(row.output),ip=module._malloc(input.byteLength),op=module._malloc(expected.byteLength);if(!ip||!op)throw Error('Resize allocation');
  try{module.HEAPU8.set(input,ip);if(module._d2prl_resize_large(ip,row.channels,row.height,row.width,row.outHeight,row.outWidth,op)!==1)throw Error('Resize rejected');const actual=module.HEAPF32.slice(op/4,(op+expected.byteLength)/4),values=new Float32Array(expected.buffer),bits=new Uint32Array(actual.buffer),nativeBits=new Uint32Array(expected.buffer);let different=0,maxAbs=0,nonfinite=0;for(let i=0;i<actual.length;i++){different+=bits[i]!==nativeBits[i];maxAbs=Math.max(maxAbs,Math.abs(actual[i]-values[i]));nonfinite+=!Number.isFinite(actual[i]);}records.push({name:row.name,different,maxAbs,nonfinite});}finally{module._free(op);module._free(ip);}
 }
 return{schema:1,status:records.every(r=>!r.different&&!r.nonfinite)?'passed':'rejected',scope:reference.scope,cases:records.length,records};
}
