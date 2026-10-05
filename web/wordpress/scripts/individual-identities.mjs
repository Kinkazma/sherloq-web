// These are the identities exported by the immutable integration engine.
import {SAFIRE_MODEL} from '../sherloq-browser/assets/unified-engine/src/safire.js';
import {FOCAL_MODEL} from '../sherloq-browser/assets/unified-engine/src/focal-assets.js';
import {ADAIFL_MODEL} from '../sherloq-browser/assets/unified-engine/src/adaifl-assets.js';
import {ALIKED_MODELS} from '../sherloq-browser/assets/unified-engine/src/aliked-assets.js';
import {XFEAT_PAGED_MODEL} from '../sherloq-browser/assets/unified-engine/src/xfeat-paged-assets.js';
import {SPARSE_GLUE_PAGED_MODELS} from '../sherloq-browser/assets/unified-engine/src/sparse-glue-paged-assets.js';
import {SEGMENTATION_MODEL_IDENTITIES} from '../sherloq-browser/assets/unified-engine/src/index.js';
console.log(JSON.stringify({m3:{safire:SAFIRE_MODEL,focal:FOCAL_MODEL,adaifl:ADAIFL_MODEL,...ALIKED_MODELS,'xfeat-paged':XFEAT_PAGED_MODEL,...Object.fromEntries(Object.entries(SPARSE_GLUE_PAGED_MODELS).map(([name,v])=>[name+'-glue-paged',v]))},segmentation:SEGMENTATION_MODEL_IDENTITIES}));
