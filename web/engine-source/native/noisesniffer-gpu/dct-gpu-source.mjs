const bits=value=>new Uint32Array(Float32Array.of(value).buffer)[0];
const fp=value=>'bitcast<f32>('+bits(value)+'u)';
const value=bits=>new Float64Array(Uint32Array.from(bits).buffer)[0];
export function dctSource(graph,mode='pair',{image=false,raw=true,guard=false}={}){
 const w=graph.width,n=w*w,T=w===3?3:w===5?5:w===7?8:9,dd=mode==='pair',radii=guard?dctPairBounds(graph):null,retained=Array.from({length:n},(_,i)=>i).filter(i=>{const q=Math.floor(i/w)+i%w;return q>0&&q<T;}),needed=new Set();
 const visit=i=>{if(needed.has(i))return;needed.add(i);const node=graph.nodes[i];if(node.op>=3){visit(node.a);if(node.op!==7)visit(node.b);if(node.op===8)visit(node.c);}};(raw?graph.outputs:retained.map(i=>graph.outputs[i])).forEach(visit);
 let header=String.raw`
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2<f32>{let s=a32(a,b);let v=s32(s,a);let error=a32(s32(a,s32(s,v)),s32(b,v));return vec2<f32>(s,error);}
fn ddAdd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn ddSub(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return ddAdd(a,-b);}
fn ddMul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
fn ddFma(a:vec2<f32>,b:vec2<f32>,c:vec2<f32>)->vec2<f32>{return ddAdd(ddMul(a,b),c);}
`;
 header+='@group(0) @binding(0) var<storage,read> input:array<u32>;\n';let binding=1;if(raw)header+='@group(0) @binding('+binding+++') var<storage,read_write> coefficients:array<vec2<f32>>;\n';header+='@group(0) @binding('+binding+++') var<storage,read_write> variance:array<f32>;\n';
 if(guard)header+=String.raw`
fn castCertified(value:vec2<f32>,radius:f32)->bool{
 let bits=bitcast<u32>(value.x);let magnitude=bits&2147483647u;let exponent=magnitude>>23u;if(exponent<=24u||exponent>=255u){return false;}
 let step=bitcast<f32>((exponent-24u)<<23u);var lower=select(step,step*0.5,(magnitude&8388607u)==0u);var upper=step;
 if((bits&2147483648u)!=0u){let swap=upper;upper=lower;lower=swap;}
 return s32(value.y,radius)> -lower&&a32(value.y,radius)<upper;
}
fn down32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return -bitcast<f32>(8388608u);}return bitcast<f32>(select(bits-1u,bits+1u,(bits&2147483648u)!=0u));}
fn up32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return bitcast<f32>(8388608u);}return bitcast<f32>(select(bits+1u,bits-1u,(bits&2147483648u)!=0u));}
fn squareInterval(value:vec2<f32>,radius:f32)->vec2<f32>{
 let lo=down32(a32(value.x,down32(s32(value.y,radius))));let hi=up32(a32(value.x,up32(a32(value.y,radius))));let maximum=max(abs(lo),abs(hi));
 if(maximum>0.0&&maximum<bitcast<f32>(536870912u)){return vec2<f32>(0.0,bitcast<f32>(8388608u));}
 let lower=select(min(lo*lo,hi*hi),0.0,lo<=0.0&&hi>=0.0);return vec2<f32>(lower,maximum*maximum);
}
`+'@group(0) @binding('+binding+++') var<storage,read_write> rejected:array<u32>;\n';
 if(image)header+='struct Params{width:u32,height:u32,plane:u32,groupsX:u32};\n@group(0) @binding('+binding+++') var<uniform> p:Params;\nfn byte(at:u32)->u32{return (input[at/4u]>>((at%4u)*8u))&255u;}\n';
 header+='@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) id:vec3<u32>){\nlet block='+(image?'id.x+id.y*p.groupsX*32u':'id.x')+';if(block>=arrayLength(&variance)){return;}\n';if(image)header+='let channel=block/p.plane;let point=block%p.plane;let cols=p.width-'+(w-1)+'u;\n';
 if(guard&&image&&!raw)header+='let first=byte(((point/cols)*p.width+point%cols)*3u+channel);var sameBytes=true;for(var dy=0u;dy<'+w+'u&&sameBytes;dy++){for(var dx=0u;dx<'+w+'u&&sameBytes;dx++){sameBytes=byte(((point/cols+dy)*p.width+point%cols+dx)*3u+channel)==first;}}if(sameBytes){variance[block]=0.0;rejected[block]=first+2u;return;}\n';
 const body=graph.nodes.map((node,i)=>{
  if(!needed.has(i))return '';
  const a='v'+node.a,b='v'+node.b,c='v'+node.c;let expression;
  if(node.op===1){const v=value(node.bits);expression=dd?'vec2<f32>('+fp(Math.fround(v))+','+fp(Math.fround(v-Math.fround(v)))+')':fp(Math.fround(v));}
  else if(node.op===2){const scalar=image?'f32(byte(((point/cols+'+Math.floor(node.source/w)+'u)*p.width+point%cols+'+node.source%w+'u)*3u+channel))':'f32(input[block*'+n+'u+'+node.source+'u])';expression=dd?'vec2<f32>('+scalar+',0.0)':scalar;}
  else if(node.op===3)expression=(dd?'ddAdd':'a32')+'('+a+','+b+')';
  else if(node.op===4)expression=(dd?'ddSub':'s32')+'('+a+','+b+')';
  else if(node.op===5)expression=dd?'ddMul('+a+','+b+')':a+'*'+b;
  else if(node.op===7)expression='-'+a;
  else if(node.op===8)expression=(dd?'ddFma':'fma')+'('+a+','+b+','+c+')';
  else throw Error('Unported native arithmetic '+node.op);
  return 'let v'+i+'='+expression+';';
 }).join('\n');
 const outputs=['var squares:array<f32,'+n+'>;'];if(guard)outputs.push('var lowerSquares:array<f32,'+n+'>;var upperSquares:array<f32,'+n+'>;');
 for(let i=0;i<n;i++){const node='v'+graph.outputs[i],out=dd?node:'vec2<f32>('+node+',0.0)';if(raw)outputs.push('coefficients[block*'+n+'u+'+i+'u]='+out+';');const keep=Math.floor(i/w)+i%w>0&&Math.floor(i/w)+i%w<T;
  if(keep){outputs.push('let c'+i+'='+(dd?'a32('+node+'.x,'+node+'.y)':node)+';squares['+i+']=c'+i+'*c'+i+';');if(guard)outputs.push('if(castCertified('+node+','+fp(radii[i])+')){lowerSquares['+i+']=squares['+i+'];upperSquares['+i+']=squares['+i+'];}else{let interval=squareInterval('+node+','+fp(radii[i])+');lowerSquares['+i+']=interval.x;upperSquares['+i+']=interval.y;}');}else{outputs.push('squares['+i+']=0.0;');if(guard)outputs.push('lowerSquares['+i+']=0.0;upperSquares['+i+']=0.0;');}}
 const reduce=(array,prefix)=>{for(let lane=0;lane<8;lane++){outputs.push('var r'+prefix+lane+'='+array+'['+lane+'];');for(let i=8+lane;i<n-n%8;i+=8)outputs.push('r'+prefix+lane+'=a32(r'+prefix+lane+','+array+'['+i+']);');}outputs.push('var sum'+prefix+'=a32(a32(a32(r'+prefix+'0,r'+prefix+'1),a32(r'+prefix+'2,r'+prefix+'3)),a32(a32(r'+prefix+'4,r'+prefix+'5),a32(r'+prefix+'6,r'+prefix+'7)));');for(let i=n-n%8;i<n;i++)outputs.push('sum'+prefix+'=a32(sum'+prefix+','+array+'['+i+']);');};
 reduce('squares','');outputs.push('variance[block]=sum;');if(guard){reduce('lowerSquares','Lo');reduce('upperSquares','Hi');outputs.push('let error=max(abs(s32(sum,sumLo)),abs(s32(sumHi,sum)));rejected[block]=select(0u,1u,!(sum>=sumLo&&sum<=sumHi&&sum>=0.0&&sum<=1e30&&bitcast<u32>(sumLo)==bitcast<u32>(sumHi)&&bitcast<u32>(sum)==bitcast<u32>(sumLo)&&error<='+fp(1e-4)+'));');}
 return header+body+'\n'+outputs.join('\n')+'\n}';
}
import {dctPairBounds} from './dct-pair-bounds.mjs';
