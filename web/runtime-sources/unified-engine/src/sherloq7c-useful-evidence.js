import "../../runtime-context.js?v=0.31.0";
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';

const positive=v=>Number.isFinite(v)&&v>0;
const halfQuantum=.5/65535;
function acknowledgedGpu(target){
 const g=target?.gpu;
 return target?.cacheHit===false&&target.converged===true&&target.actualGPUWork===true&&g?.backend==='webgpu-target-pdhg-f32'&&g.role==='initializer-only'&&positive(g.submittedBatches)&&positive(g.completedReadbacks)&&g.submittedBatches===g.completedReadbacks&&g.completedReadbacks===g.readbacks&&g.completedAfterAck===true;
}

// The caller is index.js's existing after-public-run ACK wrapper. These facts
// do not retire resources, infer GPU from a request, or run a capability probe.
export function sherloq7cUsefulFacts(owner,answer){
 if(!owner||owner.operation!=='inspection.sherloq7c'||answer?.operation!==owner.operation||answer.status!=='ok')return null;
 const m=answer.metrics??{},p=owner.parameters??{},targets=m.targets??[];
 if(m.approximate===true||m.strictPrecisionMet===false||m.effectiveComputationMode==='fast')return null;
 if(!Array.isArray(targets)||m.workingBitDepth!==16||m.workingPrecision!=='float64'||m.requestedPrecision!==p.precision||!Number.isFinite(m.maxErrorBoundFloat)||m.maxErrorBoundFloat<0||!Number.isFinite(m.maxErrorBoundRGB16)||m.maxErrorBoundRGB16<m.maxErrorBoundFloat||m.maxErrorBoundRGB16>m.maxErrorBoundFloat+halfQuantum+1e-15)return null;
 if(p.precision!=='reference'&&(!['1e-7','1e-4','1e-2'].includes(p.precision)||m.maxErrorBoundFloat>Number(p.precision)))return null;
 if(answer.provenance?.originalSha256!==owner.resourceContext?.originalSha256||m.memory?.budgetBytes!==owner.budgetBytes)return null;
 const attempted=targets.filter(t=>t.cacheHit===false&&t.actualGPUWork===true);
 if(attempted.some(t=>!acknowledgedGpu(t)))return null;
 const accepted=attempted.filter(t=>t.gpuInitializerAccepted===true);
 if(!!m.actualGPUWork!==(attempted.length>0)||!!m.actualUsefulGPUWork!==(accepted.length>0)||m.actualBackend!==(accepted.length?'hybrid':'cpu'))return null;
 if(accepted.length&&owner.numericAdmissible?.webgpu!==true)return null;
 // One target with an existing nonzero-micro base is partial analysis even
 // when that target itself had to be recomputed after cache eviction.
 const retainedBase=p.revelation<100&&p.micro!==0&&targets.length===1&&m.projection!=null;
 const partial=m.cache==='hit'||retainedBase||targets.some(t=>t.cacheHit===true);
 const discarded=attempted.length>0&&!accepted.length;
 const resourceContext=discarded?{...owner.resourceContext,attemptedGpuWork:true,contributedGpuWork:false}:owner.resourceContext;
 return {backend:m.actualBackend,cpu:true,gpu:accepted.length>0,cache:partial?'partial':'miss',resourceContext};
}

export function sherloq7cUsefulEvidence(owner,answer){const facts=sherloq7cUsefulFacts(owner,answer);return facts?createUsefulOperationEvidence({...owner,resourceContext:facts.resourceContext,actualBackend:facts.backend,actualCpuWork:facts.cpu,actualGpuWork:facts.gpu,completedAfterAck:true,numericAdmissible:true,cache:facts.cache}):null;}
