import "../../runtime-context.js?v=0.30.0";
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
