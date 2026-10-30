import "../../runtime-context.js?v=0.30.0";
// Private transport/threshold-filter prototype. Source constants are the exact
// frozen native cosine table converted once to f32; all ambiguous tests refine
// in the unchanged original f64/FMA order. No model or threshold is adjusted.
export function zeroVoteShaders(cosines){
 if(!Array.isArray(cosines)||cosines.length!==64||cosines.some(x=>!Number.isFinite(x)))throw Error('Frozen64cosines required');
 const table='const COS:array<f32,64>=array<f32,64>('+cosines.map(x=>Math.fround(x).toExponential(9)).join(',')+');';
 const params=`struct P{width:u32,height:u32,n:u32,pad:u32};@group(0) @binding(0)var<uniform> p:P;`;
 const blocks=table+params+`
 @group(0) @binding(1)var<storage,read> luma:array<u32>;
 @group(0) @binding(2)var<storage,read_write> codes:array<u32>;
 @group(0) @binding(3)var<storage,read_write> low:array<u32>;
 @group(0) @binding(4)var<storage,read_write> high:array<u32>;
 var<workgroup> partial:array<f32,256>;
 var<workgroup> centers:array<f32,4>;
 var<workgroup> radii:array<f32,4>;
 var<workgroup> constantFlags:array<u32,4>;
 var<workgroup> constantBoth:array<u32,4>;
 var<workgroup> zeros:array<u32,256>;
 var<workgroup> ambiguousLow:array<atomic<u32>,4>;
 var<workgroup> ambiguousHigh:array<atomic<u32>,4>;
 fn pixel(x:u32,y:u32)->f32{let i=y*p.width+x;return f32((luma[i>>2u]>>((i&3u)*8u))&255u);}
 @compute @workgroup_size(256) fn main(@builtin(workgroup_id) wg:vec3u,@builtin(local_invocation_index) local:u32){
  let b=local>>6u;let lane=local&63u;let x=wg.x*4u+b;let y=wg.y;let valid=x+7u<p.width&&y+7u<p.height;
  if(lane==0u){atomicStore(&ambiguousLow[b],0u);atomicStore(&ambiguousHigh[b],0u);centers[b]=0.0;radii[b]=0.0;constantFlags[b]=0u;constantBoth[b]=0u;
   if(valid){var minimum=255.0;var maximum=0.0;var cx=true;var cy=true;
    for(var xx=0u;xx<8u;xx++){for(var yy=0u;yy<8u;yy++){let v=pixel(x+xx,y+yy);minimum=min(minimum,v);maximum=max(maximum,v);if(cx&&v!=pixel(x,y+yy)){cx=false;}if(cy&&v!=pixel(x+xx,y)){cy=false;}}}
    let center=floor((minimum+maximum)*0.5);centers[b]=center;radii[b]=max(maximum-center,center-minimum);constantFlags[b]=select(0u,128u,cx||cy);constantBoth[b]=select(0u,1u,cx&&cy);
   }
  }zeros[local]=0u;workgroupBarrier();
  let i=lane>>3u;let j=lane&7u;var value=0.0;
  if(valid){for(var xx=0u;xx<8u;xx++){value=fma(pixel(x+xx,y+j)-centers[b],COS[xx*8u+i],value);}}
  partial[local]=value;workgroupBarrier();
  if(valid&&lane!=0u){var d=0.0;for(var yy=0u;yy<8u;yy++){d=fma(partial[b*64u+i*8u+yy],COS[yy*8u+j],d);}
   var scale=0.25;if(i==0u){scale*=0.7071067811865476;}if(j==0u){scale*=0.7071067811865476;}d*=scale;
   // Conservative f32 forward error bound <0.025 for native RGB8 luminance,
   // including two operations per fma and directed correct rounding.
   // Near threshold no classification is emitted; the native oracle decides.
   if(abs(abs(d)-0.5)<=0.025*radii[b]/255.0+2e-8){if(lane<32u){atomicOr(&ambiguousLow[b],1u<<lane);}else{atomicOr(&ambiguousHigh[b],1u<<(lane-32u));}}
   else if(abs(d)<0.5){zeros[local]=1u;}
  }workgroupBarrier();
  if(valid&&lane==0u){var z=0u;for(var k=1u;k<64u;k++){z+=zeros[b*64u+k];}
   let at=y*p.width+x;if(constantBoth[b]!=0u){codes[at]=191u;low[at]=0u;high[at]=0u;}else{codes[at]=z|constantFlags[b];low[at]=atomicLoad(&ambiguousLow[b]);high[at]=atomicLoad(&ambiguousHigh[b]);}
  }
 }`;
 const votes=params+`
 @group(0) @binding(1)var<storage,read> codes:array<u32>;
 @group(0) @binding(2)var<storage,read_write> result:array<u32>;
 fn vote(pixel:u32)->u32{if(pixel>=p.n){return 255u;}let x=pixel%p.width;let y=pixel/p.width;if(x<7u||y<7u||x+7u>=p.width||y+7u>=p.height){return 255u;}
  var winner=255u;var maximum=0u;var ties=0u;
  for(var xx=x-7u;xx<=x;xx++){for(var yy=y-7u;yy<=y;yy++){let code=codes[yy*p.width+xx];let z=code&127u;if(z==maximum){ties++;}if(z>maximum){maximum=z;ties=1u;winner=select((xx&7u)+((yy&7u)*8u),255u,(code&128u)!=0u);}}}
  return select(255u,winner,ties==1u);
 }
 @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid:vec3u){let word=gid.x+gid.y*65536u;let i=word*4u;if(i>=p.n){return;}result[word]=vote(i)|(vote(i+1u)<<8u)|(vote(i+2u)<<16u)|(vote(i+3u)<<24u);}`;
 return{blocks,votes,guard:0.025,centered:true};
}
