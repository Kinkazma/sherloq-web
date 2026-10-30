import "../../runtime-context.js?v=0.30.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {plotsStreamMath} from './plots-stream-math.js';
installTransformStripWorker(async data=>(await plotsStreamMath()).run(data),{label:'plots-strip'});
