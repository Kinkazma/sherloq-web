import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
// Metadata for the qualified observed-ROI route. This is independent from the
// offline assembly identity and does not turn an unknown runtime into a gate.
export const NLM_USEFUL_PRECISION='Native NLM7x7-21x21 opaque packed32/RGB8, exact qualified output';
export const nlmOwnerState=(native,cpuKernel)=>({schema:'sherloq.nlm-owner-state/1',route:'native-observed-regions-v1',cpuThreads:1,providerLifetime:'fresh-per-operation',precision:NLM_USEFUL_PRECISION,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,cpuKernel,native});
export const nlmUsefulWork=(nativeBefore,analysedPixels)=>({schema:'sherloq.nlm-useful-work/1',route:'native-observed-regions-v1',cpuThreads:1,providerLifetime:'fresh-per-operation',precision:NLM_USEFUL_PRECISION,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,nativeBefore,analysedPixels});
