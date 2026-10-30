import {requireValue,checkAbort,normalizeResourceError} from '../../src/errors.js';
import {nonlocalOffsets} from './candidates.js';
import {MPS_RANDOM_ALGORITHM} from './random-mps.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
const f=Math.fround;

// Preserves both native tensor calls even if no source offset is local. Only
// the GPU's unused inner words may be skipped; every native index is retained.
export async function nonlocalCandidateTransport({random,transport,pair,side,hooks={},origins}){
 const n=side*side,signal=hooks.signal;
 const cpu=async(source,allocate)=>{
  const next=await nonlocalOffsets(pair,side,source,{...hooks,...(allocate?{allocate}:{})});
  if(origins)for(let i=0;i<n;i++)if(f(f(pair.x[i]*pair.x[i])+f(pair.y[i]*pair.y[i]))<=25){next.x[i]=f(next.x[i]+f(i%side-origins.originalX[i]));next.y[i]=f(next.y[i]+f(Math.floor(i/side)-origins.originalY[i]));}
  return next;
 };
 if(typeof random.reserveSourcePair!=='function'||transport?.nonlocalSourceAlgorithm!==MPS_RANDOM_ALGORITHM)return cpu(random);
 let output;try{output={x:new Float32Array(n),y:new Float32Array(n)};}catch(error){throw normalizeResourceError(error,{requestedBytes:8*n,allocationKind:'array-buffer',allocation:'d2prl-nonlocal-output'});}
 // These are the same returned field arrays already financed by the PM
 // workspace, not an extra retained result allocated inside the GPU provider.
 const ticket=random.reserveSourcePair(n,hooks);let committed=false,hasPrimary=false,primary;
 try{
  const result=await transport.nonlocalOffsets(pair,ticket,side,{signal,output,...origins});
  if(result)requireValue(result===output,'Caller-owned nonlocal output identity');
  else{
   let noise;try{noise=new Float32Array(2*n);}catch(error){throw normalizeResourceError(error,{requestedBytes:8*n,allocationKind:'array-buffer',allocation:'d2prl-nonlocal-fallback-noise'});}
   const arrays=[noise.subarray(0,n),noise.subarray(n)];await ticket.fill(arrays,{signal});let cursor=0,allocation=0;
   const replay={values:async count=>{requireValue(cursor<2&&count===n,'Two native nonlocal tensor calls');return arrays[cursor++];}},allocate=count=>{requireValue(count===n&&allocation<2,'Native nonlocal field allocation');return allocation++===0?output.x:output.y;};
   await cpu(replay,allocate);requireValue(cursor===2&&allocation===2,'Complete nonlocal CPU replay');
  }
  checkAbort(signal);ticket.commit();committed=true;return output;
 }catch(error){hasPrimary=true;primary=error;throw error;}
 finally{if(!committed)try{ticket.rollback();}catch(cleanup){if(hasPrimary)preserveConvolutionPrimary(primary,cleanup);else throw cleanup;}}
}
