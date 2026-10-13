import "../../runtime-context.js?v=0.17.2";
// Compatibility export for qualification tools; runtime imports use the
// already-loaded dense math module and do not add a descriptor-cache request.
export {createDenseDescriptorCache,denseDescriptorCacheByteBound,selectDenseDescriptorCacheJobs} from './dense-math.js';
