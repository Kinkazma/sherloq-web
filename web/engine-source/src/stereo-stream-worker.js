import {installTransformStripWorker} from './transform-strip-worker.js';
import {createStereoStream} from './stereo-stream-kernel.js';
let ready;
installTransformStripWorker(async j=>{const math=await(ready??=createStereoStream());let result={};if(j.op==='search')result={sums:math.search(j.rgb,j.width,j.height,j.outputRows)};else if(j.op==='create')math.create(j.width,j.height);else if(j.op==='input')math.put(j.rgb,j.width,j.top,j.rows,j.offset);else if(j.op==='flow')result=math.flow(j.original);else if(j.op==='output')result={values:math.read(j.offset,j.count)};else throw Error('Unknown stereo stage');return result;},{label:'stereo-stream'});
