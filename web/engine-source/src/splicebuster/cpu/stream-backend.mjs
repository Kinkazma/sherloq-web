/* Global streaming Splicebuster f64 primitives. Original GRIP-UNINA licence. */
import createStreamStatistics from './stream-statistics.mjs';
import {createCpuBackend} from './backend.mjs';
const output=(Type,length)=>({Type,length,byteLength:Type.BYTES_PER_ELEMENT*length});
const fail=message=>Object.assign(new Error(message),{code:'INPUT'});
const typed=(a,Type,n,name)=>{if(!(a instanceof Type)||a.length!==n)throw fail(`${name} must be ${Type.name}[${n}]`);};
function dimensions(d){if(!Number.isInteger(d)||d<1||d>50)throw fail('Invalid dimensions');}
function trainShape(training,d){dimensions(d);if(!(training instanceof Float64Array)||training.length%d)throw fail('Invalid training array');return training.length/d;}
function featureShape(spam,valid,f){
 if(f!==50||!(valid instanceof Uint8Array))throw fail('Expected 50 features and Uint8 validity');
 const n=valid.length;typed(spam,Float32Array,n*f,'spam');let count=0;
 for(const flag of valid){if(flag!==0&&flag!==1)throw fail('Validity must be binary');count+=flag;}
 return {n,count};
}
export function streamMemoryPlan({operation,rows,dimensions:d=25,features:f=50,validRows=rows}={}){
 if(!Number.isSafeInteger(rows)||rows<0||!Number.isSafeInteger(validRows)||validRows<0||validRows>rows)throw fail('Invalid rows');
 let inputBytes=0,outputBytes=0,temporaryBytes=0;
 if(['featureSums','featureCovarianceChunk','projectChunk'].includes(operation)){
  inputBytes=rows*(4*f+1)+8*f*d;
  outputBytes=operation==='projectChunk'?8*(rows+validRows)*d:8*(operation==='featureSums'?f:f*f)+4;
  temporaryBytes=operation==='projectChunk'?8*256*(f+d):8*validRows*f+8*f*f*4;
 }else if(operation==='expectationChunk'){
  inputBytes=8*(rows*d+2*d+d*d);outputBytes=8*(2*rows+3+2*d);
  temporaryBytes=8*rows*(d+2)+8*d*d*12;
 }else if(operation==='covarianceChunk'){
  inputBytes=8*(rows*d+2*rows+d);outputBytes=8*d*d;
  temporaryBytes=8*rows*(d+1)+8*d*d*4;
 }else if(operation==='varianceChunk'||operation==='trainingSums'){
  inputBytes=8*(rows*d+d);outputBytes=8*d;temporaryBytes=operation==='varianceChunk'?8*rows*d:0;
 }else if(['basis','modelUpdate','factorModel','initialModel','initialIndices'].includes(operation)){
  inputBytes=8*(f*f+d*d+4*d);outputBytes=8*(f*d+d*d+4*d);temporaryBytes=8*(f*f+d*d)*12;
 }else throw fail('Unknown streaming CPU operation');
 const heapMaximumBytes=Math.ceil((16*1024**2+1.25*(inputBytes+outputBytes+temporaryBytes))/(16*1024**2))*16*1024**2;
 return {inputBytes,outputBytes,temporaryBytes,heapMaximumBytes};
}

export async function createStreamBackend(options={}){
 return createCpuBackend({...options,moduleFactory:createStreamStatistics,
  wasmURL:options.wasmURL??new URL('./stream-statistics.wasm',import.meta.url),
  extension:({run,invoke})=>({
   initialIndices({nValid,seed=0,replicates=30}){
    if(!Number.isInteger(nValid)||nValid<1||nValid>0x7fffffff||!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(replicates)||replicates<1||replicates>30)throw fail('Invalid RNG parameters');
    return run({}, {indices:output(Uint32Array,replicates)},p=>invoke('_sb_indices',nValid,seed,replicates,p.indices)).indices;
   },
   featureSums({spam,valid,features=50}){
    const {n}=featureShape(spam,valid,features);
    const r=run({spam,valid},{sum:output(Float64Array,features),count:output(Int32Array,1)},p=>invoke('_sb_feature_sums',p.spam,p.valid,n,features,p.sum,p.count));
    return {sum:r.sum,count:r.count[0]};
   },
   featureCovarianceChunk({spam,valid,mean,features=50}){
    const {n}=featureShape(spam,valid,features);typed(mean,Float64Array,features,'mean');
    const r=run({spam,valid,mean},{covarianceSum:output(Float64Array,features*features),count:output(Int32Array,1)},p=>invoke('_sb_feature_covariance',p.spam,p.valid,n,features,p.mean,p.covarianceSum,p.count));
    return {covarianceSum:r.covarianceSum,count:r.count[0]};
   },
   basis({covarianceSum,count,features=50,dimensions:d=25}){
    dimensions(d);typed(covarianceSum,Float64Array,features*features,'covarianceSum');
    if(!Number.isSafeInteger(count)||count<1)throw fail('Invalid global count');
    return run({covarianceSum},{basis:output(Float64Array,features*d)},p=>invoke('_sb_basis',p.covarianceSum,count,features,d,p.basis)).basis;
   },
   projectChunk({spam,valid,basis,features=50,dimensions:d=25}){
    dimensions(d);const {n,count}=featureShape(spam,valid,features);typed(basis,Float64Array,features*d,'basis');
    const r=run({spam,valid,basis},{projected:output(Float64Array,n*d),training:output(Float64Array,count*d),count:output(Int32Array,1)},p=>invoke('_sb_project',p.spam,p.valid,n,features,d,p.basis,p.projected,p.training,p.count));
    if(r.count[0]!==count)throw fail('Training count mismatch');delete r.count;
    return {...r,nAll:n,nValid:count,dimensions:d};
   },
   trainingSums({training,dimensions:d=25}){
    const n=trainShape(training,d);
    const r=run({training},{sum:output(Float64Array,d)},p=>invoke('_sb_training_sums',p.training,n,d,p.sum));
    return {...r,count:n};
   },
   varianceChunk({training,mean,dimensions:d=25}){
    const n=trainShape(training,d);typed(mean,Float64Array,d,'mean');
    const r=run({training,mean},{varianceSum:output(Float64Array,d)},p=>invoke('_sb_training_variance',p.training,n,d,p.mean,p.varianceSum));
    return {...r,count:n};
   },
   initialModel({initialSample,variance,dimensions:d=25}){
    dimensions(d);typed(initialSample,Float64Array,d,'initialSample');typed(variance,Float64Array,d,'variance');
    const r=run({initialSample,variance},{mu:output(Float64Array,2*d),Sigma:output(Float64Array,d*d),info:output(Float64Array,2)},p=>invoke('_sb_initial_model',p.initialSample,p.variance,d,p.mu,p.Sigma,p.info));
    return {mu:r.mu,Sigma:r.Sigma,prioriProb:r.info[0],outliersProb:r.info[1]};
   },
   expectationChunk({training,mu,Sigma,prioriProb,outliersProb,outliersNlogl=42,dimensions:d=25}){
    const n=trainShape(training,d);typed(mu,Float64Array,2*d,'mu');typed(Sigma,Float64Array,d*d,'Sigma');
    if(!Number.isFinite(prioriProb)||prioriProb<0||!Number.isFinite(outliersProb)||outliersProb<0||!Number.isFinite(outliersNlogl))throw fail('Invalid mixture probabilities');
    const r=run({training,mu,Sigma},{posterior:output(Float64Array,2*n),moments:output(Float64Array,3+2*d)},p=>invoke('_sb_expect_chunk',p.training,n,d,p.mu,p.Sigma,prioriProb,outliersProb,outliersNlogl,p.posterior,p.moments));
    return {...r,count:n};
   },
   meanFromMoments({moments,dimensions:d=25}){
    dimensions(d);typed(moments,Float64Array,3+2*d,'moments');if(!(moments[0]>0))throw fail('No inlier population');
    const mu=new Float64Array(2*d);for(let j=0;j<2*d;j++)mu[j]=moments[3+j]/moments[0];return mu;
   },
   covarianceChunk({training,posterior,mean,dimensions:d=25}){
    const n=trainShape(training,d);typed(posterior,Float64Array,2*n,'posterior');typed(mean,Float64Array,d,'mean');
    return run({training,posterior,mean},{covarianceSum:output(Float64Array,d*d)},p=>invoke('_sb_covariance_chunk',p.training,p.posterior,n,d,p.mean,p.covarianceSum));
   },
   modelUpdate({covarianceSum,moments,dimensions:d=25}){
    dimensions(d);typed(covarianceSum,Float64Array,d*d,'covarianceSum');typed(moments,Float64Array,3+2*d,'moments');
    if(!(moments[0]>0)||!(moments[1]>=0))throw fail('Invalid global population');
    const mu=new Float64Array(2*d);for(let j=0;j<2*d;j++)mu[j]=moments[3+j]/moments[0];
    const r=run({covarianceSum},{Sigma:output(Float64Array,d*d),info:output(Float64Array,2)},p=>invoke('_sb_model_update',p.covarianceSum,d,moments[0],moments[1],p.Sigma,p.info));
    return {mu,Sigma:r.Sigma,prioriProb:r.info[0],outliersProb:r.info[1]};
   },
   factorModel({Sigma,dimensions:d=25}){
    dimensions(d);typed(Sigma,Float64Array,d*d,'Sigma');
    const r=run({Sigma},{lower:output(Float64Array,d*d),logdet:output(Float64Array,1)},p=>invoke('_sb_factor',p.Sigma,d,p.lower,p.logdet));
    return {lower:r.lower,logdet:r.logdet[0]};
   },
  }),
 });
}
