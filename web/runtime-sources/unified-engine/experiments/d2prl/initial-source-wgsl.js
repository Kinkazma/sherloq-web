import {MPS_PHILOX_CORE_WGSL} from './random-philox-wgsl.js';
// Same four-word producer shape as the original GPU fill. This consumer writes
// its two offset planes and four native integer bounds directly into a 6N state.
const INITIAL_BODY_WGSL=String.raw`
struct InitialSources{counterX:vec4<u32>,counterY:vec4<u32>,key:vec2<u32>,side:u32,count:u32};
@group(0) @binding(0) var<uniform> initial:InitialSources;
@group(0) @binding(1) var<storage,read_write> state:array<f32>;
fn initialRoundedAdd(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn initialNegativeCoordinate(x:f32)->f32{return bitcast<f32>(bitcast<u32>(x)^0x80000000u);}
fn initialOffset(word:u32,coordinate:f32)->f32{
 let u=f32(word&0x7fffffu)*0.00000011920928955078125;
 let scaled=f32(initial.side)*u;return initialRoundedAdd(initialNegativeCoordinate(coordinate),scaled);
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let first=id.x*4u;if(first>=initial.count){return;}
 let wx=mpsPhiloxBlock(initial.counterX,initial.key,id.x);
 let wy=mpsPhiloxBlock(initial.counterY,initial.key,id.x);
 for(var lane=0u;lane<4u;lane++){
  let i=first+lane;if(i>=initial.count){break;}
  let x=f32(i%initial.side);let y=f32(i/initial.side);
  state[i]=initialOffset(wx[lane],x);state[initial.count+i]=initialOffset(wy[lane],y);
  // CPU -0 is observable in the initial min planes. Unary minus preserves it.
  state[2u*initial.count+i]=initialNegativeCoordinate(x);state[3u*initial.count+i]=f32(initial.side-(i%initial.side)-1u);
  state[4u*initial.count+i]=initialNegativeCoordinate(y);state[5u*initial.count+i]=f32(initial.side-(i/initial.side)-1u);
 }
}
`;

// Resource declarations and entry name alone change when reusing the current
// candidate module. The mathematical body and its two f32 rounding steps do not.
export const INITIAL_SOURCE_WGSL=MPS_PHILOX_CORE_WGSL+INITIAL_BODY_WGSL;
export const INITIAL_CONSUMER_WGSL=INITIAL_BODY_WGSL
 .replace('@group(0) @binding(0) var<uniform> initial:', '@group(0) @binding(5) var<uniform> initial:')
 .replace('@group(0) @binding(1) var<storage,read_write> state:', '@group(0) @binding(6) var<storage,read_write> state:')
 .replace('fn main(', 'fn initialSourceMain(');
