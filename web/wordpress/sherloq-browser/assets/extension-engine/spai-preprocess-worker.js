import "../runtime-context.js?v=0.21.0";
import {spectralBranches,extractPatch} from './spai.js';
import {installTransformStripWorker} from '../unified-engine/src/transform-strip-worker.js';
// The module's FFT plans are created once and reused for every useful window.
installTransformStripWorker(job=>{
  const raw=job.raw??extractPatch({width:job.width,height:job.height,data:job.rgb},job.origin,job.padding);
  const feeds=spectralBranches(raw);
  return {x:feeds.x.data,x_low:feeds.x_low.data,x_high:feeds.x_high.data};
},{label:'spai-spectral'});
