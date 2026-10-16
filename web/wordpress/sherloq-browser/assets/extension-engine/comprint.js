import "../runtime-context.js?v=0.21.0";
import {prepareComprintInput,createComprintStatistics,rasterComprintMap} from './comprint-statistics.js';
export const VERSION='comprint-official-luma256-float32-20conv-halo20-v1';
export function prepare(image){return {...prepareComprintInput(image.data,image.width,image.height),method:'comprint',version:VERSION};}
export {inferTiled,runComprintFingerprint} from './comprint-inference.js';
export {createComprintStatistics,rasterComprintMap};
