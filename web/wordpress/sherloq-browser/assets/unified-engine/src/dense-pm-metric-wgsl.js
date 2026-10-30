import "../../runtime-context.js?v=0.30.0";
import {densePmSmallBlockedWgsl} from './dense-pm-wgsl.js';
// Unsigned two-limb products/sums preserve the native geometric predicate on
// the qualified half-pixel axes. Descriptor arithmetic is byte-for-byte the
// existing shader; only permitted() and its coordinate transport differ.
export function densePmMetricWgsl(dimensions,mode='pixel'){
 const source=densePmSmallBlockedWgsl(dimensions);if(mode==='pixel')return source;
 if(mode!=='half')throw Error('Unknown native dense geometry mode');
 const start=source.indexOf('fn permitted('),end=source.indexOf('fn offer(',start);
 if(start<0||end<0)throw Error('Native dense geometric predicate boundary missing');
 const code=source.slice(0,start)+String.raw`
fn squareU64(value:u32)->vec2u{
 let low=value&65535u;let high=value>>16u;let base=low*low;let cross=2u*low*high;let lower=base+(cross<<16u);let upper=high*high+(cross>>16u)+select(0u,1u,lower<base);return vec2u(lower,upper);
}
fn addU64(a:vec2u,b:vec2u)->vec2u{let lower=a.x+b.x;return vec2u(lower,a.y+b.y+select(0u,1u,lower<a.x));}
fn geU64(a:vec2u,b:vec2u)->bool{return a.y>b.y||(a.y==b.y&&a.x>=b.x);}
fn permitted(i:u32,j:i32)->bool{
 let n=p.a.x*p.a.y;if(j<0||u32(j)>=n||i==u32(j)){return false;}
 let mi=packed[i];let mj=packed[u32(j)];if(mi==0u||mj==0u){return false;}
 if(p.d.x!=0u&&!(((mi&1u)!=0u&&(mj&2u)!=0u)||((mi&2u)!=0u&&(mj&1u)!=0u))){return false;}
 var dx=bitcast<i32>(packed[p.g.x+i%p.a.x])-bitcast<i32>(packed[p.g.x+u32(j)%p.a.x]);
 var dy=bitcast<i32>(packed[p.g.y+i/p.a.x])-bitcast<i32>(packed[p.g.y+u32(j)/p.a.x]);
 if(p.d.x!=0u){let sign=select(-1,1,(mi&1u)!=0u&&(mj&2u)!=0u);dx+=sign*bitcast<i32>(p.f.z);dy+=sign*bitcast<i32>(p.f.w);}
 let squared=addU64(squareU64(u32(abs(dx))),squareU64(u32(abs(dy))));
 return geU64(squared,vec2u(p.d.y,p.f.x))&&geU64(vec2u(p.d.z,p.f.y),squared);
}
`+source.slice(end);
 return code.replace('struct Params {a:vec4u,b:vec4u,c:vec4u,d:vec4u};','struct Params {a:vec4u,b:vec4u,c:vec4u,d:vec4u,e:vec4u,f:vec4u,g:vec4u};');
}
