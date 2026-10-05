import "../../runtime-context.js?v=0.14.5";
import {EngineError} from './errors.js';
import {wasmAllocationFailure} from './allocation.js';
// -4 is the native bad_alloc/StsNoMem boundary, not a generic extraction error.
export function sparseExtractionFailure(status,module,context){
 const error=status===-4?wasmAllocationFailure(module,'Feature extraction memory allocation failed'):new EngineError(status===-3?'INVALID_INPUT':'FEATURE_EXTRACTION_FAILED',status===-3?'SIFT G2NN scaled image exceeds 32,000,000 pixels':'Native feature extraction failed');
 error.details={...error.details,nativeStatus:status,stage:'feature-extraction',...context};return error;
}
