import {energyParams,energyPipeline} from './energy-pipeline.js';
import {subimageParams,subimageData} from './auto-zones.js';
import {cloningParams,cloningReferences,cloningAdmission,cloningAKAZEAdmission,cloningData,cloningAKAZEData,cloningView} from './cloning.js';
import {noisesnifferParams,noisesnifferAdmission,noisesnifferData,noisesnifferRender} from './noisesniffer.js';
import {medianParams,medianReferences,medianAdmission,medianData,medianView} from './median.js';
import {contrastParams,contrastData,contrastView} from './contrast.js';
import {prnuParams,prnuReferences,prnuAdmission,prnuData} from './prnu.js';
import {comparisonParams,comparisonReferences,comparisonAdmission,comparisonData,comparisonView} from './comparison.js';
import {stereoParams,stereoData,stereoView} from './stereogram.js';
import {zeroParams,zeroData,zeroView} from './zero.js';
import {ghostParams,ghostMaps,ghostView} from './ghost-maps.js';
import {doubleJpegParams,doubleJpeg,doubleJpegAdmission} from './double-jpeg.js';
import {qualityParams,qualityReferences,jpegQuality} from './jpeg-quality.js';
import {statsParams,pixelStats} from './pixel-stats.js';
import {planesParams,bitPlanes} from './bit-planes.js';
import {histogramParams,histogram,histogramSummary} from './histogram.js';
import {minmaxParams,minmax} from './minmax.js';
import {defectParams,defectPixels} from './defect-pixels.js';
import {METADATA_OPERATIONS} from './metadata.js';
import {digestParams,fileDigest} from './digest.js';
import {illuminantParams,illuminant} from './illuminant.js';
import {magnifierParams,magnifier} from './magnifier.js';
import {plotsParams,plotData,plotView} from './plots.js';
import {OPENCV_OPERATIONS} from './opencv-operations.js';
import {waveletParams,waveletData,waveletView} from './wavelets.js';
import {frequencyParams,frequencyData,frequencyView} from './frequency.js';
import {blockingParams,blockingData,blockingView} from './wavelet-blocking.js';
import {resamplingFourierParams,resamplingFourierAdmission,resamplingFourierData,resamplingFourierView} from './resampling-fourier.js';

// Budget multipliers include working arrays, retained result and defensive copy.
export const PIXEL_OPERATIONS=Object.freeze({
 'ela.energy':{validate:energyParams,compute:energyPipeline,scratchFactor:0,extraBytes:0,dynamicResultBudget:true,native:'core/ela_biomes.py energy path + ela_energy.py + ela_energy_auto.py; original-byte JPEG tables',exports:['json','npz'],kernelStatus:'validated-synthetic',parity:'51 complete native original-byte energy paths exact through real API workers in Chrome/Firefox/WebKit; 84 preparation,624 mask,512 colour and scientific-profile corpora. Three useful JPEG workers at1MP, cache/NPZ/cancellation verified. Energy-only; no legacy peer biomes or complete analysis.'},
 ...METADATA_OPERATIONS,
 ...OPENCV_OPERATIONS,
 'subimages.detect':{validate:subimageParams,compute:subimageData,scratchFactor:0,extraBytes:0,dynamicResultBudget:true,native:'core/auto_zones.py: detect_panels; NumPy1.26.4/OpenCV4.11.0',exports:['json'],kernelStatus:'validated-synthetic',parity:'144 generated original-byte cases reproduce exact native decoded pixels and panel polygons. Native BGR palette ties, median, morphology, connected components, geometry and row order; no complete analysis or authenticity decision. CPU and full-memory only.'},
 'tampering.copyMove.akaze':{validate:cloningParams,references:cloningReferences,compute:cloningAKAZEData,view:cloningView,cacheParams:({showPoints,hideLines,...p})=>p,scratchFactor:0,extraBytes:0,admissionBytes:cloningAKAZEAdmission,dynamicResultBudget:true,native:'core/cloning.py: explicit AKAZE variant; OpenCV 4.11.0 nonlinear diffusion and 61-byte MLDB',exports:['json'],kernelStatus:'validated-synthetic',parity:'Explicit AKAZE: all point fields, 61-byte descriptors, ordered matches, groups, counts and RGB exact on the declared generated corpus in docs/COPY-MOVE-AKAZE.md. Binary1 masks, operation-separated caches, memory and cancellation tested. Dense 1MP checker complete pipeline remains unqualified. CPU only, full-memory only; BRISK remains unavailable.'},
 'tampering.copyMove.orb':{validate:cloningParams,references:cloningReferences,compute:cloningData,view:cloningView,cacheParams:({showPoints,hideLines,...p})=>p,scratchFactor:0,extraBytes:0,admissionBytes:cloningAdmission,dynamicResultBudget:true,native:'core/cloning.py: explicit ORB variant; OpenCV 4.11.0, pinned native equal-distance sorting',exports:['json'],kernelStatus:'validated-synthetic',parity:'Explicit ORB: 64 detections,256 selections,104 ordered match cases and238 full product outputs exact on the declared Chrome/Firefox/WebKit corpus;4 expected native memory refusals. Binary1 masks, grouping workers, cache, budget, JSON and cancellation qualified. BRISK/GPU and segmented sources unavailable; AKAZE has its own explicit operation.'},
 'tampering.resampling.fourier':{validate:resamplingFourierParams,compute:resamplingFourierData,view:resamplingFourierView,cacheParams:({gamma,rescale,...p})=>p,scratchFactor:0,extraBytes:0,admissionBytes:resamplingFourierAdmission,native:'core/resampling.py: ResamplingEngine.fourier; NumPy 1.26.4 pocketfft + OpenCV 4.11.0 pyrUp',exports:['json'],kernelStatus:'validated-synthetic',requirements:['qualified-original-grayscale'],parity:'16 native arithmetic primitives bit exact;992 Fourier outputs and180 original-file paths have exact RGB previews, scalar abs/max(1,abs(native))<=1e-8. Three1MP cases checked in Chrome/Firefox/WebKit; equal/near-equal peak order can differ. No probability EM or automated decision.'},
 'various.median':{validate:medianParams,references:medianReferences,referenceKind:'median-model',compute:medianData,view:medianView,cacheParams:({modelId})=>({modelId}),scratchFactor:0,extraBytes:0,admissionBytes:medianAdmission,native:'core/median.py + XGBoost2.0.3 numeric gbtree binary logistic',exports:['json'],kernelStatus:'validated-synthetic',requirements:['explicit-local-median-model'],parity:'9216 native feature inputs match after float32 cast;3252 native renders per Chrome/Firefox/WebKit, complete model scores/margins/decisions exact on the declared image corpus. General expf probability identity is not guaranteed; no weights bundled.'},
 'noise.noisesniffer':{validate:noisesnifferParams,compute:noisesnifferData,view:noisesnifferRender,cacheParams:({view,...p})=>p,scratchFactor:0,extraBytes:0,admissionBytes:noisesnifferAdmission,native:'core/noisesniffer.py + corrected IPOL 2024/462',exports:['json','npz'],parity:'36 native statistics, 120 analyses/360 views and 24 regional cases exact; 1 MP statistic/output hashes and real worker partitions qualified in Chrome/Firefox/WebKit; corpus log10 NFA error <=1e-10 with identical decisions'},
 'noise.prnu':{validate:prnuParams,references:prnuReferences,referenceKind:'prnu-database',compute:prnuData,scratchFactor:0,extraBytes:0,admissionBytes:prnuAdmission,native:'core/prnu.py: Wiener residual, incremental mean and NCC; SciPy 1.17.1 pocketfft',exports:['json','csv'],parity:'30 native residuals including 1 MP, 25 NCC/threshold probes and two JPEG training means exact in Chrome/Firefox/WebKit; float64 HDF5 read/write verified'},
 'comparison.image':{validate:comparisonParams,references:comparisonReferences,compute:comparisonData,view:comparisonView,cacheParams:({metrics,view})=>({metrics,view}),scratchFactor:4,extraBytes:0,admissionBytes:comparisonAdmission,native:'comparison.py + pinned Sewar, SSIMULACRA and Butteraugli',exports:['json','csv'],parity:'33 native pairs/528 views exact; all 20 measures and undefined outcomes checked; helper printed scores exact, other finite scores within absolute/relative 1e-12; full-bin histogram correlation separately reported'},
 'detail.frequency':{backends:['cpu','webgpu'],validate:frequencyParams,compute:frequencyData,view:frequencyView,cacheParams:({split,smooth,threshold})=>({split,smooth,threshold}),scratchFactor:64,extraBytes:32*1024**2,native:'interactive.py:FrequencyEngine + frequency_mask.py',exports:['json'],parity:'4368 native views, float32 DFT/magnitude/phase and zeroed-coefficient counts exact; 132 GPU masks exact on declared development adapters; no runtime probes, other adapters unverified'},
 'noise.blocking':{validate:blockingParams,compute:blockingData,view:blockingView,cacheParams:()=>({}),scratchFactor:64,extraBytes:64*1024**2,native:'wavelet_blocking.py',exports:['json'],parity:'1094 native output and noise-map cases; original-file grayscale and db8 diagonal details verified separately'},
 'detail.wavelets':{validate:waveletParams,compute:waveletData,view:waveletView,cacheParams:p=>({wavelet:p.wavelet}),scratchFactor:64,extraBytes:32*1024**2,native:'interactive.py:WaveletEngine + wavelet_threshold.py',exports:['json'],parity:'3380 native outputs exact across all 59 UI wavelets and five threshold modes; float64 symmetric extension and native truncation'},
 'colors.plots':{validate:plotsParams,compute:plotData,view:plotView,cacheParams:p=>({scale:p.scale}),scratchFactor:64,extraBytes:32*1024**2,native:'interactive.py:PlotEngine',exports:['json'],parity:'1674 native plots: all RGB/HSV values, positions and colors exact; UI graph rendering is separate'},
 'file.digest':{validate:digestParams,compute:fileDigest,scratchFactor:12,extraBytes:32*1024**2,native:'digest.py',exports:['json'],parity:'Ten cryptographic digests exact against independent byte oracle; four perceptual hashes exact against native; two rejected hashes and filename ballistics explicitly unavailable'},
 'inspection.magnifier':{validate:magnifierParams,compute:magnifier,scratchFactor:5,extraBytes:0,native:'magnifier.py',exports:['json'],parity:'440 native ROI cases exact, including empty/clipped bounds, equalization and auto contrast'},
 'various.illuminant':{validate:illuminantParams,compute:illuminant,scratchFactor:10,extraBytes:0,native:'illuminant.py',exports:['json','csv'],parity:'1440 native renders and validity/counts exact; unit RGB/angles absolute error <=1e-12'},
 'tampering.contrast':{validate:contrastParams,compute:contrastData,view:contrastView,cacheParams:({block})=>({block}),scratchFactor:16,extraBytes:32*1024**2,native:'contrast.py',exports:['json'],parity:'52 native maps and 156 views exact, including 1 MP, correlated channels, padding and quantized histograms'},
 'various.stereogram':{validate:stereoParams,compute:stereoData,view:stereoView,cacheParams:({mode})=>({flow:mode>=2}),scratchFactor:64,extraBytes:32*1024**2,native:'stereogram.py + OpenCV 4.11 Farneback CPU',exports:['json'],parity:'28 native searches, 25 float32 flows and 100 views exact, including 1 MP and odd pyramid dimensions; full-resolution relative disparity'},
 'jpeg.zero':{validate:zeroParams,compute:zeroData,view:zeroView,cacheParams:({missing})=>({missing}),scratchFactor:64,extraBytes:32*1024**2,native:'zero.py + ZERO 2021 C',exports:['json','npz'],parity:'152 native analyses/760 views and 1 MP masks/votes/regions exact; log10 NFA maximum observed error 1.27e-11 with unchanged decisions; full RGB8 luminance domain exact'},
 'jpeg.ghosts':{validate:ghostParams,compute:ghostMaps,view:ghostView,cacheParams:({low,high,step,x,y})=>({low,high,step,x,y}),scratchFactor:18,extraBytes:32*1024**2,native:'ghost_maps.py',exports:['json'],parity:'Full-resolution JPEG block errors and normalized maps against synthetic native fixtures; graph composition remains UI work'},
 'jpeg.multiple':{validate:doubleJpegParams,compute:doubleJpeg,scratchFactor:12,extraBytes:32*1024**2,admissionBytes:doubleJpegAdmission,native:'double_jpeg.py',exports:['json'],parity:'Exact stored DCT counts/steps/tails and declared native lattice scores/decisions; experimental aligned-grid evidence'},
 'jpeg.quality':{validate:qualityParams,references:qualityReferences,referenceKind:'jpeg-quality-model',compute:jpegQuality,scratchFactor:8,extraBytes:128*1024,native:'jpeg_quality.py + jpeg_curve.py',exports:['json','csv'],evidence:'fixtures/quality-reference.json',parity:'1700 native grayscale means and normalized binary64 curve values exact; table estimate/minimum exact. Eleven local-model full pipelines and523 arithmetic scores exact; no weights bundled, no authenticity mask.'},
 'inspection.histogram':{validate:histogramParams,compute:histogram,scratchFactor:1,extraBytes:3*1024**2,native:'histogram.py + tools/inspection/histogram.py',exports:['json','csv']},
 'colors.stats':{validate:statsParams,compute:pixelStats,scratchFactor:3,extraBytes:0,native:'pixel_stats.py',exports:['json']},
 'noise.planes':{validate:planesParams,compute:bitPlanes,scratchFactor:5,extraBytes:0,native:'bit_planes.py',exports:['json']},
 'noise.minmax':{validate:minmaxParams,compute:minmax,scratchFactor:12,extraBytes:0,native:'minmax.py',exports:['json']},
 'pixels.defects':{validate:defectParams,compute:defectPixels,scratchFactor:60,extraBytes:0,native:'defect_pixels.py',exports:['json','csv']}
});
export const pixelCapabilities=()=>Object.entries(PIXEL_OPERATIONS).map(([id,op])=>({id,status:'partial',kernelStatus:op.kernelStatus??'validated-synthetic',backends:op.backends?.slice()??['cpu'],regions:['full-frame'],defaults:op.validate(),exports:op.exports.slice(),kernelParity:op.parity??'bit-exact pixels/masks on fixtures/pixel-reference.json; UI integration pending',native:op.native,...(op.requirements?{requirements:op.requirements.slice()}: {})}));
export function payloadBytes(value){
 if(ArrayBuffer.isView(value))return value.byteLength;
 if(typeof value==='string')return value.length*2;
 if(value===null||typeof value!=='object')return 8;
 return Object.entries(value).reduce((sum,[key,v])=>sum+key.length*2+payloadBytes(v)+32,64);
}
export function histogramView(result,p){
 result.data.summary=histogramSummary(result.data.bins,p.channel,p.start,p.end,result.data.cumulative[255]);return result;
}
