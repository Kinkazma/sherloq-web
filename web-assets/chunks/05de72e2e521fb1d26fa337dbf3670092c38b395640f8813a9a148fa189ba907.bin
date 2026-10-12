import "../../runtime-context.js?v=0.15.1";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {createSsimBand} from './comparison-ssim-band.js';let kernel;
installTransformStripWorker(async data=>{kernel??=await createSsimBand();return kernel.run(data);},{label:'comparison-ssim-strip'});
