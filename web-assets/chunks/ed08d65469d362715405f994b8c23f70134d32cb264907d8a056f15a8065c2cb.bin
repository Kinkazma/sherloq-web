import "../../runtime-context.js?v=0.33.2";
import {native16SeparationFilterPlan} from './native16-separation-filter-plan.js';
// Original7x7 template,21x21 search, integer squared distances, original
// quantized weight LUTs and unsigned rounded division. No search pruning.
export function separationNlmShader({grayscale,points=false}){
 const common=String.raw`
struct Shape{w:u32,h:u32,start:u32,rows:u32,observed:u32,originX:u32,nativeWidth:u32,taps:u32};
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> shape:Shape;
@group(0) @binding(3) var<storage,read> table:array<u32>;
@group(0) @binding(4) var<storage,read> membership:array<u32>;
@group(0) @binding(5) var<storage,read_write> scratch:array<u32>;
fn border(v:i32,n:u32)->u32{if(n==1u){return 0u;}let period=2*i32(n)-2;let r=((v%period)+period)%period;return u32(select(period-r,r,r<i32(n)));}
fn pixel(x:i32,y:i32)->u32{return source[border(y,shape.h)*shape.w+border(x,shape.w)];}
fn square(a:u32,b:u32)->vec2<u32>{let l=i32(a&255u)-i32(b&255u);${grayscale?'return vec2<u32>(u32(l*l),0u);':'let x=i32((a>>8u)&255u)-i32((b>>8u)&255u);let y=i32((a>>16u)&255u)-i32((b>>16u)&255u);return vec2<u32>(u32(l*l),u32(x*x+y*y));'}}
fn accumulate(distance:vec2<u32>,v:u32,estimate:ptr<function,vec3<u32>>,mass:ptr<function,vec2<u32>>){let wl=table[distance.x>>6u];(*estimate).x+=wl*(v&255u);(*mass).x+=wl;${grayscale?'':'let wa=table[shape.taps+(distance.y>>6u)];(*estimate).y+=wa*((v>>8u)&255u);(*estimate).z+=wa*((v>>16u)&255u);(*mass).y+=wa;'}}
fn finish(estimate:vec3<u32>,mass:vec2<u32>)->u32{let l=(estimate.x+mass.x/2u)/mass.x;${grayscale?'return l;':'let a=(estimate.y+mass.y/2u)/mass.y;let b=(estimate.z+mass.y/2u)/mass.y;return l|(a<<8u)|(b<<16u);'}}
`;
 if(points)return common+String.raw`
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w/27u){return;}let x=i32(p*27u+13u);let y=13;var estimate=vec3<u32>(0u);var mass=vec2<u32>(0u);
 for(var dy=-10;dy<=10;dy++){for(var dx=-10;dx<=10;dx++){var distance=vec2<u32>(0u);for(var ty=-3;ty<=3;ty++){for(var tx=-3;tx<=3;tx++){distance+=square(pixel(x+tx,y+ty),pixel(x+dx+tx,y+dy+ty));}}accumulate(distance,pixel(x+dx,y+dy),&estimate,&mass);}}
 output[p*27u+13u]=finish(estimate,mass);}
`;
 return common+String.raw`
var<workgroup> squared:array<vec2<u32>,196>;
var<workgroup> horizontal:array<vec2<u32>,112>;
@compute @workgroup_size(8,8) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>,@builtin(local_invocation_index) thread:u32){
 let baseX=i32(group.x*8u);let baseY=i32(shape.start+group.y*8u);let x=baseX+i32(local.x);let y=baseY+i32(local.y);let validPixel=x<i32(shape.w)&&y<i32(shape.start+shape.rows);var estimate=vec3<u32>(0u);var mass=vec2<u32>(0u);
 for(var dy=-10;dy<=10;dy++){for(var dx=-10;dx<=10;dx++){
  for(var load=thread;load<196u;load+=64u){let sx=baseX+i32(load%14u)-3;let sy=baseY+i32(load/14u)-3;squared[load]=square(pixel(sx,sy),pixel(sx+dx,sy+dy));}
  workgroupBarrier();
  for(var load=thread;load<112u;load+=64u){let row=load/8u;let col=load%8u;var sum=vec2<u32>(0u);for(var k=0u;k<7u;k++){sum+=squared[row*14u+col+k];}horizontal[load]=sum;}
  workgroupBarrier();
  var distance=vec2<u32>(0u);for(var k=0u;k<7u;k++){distance+=horizontal[(local.y+k)*8u+local.x];}if(validPixel){accumulate(distance,pixel(x+dx,y+dy),&estimate,&mass);}
 }}
 if(validPixel){output[u32(y-i32(shape.start))*shape.w+u32(x)]=finish(estimate,mass);}
}
`;
}

// Native16 uses the same 8x8/14x14 rolling patch schedule. Gray distances
// and weighted sums are exact unsigned64 pairs; nominal Lab uses compensated
// f32 pairs and marks only an ambiguous weight-bin for native point repair.
export function separationNlmNative16Shader({grayscale,radius=1}){
 const plan=native16SeparationFilterPlan({mode:4,radius,grayscale});
 const common=String.raw`
struct Shape{w:u32,h:u32,start:u32,rows:u32,observed:u32,originX:u32,nativeWidth:u32,taps:u32};
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> shape:Shape;
@group(0) @binding(3) var<storage,read> table:array<u32>;
@group(0) @binding(4) var<storage,read> membership:array<u32>;
@group(0) @binding(5) var<storage,read_write> scratch:array<u32>;
fn border(v:i32,n:u32)->u32{if(n==1u){return 0u;}let period=2*i32(n)-2;let r=((v%period)+period)%period;return u32(select(period-r,r,r<i32(n)));}
fn address(x:i32,y:i32)->u32{return border(y,shape.h)*shape.w+border(x,shape.w);}
fn add64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{let low=a.x+b.x;return vec2<u32>(low,a.y+b.y+select(0u,1u,low<a.x));}
fn less64(a:vec2<u32>,b:vec2<u32>)->bool{return a.y<b.y||(a.y==b.y&&a.x<b.x);}
fn multiply64(a:u32,b:u32)->vec2<u32>{let a0=a&65535u;let a1=a>>16u;let b0=b&65535u;let b1=b>>16u;let p0=a0*b0;let middle=(p0>>16u)+a1*b0;let carry=middle>>16u;let lowMiddle=(middle&65535u)+a0*b1;return vec2<u32>((p0&65535u)|(lowMiddle<<16u),a1*b1+carry+(lowMiddle>>16u));}
// Quotients here are <=65535. A f32 estimate is at most one integer away;
// the comparisons correct it with exact wide products before it is used.
fn divide64(a:vec2<u32>,b:u32)->u32{var q=u32((f32(a.y)*4294967296.0+f32(a.x))/f32(b));if(q>0u&&less64(a,multiply64(q,b))){q--;}if(!less64(a,multiply64(q+1u,b))){q++;}return q;}
`;
 const gray=String.raw`
fn pixel(x:i32,y:i32)->u32{return source[2u*address(x,y)]&65535u;}
fn square(a:u32,b:u32)->vec2<u32>{let d=u32(abs(i32(a)-i32(b)));return vec2<u32>(d*d,0u);}
var<workgroup> squared:array<vec2<u32>,196>;
var<workgroup> horizontal:array<vec2<u32>,112>;
@compute @workgroup_size(8,8) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>,@builtin(local_invocation_index) thread:u32){
 let baseX=i32(group.x*8u);let baseY=i32(shape.start+group.y*8u);let x=baseX+i32(local.x);let y=baseY+i32(local.y);let validPixel=x<i32(shape.w)&&y<i32(shape.start+shape.rows);var estimate=vec2<u32>(0u);var mass=0u;
 for(var dy=-10;dy<=10;dy++){for(var dx=-10;dx<=10;dx++){
  for(var load=thread;load<196u;load+=64u){let sx=baseX+i32(load%14u)-3;let sy=baseY+i32(load/14u)-3;squared[load]=square(pixel(sx,sy),pixel(sx+dx,sy+dy));}
  workgroupBarrier();
  for(var load=thread;load<112u;load+=64u){let row=load/8u;let col=load%8u;var sum=vec2<u32>(0u);for(var k=0u;k<7u;k++){sum=add64(sum,squared[row*14u+col+k]);}horizontal[load]=sum;}
  workgroupBarrier();
  var distance=vec2<u32>(0u);for(var k=0u;k<7u;k++){distance=add64(distance,horizontal[(local.y+k)*8u+local.x]);}
  if(validPixel){let bin=divide64(distance,4227136u);var weight=0u;if(bin<shape.taps){weight=table[bin];}estimate=add64(estimate,multiply64(weight,pixel(x+dx,y+dy)));mass+=weight;}
 }}
 if(validPixel){let code=divide64(add64(estimate,vec2<u32>(mass/2u,0u)),mass);let at=2u*(u32(y-i32(shape.start))*shape.w+u32(x));output[at]=code|(code<<16u);output[at+1u]=code;}
}
`;
 const color=String.raw`
fn pixel(x:i32,y:i32)->vec3<f32>{let at=4u*address(x,y);return vec3<f32>(bitcast<f32>(source[at]),bitcast<f32>(source[at+1u]),bitcast<f32>(source[at+2u]));}
fn pairAdd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=a.x+b.x;let v=s-a.x;let e=(a.x-(s-v))+(b.x-v);let t=e+a.y+b.y;let h=s+t;return vec2<f32>(h,t-(h-s));}
fn difference(a:f32,b:f32)->vec2<f32>{let s=a-b;let v=s-a;return vec2<f32>(s,(a-(s-v))-(b+v));}
fn squarePair(a:f32,b:f32)->vec2<f32>{let d=difference(a,b);let high=d.x*d.x;let low=fma(d.x,d.x,-high)+2.0*d.x*d.y+d.y*d.y;let s=high+low;return vec2<f32>(s,low-(s-high));}
fn weighted(a:f32,b:u32)->vec2<f32>{let product=a*f32(b);return vec2<f32>(product,fma(a,f32(b),-product));}
fn mean(a:vec2<f32>,mass:u32)->f32{let q=a.x/f32(mass);return q+(fma(-q,f32(mass),a.x)+a.y)/f32(mass);}
fn distance(a:vec3<f32>,b:vec3<f32>)->vec4<f32>{return vec4<f32>(squarePair(a.x,b.x),pairAdd(squarePair(a.y,b.y),squarePair(a.z,b.z)));}
fn addDistance(a:vec4<f32>,b:vec4<f32>)->vec4<f32>{return vec4<f32>(pairAdd(a.xy,b.xy),pairAdd(a.zw,b.zw));}
// High+low arithmetic is conservative at a native bin boundary. The bound
// covers the 49 differences/squares and pair reductions without deciding a
// different bin silently; a marked centre is recomputed by the native helper.
fn weight(d:vec2<f32>,offset:u32,count:u32,ambiguous:ptr<function,bool>)->u32{
 var bin=u32(max(0.0,floor(d.x/64.0)));var residue=pairAdd(d,vec2<f32>(-f32(bin)*64.0,0.0));
 if(residue.x+residue.y<0.0&&bin>0u){bin--;residue=pairAdd(residue,vec2<f32>(64.0,0.0));}
 if(residue.x+residue.y>=64.0){bin++;residue=pairAdd(residue,vec2<f32>(-64.0,0.0));}
 if(bin>=count){return 0u;}
 let r=residue.x+residue.y;let error=0.00002+abs(d.x)*0.00000000023283064365386962890625;
 let current=table[offset+bin];
 if(bin>0u&&r<=error&&table[offset+bin-1u]!=current){*ambiguous=true;}
 if((64.0-r)<=error){var next=0u;if(bin+1u<count){next=table[offset+bin+1u];}if(next!=current){*ambiguous=true;}}
 return current;
}
var<workgroup> squared:array<vec4<f32>,196>;
var<workgroup> horizontal:array<vec4<f32>,112>;
@compute @workgroup_size(8,8) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>,@builtin(local_invocation_index) thread:u32){
 let baseX=i32(group.x*8u);let baseY=i32(shape.start+group.y*8u);let x=baseX+i32(local.x);let y=baseY+i32(local.y);let validPixel=x<i32(shape.w)&&y<i32(shape.start+shape.rows);var estimateL=vec2<f32>(0.0);var estimateA=vec2<f32>(0.0);var estimateB=vec2<f32>(0.0);var massL=0u;var massAB=0u;var ambiguous=false;
 for(var dy=-10;dy<=10;dy++){for(var dx=-10;dx<=10;dx++){
  for(var load=thread;load<196u;load+=64u){let sx=baseX+i32(load%14u)-3;let sy=baseY+i32(load/14u)-3;squared[load]=distance(pixel(sx,sy),pixel(sx+dx,sy+dy));}
  workgroupBarrier();
  for(var load=thread;load<112u;load+=64u){let row=load/8u;let col=load%8u;var sum=vec4<f32>(0.0);for(var k=0u;k<7u;k++){sum=addDistance(sum,squared[row*14u+col+k]);}horizontal[load]=sum;}
  workgroupBarrier();
  var d=vec4<f32>(0.0);for(var k=0u;k<7u;k++){d=addDistance(d,horizontal[(local.y+k)*8u+local.x]);}
  if(validPixel){let l=weight(d.xy,0u,shape.taps,&ambiguous);let ab=weight(d.zw,shape.taps,${plan.countAB}u,&ambiguous);let v=pixel(x+dx,y+dy);estimateL=pairAdd(estimateL,weighted(v.x,l));estimateA=pairAdd(estimateA,weighted(v.y,ab));estimateB=pairAdd(estimateB,weighted(v.z,ab));massL+=l;massAB+=ab;}
 }}
 if(validPixel){let at=4u*(u32(y-i32(shape.start))*shape.w+u32(x));output[at]=bitcast<u32>(mean(estimateL,massL));output[at+1u]=bitcast<u32>(mean(estimateA,massAB));output[at+2u]=bitcast<u32>(mean(estimateB,massAB));output[at+3u]=select(0u,0x80000000u,ambiguous);}
}
`;
 return common+(grayscale?gray:color);
}
