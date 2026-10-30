import {GPU_POSITIVE_F64_WGSL} from './gpu-f64-positive.js';
// OpenCV4.11 getGaussianKernel(11,1.5,CV_64F), IEEE754 words. Same public
// mathematical coefficients as the pinned native median/SSIM implementation.
export const MEDIAN_GAUSSIAN_BITS=Uint32Array.from([3039436142,1062263126,451257781,1065295840,1977106278,1067609777,3907617816,1069285135,4113242611,1070285763,178819775,1070663254,4113242611,1070285763,3907617816,1069285135,1977106278,1067609777,451257781,1065295840,3039436142,1062263126]);
const bindings=`
@group(0)@binding(0)var<storage,read_write> stack:array<u32>;
@group(0)@binding(1)var<storage,read_write> horizontal:array<vec2<u32>>;
@group(0)@binding(2)var<storage,read_write> output:array<vec2<u32>>;
@group(0)@binding(3)var<storage,read> weights:array<vec2<u32>>;
@group(0)@binding(4)var<storage,read_write> error:array<atomic<u32>>;
@group(0)@binding(5)var<uniform> shape:vec4<u32>;
fn reflect(at:i32)->u32{var v=at%126;if(v<0){v+=126;}if(v>=64){v=126-v;}return u32(v);}
`;
export function medianStackShader(radius){
 if(!Number.isInteger(radius)||radius<1||radius>4)throw Error('Median stack radius');
 const side=2*radius+1,count=side*side;
 const selection=radius<=2?`var values:array<u32,${count}>;var count=0u;for(var dy= -${radius};dy<=${radius};dy++){for(var dx= -${radius};dx<=${radius};dx++){let xx=u32(clamp(i32(x)+dx,0,63));let yy=u32(clamp(i32(y)+dy,0,63));let value=stack[source+yy*64u+xx];var j=count;loop{if(j==0u){break;}if(values[j-1u]<=value){break;}values[j]=values[j-1u];j--;}values[j]=value;count++;}}let value=values[${count>>1}];`:`var hist:array<u32,256>;for(var dy= -${radius};dy<=${radius};dy++){for(var dx= -${radius};dx<=${radius};dx++){let xx=u32(clamp(i32(x)+dx,0,63));let yy=u32(clamp(i32(y)+dy,0,63));hist[stack[source+yy*64u+xx]]++;}}var sum=0u;var value=0u;for(var i=0u;i<256u;i++){sum+=hist[i];if(sum>${count>>1}u){value=i;break;}}`;
 return bindings+`@compute@workgroup_size(64)fn main(@builtin(global_invocation_id)gid:vec3<u32>){let n=shape.x*4096u;let at=gid.x;if(at>=n){return;}let local=at%4096u;let block=at/4096u;let x=local%64u;let y=local/64u;let source=shape.y*n+block*4096u;${selection}stack[shape.z*n+at]=value;}`;
}
export function medianGaussianShader(windows,levels){
 const layers=1+windows*levels,fields=2*layers+windows*levels;
 return GPU_POSITIVE_F64_WGSL+bindings+`
const LAYERS=${layers}u;const LEVELS=${levels}u;const FIELDS=${fields}u;
fn integer64(value:u32)->vec2<u32>{if(value==0u){return vec2<u32>(0u);}let e=31u-countLeadingZeros(value);return vec2<u32>(0u,((1023u+e)<<20u)|((value-(1u<<e))<<(20u-e)));}
fn moment(field:u32,at:u32,n:u32)->vec2<u32>{if(field<LAYERS){return integer64(stack[field*n+at]);}if(field<2u*LAYERS){let a=stack[(field-LAYERS)*n+at];return integer64(a*a);}let node=field-2u*LAYERS;let current=1u+node;let previous=select(current-1u,0u,node%LEVELS==0u);return integer64(stack[previous*n+at]*stack[current*n+at]);}
fn addmul(a:vec2<u32>,b:vec2<u32>,c:vec2<u32>)->vec2<u32>{let result=positiveFma64(a,b,c);if(result.z!=0u){atomicOr(&error[0],1u);}return result.xy;}
@compute@workgroup_size(128)fn gaussianHorizontal(@builtin(global_invocation_id)gid:vec3<u32>){let n=shape.x*4096u;let at=gid.x;let field=gid.y;if(at>=n||field>=FIELDS){return;}let local=at%4096u;let block=at/4096u;let x=local%64u;let y=local/64u;var sum=vec2<u32>(0u);for(var k=0u;k<11u;k++){sum=addmul(moment(field,block*4096u+y*64u+reflect(i32(x)+i32(k)-5),n),weights[k],sum);}horizontal[field*n+at]=sum;}
@compute@workgroup_size(128)fn gaussianVertical(@builtin(global_invocation_id)gid:vec3<u32>){let n=shape.x*4096u;let at=gid.x;let field=gid.y;if(at>=n||field>=FIELDS){return;}let local=at%4096u;let block=at/4096u;let x=local%64u;let y=local/64u;let base=field*n+block*4096u;var sum=addmul(horizontal[field*n+at],weights[5],vec2<u32>(0u));for(var k=1u;k<=5u;k++){let a=horizontal[base+reflect(i32(y)-i32(k))*64u+x];let b=horizontal[base+reflect(i32(y)+i32(k))*64u+x];let pair=addmul(a,vec2<u32>(0u,1072693248u),b);sum=addmul(pair,weights[5u+k],sum);}output[field*n+at]=sum;}
`;
}
