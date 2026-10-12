// Offline qualification only; never imported by the product runtime.
export async function softmaxStudy(module,reference,payload){
 const part=p=>new Float32Array(payload.buffer,payload.byteOffset+p.offset,p.length/4),records=[];
 const compare=(actual,expected)=>{let different=0,maxAbs=0,first=[];const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);for(let i=0;i<a.length;i++)if(a[i]!==b[i]){different++;maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));if(first.length<4)first.push({index:i,actual:actual[i],expected:expected[i]});}return{elements:a.length,different,maxAbs,first};};
 for(const [kind,rows]of [['exponential',[reference.exponential]],['softmax',reference.softmax]])for(const row of rows){
  const input=part(row.input),expected=part(row.output),p=module._malloc(input.byteLength),q=module._malloc(expected.byteLength);if(!p||!q)throw Error('Study allocation failed');
  try{module.HEAPF32.set(input,p/4);if(kind==='exponential')module._d2prl_exp_values(p,row.count,q);else if(module._d2prl_softmax_planes(p,row.candidates,row.count,q)!==1)throw Error('Study dimensions refused');const actual=module.HEAPF32.slice(q/4,q/4+expected.length);records.push({kind,candidates:row.candidates??null,...compare(actual,expected)});}finally{module._free(p);module._free(q);}
 }
 return{schema:1,status:records.every(r=>r.different===0)?'passed':'rejected',scope:reference.scope,layout:reference.layout,records};
}
