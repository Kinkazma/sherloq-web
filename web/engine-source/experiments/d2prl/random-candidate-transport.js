import {requireValue,checkAbort,normalizeResourceError} from '../../src/errors.js';
import {randomCandidates} from './candidates.js';
import {MPS_RANDOM_ALGORITHM} from './random-mps.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';

// The caller's PM workspace already finances the old noise array. On the
// admitted path no array is made; CPU fallback materializes this exact ticket.
export async function randomCandidateTransport({random,transport,pair,bounds,side,hooks={},transportOptions={},wrap}){
 const count=2*side*side,signal=hooks.signal;
 const replay=async noise=>{let supplied=false;const source={values:async requested=>{requireValue(!supplied&&requested===noise.length,'Random candidate replay extent');supplied=true;return noise;}};return wrap(await randomCandidates(pair,bounds,side,source,hooks));};
 if(typeof random.reserveSource!=='function'||transport.randomSourceAlgorithm!==MPS_RANDOM_ALGORITHM){
  const noise=await random.values(count,hooks),result=await transport.randomAndWrap(pair,bounds,noise,side,transportOptions);return result??replay(noise);
 }
 const ticket=random.reserveSource(count,hooks);let committed=false,result;
 try{
  result=await transport.randomAndWrap(pair,bounds,ticket,side,transportOptions);
  if(!result){let noise;try{noise=new Float32Array(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation:'d2prl-candidate-source-fallback'});}await ticket.fill(noise,{signal});result=await replay(noise);}
  checkAbort(signal);ticket.commit();committed=true;return result;
 }catch(error){if(result)try{result.release?.();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
 finally{if(!committed)ticket.rollback();}
}
