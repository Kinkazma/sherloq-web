import "../../runtime-context.js?v=0.16.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {pixelStripStage} from './pixel-strip-stage.js';
import {gradientHeapBytes} from './gradient-math.js';
import {contrastHeapBytes} from './contrast-math.js';
import {cvHeapBytes} from './opencv.js';
installTransformStripWorker(async data=>({...await pixelStripStage(data),heapBytes:gradientHeapBytes()+contrastHeapBytes()+cvHeapBytes()}),{label:'pixel-strip'});
