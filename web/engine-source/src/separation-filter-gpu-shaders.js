// Physical parallelization of the existing native separation kernels.
// Colour transforms/coefficient construction remain in the pinned CPU helper.
const shared=String.raw`
struct Shape{w:u32,h:u32,start:u32,rows:u32,observed:u32,originX:u32,nativeWidth:u32,taps:u32};
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> shape:Shape;
@group(0) @binding(3) var<storage,read> table:array<u32>;
@group(0) @binding(4) var<storage,read> membership:array<u32>;
@group(0) @binding(5) var<storage,read_write> scratch:array<u32>;
fn border(v:i32,n:u32,replicate:bool)->u32{if(replicate){return u32(clamp(v,0,i32(n)-1));}if(n==1u){return 0u;}let period=2*i32(n)-2;let r=((v%period)+period)%period;return u32(select(period-r,r,r<i32(n)));}
fn at(x:i32,y:i32,replicate:bool)->u32{return border(y,shape.h,replicate)*shape.w+border(x,shape.w,replicate);}
fn admitted(i:u32)->bool{return shape.observed==0u||((membership[i>>2u]>>((i&3u)*8u))&255u)==1u;}
fn component(v:u32,c:u32)->u32{return(v>>(c*8u))&255u;}
fn roundedAdd(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn divide(a:f32,b:f32)->f32{let q=a/b;return roundedAdd(q,fma(-q,b,a)/b);}
fn byteRound(v:f32)->u32{let x=clamp(v,0.0,255.0);let q=u32(floor(x));let r=x-f32(q);return q+u32(r>0.5||(r==0.5&&(q&1u)!=0u));}
fn integerRound(sum:u32,count:u32)->u32{let q=sum/count;let r=sum%count;return q+u32(2u*r>count||(2u*r==count&&(q&1u)!=0u));}
`;
export function separationFilterShader({mode,radius,grayscale,pass='main',sampleDepth=8}){
 if(![0,1,2,3].includes(mode)||!Number.isInteger(radius)||radius<1||radius>10)throw new TypeError('Exact separation GPU geometry required');
 if(sampleDepth===16)return native16SeparationShader({mode,radius,grayscale,pass});
 if(sampleDepth!==8)throw new TypeError('Exact separation sample depth required');
 const C=grayscale?1:3,R=radius,K=2*R+1;
 if(mode===1&&pass==='horizontal')return shared+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.w*shape.h){return;}let x=i%shape.w;let y=i/shape.w;
 for(var c=0u;c<${C}u;c++){var sum=0u;for(var k=0u;k<${K}u;k++){sum+=component(source[at(i32(x)+i32(k)-${R},i32(y),false)],c)*table[k];}scratch[i*${C}u+c]=sum;}}
 `;
 if(mode===1)return shared+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;var packed=0u;
 for(var c=0u;c<${C}u;c++){var sum=0u;for(var k=0u;k<${K}u;k++){sum+=scratch[at(i32(x),i32(y)+i32(k)-${R},false)*${C}u+c]*table[k];}packed|=((sum+32768u)>>16u)<<(8u*c);}output[p]=packed;}
 `;
 if(mode===0){const median=R<=2?String.raw`
 var values:array<u32,${K*K}>;var count=0u;
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){let index=at(i32(x)+dx,i32(y)+dy,true);if(!admitted(index)){continue;}let v=component(source[index],c);var k=count;loop{if(k==0u){break;}if(values[k-1u]<=v){break;}values[k]=values[k-1u];k--; }values[k]=v;count++;}}
 let value=values[count/2u];
 `:String.raw`
 var histogram:array<u32,256>;var count=0u;for(var j=0u;j<256u;j++){histogram[j]=0u;}
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){let index=at(i32(x)+dx,i32(y)+dy,true);if(admitted(index)){histogram[component(source[index],c)]++;count++;}}}
 var mass=0u;var value=0u;for(var j=0u;j<256u;j++){mass+=histogram[j];if(mass>count/2u){value=j;break;}}
 `;
 return shared+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;if(!admitted(y*shape.w+x)){output[p]=0u;return;}var packed=0u;
 for(var c=0u;c<${C}u;c++){${median}packed|=value<<(8u*c);}output[p]=packed;}
 `;}
 if(mode===2)return shared+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;if(!admitted(y*shape.w+x)){output[p]=0u;return;}var count=0u;var sum=vec3<u32>(0u);
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){let index=at(i32(x)+dx,i32(y)+dy,false);if(admitted(index)){let v=source[index];sum+=vec3<u32>(v&255u,(v>>8u)&255u,(v>>16u)&255u);count++;}}}
 var packed=0u;for(var c=0u;c<${C}u;c++){packed|=integerRound(sum[c],count)<<(8u*c);}output[p]=packed;}
 `;
 return shared+String.raw`
 var<private> repair:bool;
 struct Weighted{weight:f32,pixel:vec3<f32>,products:vec3<f32>};
 fn weighted(k:u32,x:u32,y:u32,centre:u32)->Weighted{let dx=bitcast<i32>(table[4u*k]);let dy=bitcast<i32>(table[4u*k+1u]);let index=at(i32(x)+dx,i32(y)+dy,false);if(!admitted(index)){return Weighted(0.0,vec3<f32>(0.0),vec3<f32>(0.0));}let pixel=source[index];var distance=0u;for(var c=0u;c<${C}u;c++){distance+=u32(abs(i32(component(pixel,c))-i32(component(centre,c))));}
 let sb=table[4u*k+2u];let cb=table[4u*shape.taps+distance];
 if((sb&0x7fffffffu)!=0u&&(cb&0x7fffffffu)!=0u){let se=i32((sb>>23u)&255u)-127;let ce=i32((cb>>23u)&255u)-127;if(se==-127||ce==-127||se+ce< -126){repair=true;}}
 let weight=bitcast<f32>(sb)*bitcast<f32>(cb);let value=vec3<f32>(f32(pixel&255u),f32((pixel>>8u)&255u),f32((pixel>>16u)&255u));return Weighted(weight,value,value*weight);}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;if(!admitted(y*shape.w+x)){output[p]=0u;return;}repair=false;let centre=source[y*shape.w+x];var mass=0.0;var sum=vec3<f32>(0.0);var k=0u;
 if(x+shape.originX>=shape.nativeWidth/${grayscale?4:16}u*${grayscale?4:16}u){for(;k+3u<shape.taps;k+=4u){let a=weighted(k,x,y,centre);let b=weighted(k+1u,x,y,centre);let c=weighted(k+2u,x,y,centre);let d=weighted(k+3u,x,y,centre);mass=roundedAdd(mass,roundedAdd(roundedAdd(a.weight,b.weight),roundedAdd(c.weight,d.weight)));for(var axis=0u;axis<${C}u;axis++){sum[axis]=roundedAdd(sum[axis],roundedAdd(roundedAdd(a.products[axis],b.products[axis]),roundedAdd(c.products[axis],d.products[axis])));}}}
 for(;k<shape.taps;k++){let v=weighted(k,x,y,centre);mass=roundedAdd(mass,v.weight);sum=fma(v.pixel,vec3<f32>(v.weight),sum);}
 let inverse=divide(1.0,mass);var packed=0u;for(var c=0u;c<${C}u;c++){let v=${grayscale?'divide(sum[c],mass)':'sum[c]*inverse'};if(abs((v-floor(v))-0.5)<0.0002){repair=true;}packed|=byteRound(v)<<(8u*c);}output[p]=packed|select(0u,0x80000000u,repair);}
 `;
}

// The same separable filter layout handles16-bit codes. Horizontal Gaussian
// sums fit u32; products and vertical sums use two u32 words, never f32.
function native16SeparationShader({mode,radius,grayscale,pass}){
 if(mode===0)return native16MedianShader({radius,grayscale});
 if(mode===3)return native16BilateralShader({radius,grayscale});
 if(![1,2].includes(mode))throw new TypeError('Native16 GPU separation mode unavailable');
 const C=grayscale?1:3,R=radius,K=2*R+1;
 const helpers=String.raw`
 fn component16(i:u32,c:u32)->u32{let v=source[2u*i+c/2u];return(v>>((c&1u)*16u))&65535u;}
 fn multiply48(a:u32,b:u32)->vec2<u32>{let lowProduct=(a&65535u)*b;let highProduct=(a>>16u)*b;let low=lowProduct+(highProduct<<16u);return vec2<u32>(low,(highProduct>>16u)+u32(low<lowProduct));}
 fn add48(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{let low=a.x+b.x;return vec2<u32>(low,a.y+b.y+u32(low<a.x));}
 fn rounded48(a:vec2<u32>)->u32{let low=a.x+2147483648u;return a.y+u32(low<a.x);}
 `;
 if(pass==='horizontal')return shared+helpers+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.w*shape.h){return;}let x=i%shape.w;let y=i/shape.w;
 for(var c=0u;c<${C}u;c++){var sum=0u;for(var k=0u;k<${K}u;k++){sum+=component16(at(i32(x)+i32(k)-${R},i32(y),false),c)${mode===1?'*table[k]':''};}scratch[i*${C}u+c]=sum;}}
 `;
 return shared+helpers+String.raw`
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;var values=vec3<u32>(0u);
 for(var c=0u;c<${C}u;c++){${mode===1?String.raw`var sum=vec2<u32>(0u);for(var k=0u;k<${K}u;k++){sum=add48(sum,multiply48(scratch[at(i32(x),i32(y)+i32(k)-${R},false)*${C}u+c],table[k]));}values[c]=rounded48(sum);`:String.raw`var sum=0u;for(var k=0u;k<${K}u;k++){sum+=scratch[at(i32(x),i32(y)+i32(k)-${R},false)*${C}u+c];}values[c]=integerRound(sum,${K*K}u);`}}
 ${grayscale?'values=vec3<u32>(values.x);':''}output[2u*p]=values.x|(values.y<<16u);output[2u*p+1u]=values.z;}
 `;
}

// Internal native16 Gaussian capability for adjustment sharpening. The public
// separation entry above remains radius1..10, byte-identical for old callers.
export function native16AdjustmentGaussianShader({radius,pass='main'}){
 if(!Number.isInteger(radius)||radius<1||radius>25||!['main','horizontal'].includes(pass))throw new TypeError('Native16 adjustment Gaussian geometry required');
 return native16SeparationShader({mode:1,radius,grayscale:false,pass});
}

// Exact order statistics on native codes. The coarse histogram is reused for
// the selected low-byte bucket; never allocate65536 bins per GPU invocation.
function native16MedianShader({radius:R,grayscale}){
 const C=grayscale?1:3,K=2*R+1,select=R<=2?String.raw`
 var values:array<u32,${K*K}>;var count=0u;
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){let v=component16(at(i32(x)+dx,i32(y)+dy,true),c);var k=count;loop{if(k==0u){break;}if(values[k-1u]<=v){break;}values[k]=values[k-1u];k--;}values[k]=v;count++;}}
 let value=values[count/2u];
 `:String.raw`
 var histogram:array<u32,256>;for(var j=0u;j<256u;j++){histogram[j]=0u;}
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){histogram[component16(at(i32(x)+dx,i32(y)+dy,true),c)>>8u]++;}}
 var mass=0u;var bucket=0u;let middle=${Math.floor(K*K/2)}u;
 for(var j=0u;j<256u;j++){if(mass+histogram[j]>middle){bucket=j;break;}mass+=histogram[j];}
 for(var j=0u;j<256u;j++){histogram[j]=0u;}
 for(var dy=-${R};dy<=${R};dy++){for(var dx=-${R};dx<=${R};dx++){let v=component16(at(i32(x)+dx,i32(y)+dy,true),c);if((v>>8u)==bucket){histogram[v&255u]++;}}}
 var lower=0u;for(var j=0u;j<256u;j++){mass+=histogram[j];if(mass>middle){lower=j;break;}}
 let value=(bucket<<8u)|lower;
 `;
 return shared+String.raw`
 fn component16(i:u32,c:u32)->u32{return(source[2u*i+c/2u]>>((c&1u)*16u))&65535u;}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;var valuesOut=vec3<u32>(0u);
 for(var c=0u;c<${C}u;c++){${select}valuesOut[c]=value;}
 ${grayscale?'valuesOut=vec3<u32>(valuesOut.x);':''}output[2u*p]=valuesOut.x|(valuesOut.y<<16u);output[2u*p+1u]=valuesOut.z;}
 `;
}
function native16BilateralShader({radius:R,grayscale}){
 const C=grayscale?1:3;
 return shared+String.raw`
 fn component16(i:u32,c:u32)->u32{return(source[2u*i+c/2u]>>((c&1u)*16u))&65535u;}
 fn codeRound(v:f32)->u32{let x=clamp(v,0.0,65535.0);let q=u32(floor(x));let r=x-f32(q);return q+u32(r>0.5||(r==0.5&&(q&1u)!=0u));}
 var<private> repair:bool;
 struct Weighted16{weight:f32,pixel:vec3<f32>,products:vec3<f32>};
 fn weighted16(k:u32,x:u32,y:u32,centre:u32)->Weighted16{let dx=bitcast<i32>(table[4u*k]);let dy=bitcast<i32>(table[4u*k+1u]);let index=at(i32(x)+dx,i32(y)+dy,false);var distance=0u;var v=vec3<f32>(0.0);for(var c=0u;c<${C}u;c++){let code=component16(index,c);v[c]=f32(code);distance+=u32(abs(i32(code)-i32(component16(centre,c))));}
 let sb=table[4u*k+2u];let cb=table[4u*shape.taps+distance];if((sb&0x7fffffffu)!=0u&&(cb&0x7fffffffu)!=0u){let se=i32((sb>>23u)&255u)-127;let ce=i32((cb>>23u)&255u)-127;if(se==-127||ce==-127||se+ce< -126){repair=true;}}
 let weight=bitcast<f32>(sb)*bitcast<f32>(cb);return Weighted16(weight,v,v*weight);}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){let p=id.x;if(p>=shape.w*shape.rows){return;}let x=p%shape.w;let y=shape.start+p/shape.w;let centre=y*shape.w+x;repair=false;var mass=0.0;var sum=vec3<f32>(0.0);var k=0u;
 if(x+shape.originX>=shape.nativeWidth/${grayscale?4:16}u*${grayscale?4:16}u){for(;k+3u<shape.taps;k+=4u){let a=weighted16(k,x,y,centre);let b=weighted16(k+1u,x,y,centre);let c=weighted16(k+2u,x,y,centre);let d=weighted16(k+3u,x,y,centre);mass=roundedAdd(mass,roundedAdd(roundedAdd(a.weight,b.weight),roundedAdd(c.weight,d.weight)));for(var axis=0u;axis<${C}u;axis++){sum[axis]=roundedAdd(sum[axis],roundedAdd(roundedAdd(a.products[axis],b.products[axis]),roundedAdd(c.products[axis],d.products[axis])));}}}
 for(;k<shape.taps;k++){let v=weighted16(k,x,y,centre);mass=roundedAdd(mass,v.weight);sum=fma(v.pixel,vec3<f32>(v.weight),sum);}
 let inverse=divide(1.0,mass);var codes=vec3<u32>(0u);for(var c=0u;c<${C}u;c++){let value=${grayscale?'divide(sum[c],mass)':'sum[c]*inverse'};if(abs((value-floor(value))-0.5)<0.0002){repair=true;}codes[c]=codeRound(value);}
 ${grayscale?'codes=vec3<u32>(codes.x);':''}output[2u*p]=codes.x|(codes.y<<16u);output[2u*p+1u]=codes.z|select(0u,0x80000000u,repair);}
 `;
}
