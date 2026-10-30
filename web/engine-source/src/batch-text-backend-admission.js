import {EngineError,requireValue} from './errors.js';

const MODEL_SHA='090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f';

/** Only the batch preparation's required-close PP-OCRv6 route. Its current
 * ORT WebGPU execution produces text but has no portable successful retirement.
 * This is a lifecycle qualification, independent of speed or user agent. */
export function batchTextBackendAdmission(asset,requestedBackend='auto'){
 requireValue(['auto','cpu','webgpu'].includes(requestedBackend),'Invalid preparation text backend.');
 const requiredCloseUnqualified=asset?.id==='PP-OCRv6_small_det'&&asset.sha256===MODEL_SHA&&asset.bytes===9929594;
 const decision={schema:'sherloq.batch-text-backend-admission/1',requestedBackend,effectiveBackend:requestedBackend,scope:'batch-scientific-text-required-close',modelSha256:asset?.sha256??null,reason:'requested-backend'};
 if(!requiredCloseUnqualified||requestedBackend==='cpu')return Object.freeze(decision);
 const details={...decision,effectiveBackend:null,reason:'gpu-lifecycle-unqualified',gpuQualification:'unqualified-required-retirement'};
 if(requestedBackend==='webgpu')throw new EngineError('GPU_UNSUPPORTED','The batch text detector GPU runtime cannot complete its required retirement. Use CPU or Auto for this preparation.',{details});
 return Object.freeze({...details,effectiveBackend:'cpu'});
}
