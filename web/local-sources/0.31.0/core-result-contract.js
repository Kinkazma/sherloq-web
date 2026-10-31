// Native core results stay owned until current UI/domain adoption has ACKed.
// This is publication policy only; numerical kernels and parameters are unchanged.
const operations=new Set(["noise.separation","various.stereogram","comparison.image","noise.noisesniffer","noise.prnu","detail.wavelets","noise.blocking","tampering.resampling","tampering.resampling.fourier","various.median","ela.classic","ela.energy","ela.biomes","jpeg.ghosts","jpeg.zero","jpeg.multiple","jpeg.quality","jpeg.recompression","tampering.copyMove.brisk","tampering.copyMove.orb","tampering.copyMove.akaze","tampering.copyMove.sparse","tampering.copyMove.dense","ai.clones.d2prl","colors.stats","noise.planes","noise.minmax","pixels.defects"]);
export const stagedCoreOperation=task=>operations.has(task?.operation);
export const coreResultContext=context=>typeof context?.onCoreResult==='function'&&typeof context?.isCurrent==='function';
