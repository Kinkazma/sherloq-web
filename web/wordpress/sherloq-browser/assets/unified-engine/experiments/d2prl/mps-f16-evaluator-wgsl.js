import {D2PRL_EVALUATOR_WGSL,specializeEvaluatorShader} from './evaluator-gpu-kernel.js';
// Same portable transform already qualified by the development operator/PM
// witnesses. All reductions, f32 FMA, exp, order and tie-breaks remain shared.
export function mpsF16EvaluatorShader(channels){
 if(channels!==36&&channels!==96)throw new TypeError('Native MPS descriptor channels');
 let source=D2PRL_EVALUATOR_WGSL;
 const replacements=[
  ['fn fromSource(index:u32)->f32 {','fn fromSourceHalf(index:u32)->f16 {return f16(fromSource(index));}\nfn fromSource(index:u32)->f32 {'],
  ['var values:array<f32,96>;','var values:array<f16,96>;'],
  ['values[c]=half(sum);','values[c]=f16(half(sum));'],
  ['let magnitude=abs(half(fromSource(c*n+index)-values[other]));','let magnitude=f32(abs(fromSourceHalf(c*n+index)-values[other]));']
 ];
 for(const[before,after]of replacements){if(source.split(before).length!==2)throw new TypeError('Pinned shared evaluator transform differs');source=source.replace(before,after);}
 return 'enable f16;\n'+specializeEvaluatorShader(source,{channels,arithmetic:'mps'}).replace('var values:array<f16,96>;','var values:array<f16,'+channels+'>;');
}
