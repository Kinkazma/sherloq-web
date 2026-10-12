import {installTransformStripWorker} from './transform-strip-worker.js';
import {plotsStreamMath} from './plots-stream-math.js';
installTransformStripWorker(async data=>(await plotsStreamMath()).run(data),{label:'plots-strip'});
