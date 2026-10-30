// Conservative absolute accumulation bounds for the native LINEAR DCT graph.
// Inputs are bytes; constants are the exact native binary64 bit patterns.
const u=2**-24,u64=2**-53,tiny=2**-120;
const number=bits=>new Float64Array(Uint32Array.from(bits).buffer)[0];
export function dctPairBounds(graph){
 const area=graph.width**2,linear=[],error=[],magnitude=[],isConstant=[];
 for(let i=0;i<graph.nodes.length;i++){
  const n=graph.nodes[i];let v=new Float64Array(area),e=0;
  if(n.op===1){const c=number(n.bits),hi=Math.fround(c),lo=Math.fround(c-hi);v=null;e=Math.abs((c-hi)-lo);isConstant[i]=true;magnitude[i]=Math.abs(c)+e;linear.push(v);error.push(e);continue;}
  if(n.op===2){v[n.source]=1;isConstant[i]=false;}
  else if(n.op===7){for(let j=0;j<area;j++)v[j]=-linear[n.a][j];e=error[n.a];}
  else if(n.op===3||n.op===4){for(let j=0;j<area;j++)v[j]=linear[n.a][j]+(n.op===3?1:-1)*linear[n.b][j];const ma=magnitude[n.a],mb=magnitude[n.b];e=error[n.a]+error[n.b]+(16*u*u+u64)*(ma+mb)+16*tiny;}
  else if(n.op===5||n.op===8){
   if(!isConstant[n.a]&&!isConstant[n.b])throw Error('Native DCT graph is unexpectedly nonlinear.');const k=isConstant[n.a]?n.a:n.b,d=k===n.a?n.b:n.a,c=number(graph.nodes[k].bits);
   for(let j=0;j<area;j++)v[j]=c*linear[d][j];let ma=magnitude[n.a],mb=magnitude[n.b],prod=ma*mb;
   e=ma*error[n.b]+mb*error[n.a]+error[n.a]*error[n.b]+32*u*u*prod+16*tiny;
   if(n.op===8){for(let j=0;j<area;j++)v[j]+=linear[n.c][j];e+=error[n.c]+16*u*u*(prod+magnitude[n.c])+u64*(prod+magnitude[n.c])+16*tiny;}else e+=u64*prod;
  }else throw Error('Unsupported native linear node '+n.op);
  let ideal=0;for(const c of v)ideal+=Math.abs(c)*255;
  // Bound calculations themselves use binary64: this margin exceeds their
  // rounding accumulation and the final binary32 upward conversion below.
  e=(e+tiny)*1.0001;linear.push(v);error.push(e);magnitude.push((ideal+e)*1.0001);isConstant[i]=false;
 }
 return graph.outputs.map(i=>{let radius=Math.fround(error[i]);if(radius<error[i]){const b=new Uint32Array(Float32Array.of(radius).buffer);b[0]++;radius=new Float32Array(b.buffer)[0];}return radius;});
}
