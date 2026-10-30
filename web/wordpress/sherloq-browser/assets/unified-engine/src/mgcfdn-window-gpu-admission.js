import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue} from './errors.js';

const MiB=1048576n,LEGACY=512n*MiB;
// ORT1.30 shipped bounded-cache allocator: bucket SIZES are unchanged.
const BUCKETS=[64,128,256,512,2048,4096,8192,16384,32768,65536,131072,262144,524288,1048576,2097152,4194304,8388608,12582912,16777216,26214400,33554432,44236800,58982400,67108864,134217728,167772160].map(BigInt);
const exact=n=>{requireValue(n>=0n&&n<=BigInt(Number.MAX_SAFE_INTEGER),'MGCFDN GPU admission exceeds exact integer range');return Number(n);};
const align=n=>(n+15n)/16n*16n;
const bucket=n=>BUCKETS.find(v=>v>=n)??align(n);

/** Metadata only; no buffers, model, GPU device, session or pixels allocated.
 * Frozen consistency graph c5741f98...: 20 M² outputs; its nonterminal-axis
 * Softmax adds two M² transposes/intermediates in the shipped ORT kernel.
 * Count all 22 allocations without assuming any intermediate queue ACK, plus
 * both M² readbacks (native WASM TopK and final output). This deliberately
 * exceeds live-tensor liveness and also covers submitted, not-yet-ACKed buffers.
 * Other variable stages are only five pool nodes and one attention MatMul;
 * their inputs/outputs are dominated by this envelope. Fixed spatial/encoder
 * stages retain the already received 512MiB envelope.
 */
export function planMgcfdnWindowGpuAdmission(featureCells){
 requireValue(Number.isSafeInteger(featureCells)&&featureCells>=1600&&featureCells%1600===0,'Admitted M=1600F required before GPU allocation');
 const M=BigInt(featureCells),matrix=4n*M*M;
 const terms={graphMatrixOutputs:20n*bucket(matrix),softmaxTransposeTemporaries:2n*bucket(matrix),matrixReadbacks:2n*align(matrix),normalizedInputs:2n*bucket(4n*640n*M),coordinateInputs:4n*bucket(4n*M),topkValuesAndIndices:bucket(4n*40n*M)+bucket(8n*40n*M),reductionOutputs:2n*bucket(4n*M),scalarInitializersAndOutputs:20n*64n,programUniforms:48n*2048n,bothBoundedIdlePools:65590528n};
 const sum=Object.values(terms).reduce((a,b)=>a+b,0n),rounded=(sum+MiB-1n)/MiB*MiB;
 // M<=3200 keeps the original, natively received cap and exact old admission.
 // The all-pending envelope is used for larger, previously unreceived banks.
 const effective=featureCells<=3200?LEGACY:rounded>LEGACY?rounded:LEGACY;
 return Object.freeze({schema:'mgcfdn-native-gpu-admission/119',featureCells,policy:featureCells<=3200?'received-native512':'graph-all-pending-bound',gpuMaximumBytes:exact(effective),maximumQuadraticBufferBytes:exact(bucket(matrix)),unroundedAllPendingBoundBytes:exact(sum),terms:Object.freeze(Object.fromEntries(Object.entries(terms).map(([k,v])=>[k,exact(v)])))});
}

export function assertMgcfdnWindowGpuLimits(limits,plan,kind){
 const maxBufferSize=limits?.maxBufferSize,maxStorageBufferBindingSize=limits?.maxStorageBufferBindingSize,required=plan.maximumQuadraticBufferBytes;
 if(!Number.isSafeInteger(maxBufferSize)||!Number.isSafeInteger(maxStorageBufferBindingSize)||maxBufferSize<required||maxStorageBufferBindingSize<required)throw new EngineError('MGCFDN_GPU_BINDING_LIMIT','Native MGCFDN quadratic buffer exceeds the available GPU '+kind+' limits',{details:{featureCells:plan.featureCells,requiredBufferBytes:required,maxBufferSize:maxBufferSize??null,maxStorageBufferBindingSize:maxStorageBufferBindingSize??null,kind}});
 return Object.freeze({maxBufferSize,maxStorageBufferBindingSize,requiredBufferBytes:required});
}
