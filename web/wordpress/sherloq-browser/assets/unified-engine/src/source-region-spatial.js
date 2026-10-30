import "../../runtime-context.js?v=0.30.0";
import {sourceRegionBiomes} from './source-region-biomes.js';
import {sourceRegionDoubleJpeg} from './source-region-double-jpeg.js';
import {SOURCE_REGION_CLONES_ADAPTER} from './source-region-clones.js';
import {SOURCE_REGION_COMPLETE_ADAPTER} from './source-region-complete.js';
import {sourceRegionDocTamper} from './source-region-doctamper.js';
import {sourceRegionComprint} from './source-region-comprint.js';
import {sourceRegionOrb} from './source-region-orb.js';
import {sourceRegionSpai} from './source-region-spai.js';
import {sourceRegionAkaze} from './source-region-akaze.js';
import {SOURCE_REGION_SPARSE_ADAPTER} from './source-region-sparse.js';
import {sourceRegionGeneration} from './source-region-generation.js';
import {sourceRegionBrisk} from './source-region-brisk.js';
import {cloningParams} from './cloning.js';
import {sourceRegionPrnu} from './source-region-prnu.js';
import {sourceRegionComparison} from './source-region-comparison.js';
import {sourceRegionJpegCurve} from './source-region-jpeg-curves.js';
import {sourceRegionZero} from './source-region-fragmented-zero.js';
import {sourceRegionDense} from './source-region-dense.js';
import {denseCopyParams} from './dense-adapter.js';
import {sourceRegionMedian} from './source-region-fragmented-median.js';
import {sourceRegionGhost} from './source-region-fragmented-ghost.js';
import {ghostParams} from './ghost-maps.js';
import {sourceRegionEnergy} from './source-region-fragmented-energy.js';
import {energyParams} from './energy-pipeline.js';
import {sourceRegionResamplingAnalysis} from './source-region-fragmented-resampling-analysis.js';
import {sourceRegionResamplingFourier} from './source-region-fragmented-resampling-fourier.js';
import {sourceRegionStereogram} from './source-region-fragmented-stereogram.js';
import {sourceRegionFrequency} from './source-region-fragmented-frequency.js';
import {SOURCE_REGION_OCR_ADAPTER} from './source-region-ocr.js';
import {SOURCE_REGION_RESEARCH_ADAPTER} from './source-region-research.js';
import {sourceRegionBlocking} from './source-region-fragmented-blocking.js';
import {sourceRegionWavelets} from './source-region-fragmented-wavelets.js';
import {sourceRegionContrast} from './source-region-general-contrast.js';
import {sourceRegionDefects} from './source-region-general-defects.js';
import {sourceRegionNoisesniffer} from './source-region-general-noisesniffer.js';
import {sourceRegionMagnifier} from './source-region-magnifier.js';
import {sourceRegionSubimages} from './source-region-subimages.js';
import {subimageParams} from './auto-zones.js';
import {sourceRegionPca} from './source-region-general-pca.js';
import {sourceRegionBitPlanes} from './source-region-general-planes.js';
import {sourceRegionIlluminant} from './source-region-general-illuminant.js';
import {sourceRegionSeparation} from './source-region-general-separation.js';
import {sourceRegionDerivatives} from './source-region-general-derivatives.js';
import {sourceRegionMinmax} from './source-region-general-minmax.js';
import {sourceRegionAdjust} from './source-region-adjust.js';
import {sourceRegionPlots} from './source-region-plots.js';
import {sourceRegionEla} from './source-region-ela.js';
import {validateParams as validateElaParams} from './ela.js';
import {EngineError,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';

// Exclusions are never observations. Outside the membership the returned RGB
// surface keeps the original solely as a presentation background. Only native
// admitted rectangles are passed to the pixel-independent scientific kernel.
export async function sourceRegionPointwise({task,original,derived,view,domain,budget,signal,onProgress,publishResult}){
 const operation=PIXEL_OPERATIONS[task.operation],params=operation.validate(task.params);
 const adapter=SOURCE_REGION_SPATIAL_ADAPTERS[task.operation];
 if(!adapter?.accepts(params)||task.operation==='inspection.adjust'&&(params.equalize!==0||params.threshold===0))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','These parameters require a separate membership-aware neighborhood or statistics adapter.');
 const width=domain.width,height=domain.height,bytes=width*height*3,cooperate=createCooperator(signal);let output,surface,published=false,blocks=0;
 try{
  output=await createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
  // This copy is explicitly display-only and is not passed to any analysis.
  const rows=Math.max(1,Math.min(height,Math.floor(262144/width)));
  for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),window=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(window.pixels.data,y*width*3);}finally{window.release();}}
  const heap=operation.extraBytes??0,factor=Math.max(2,operation.scratchFactor??2),available=budget.limit-budget.retained-budget.active-heap;
  const pixels=Math.min(262144,Math.floor(available/(factor*3)),1024*1024);
  if(pixels<1)throw new EngineError('MEMORY_LIMIT','The membership-aware native kernel cannot fit the current budget.');
  let completed=0,semantics;
  // Tiny admitted rectangles share one task-wide cooperation deadline.
  await view.visitIncluded(async(pixels,{rect})=>{
   await cooperate();const release=budget.reserve(heap+pixels.data.length*factor);
   try{const result=await operation.compute(pixels,params,{signal});checkAbort(signal);
    if(result.pixels?.format!=='rgb8'||result.pixels.width!==rect.width||result.pixels.height!==rect.height||result.pixels.data.length!==rect.width*rect.height*3)throw new EngineError('INVALID_RESULT','Pointwise kernel returned another native pixel grid.');
    for(let row=0;row<rect.height;row++)await output.write(result.pixels.data.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+row)*width+rect.x)*3);
    semantics=result.semantics;blocks++;completed+=rect.width*rect.height;onProgress?.({phase:'source-region-pointwise',fraction:completed/domain.countIncluded});
   }finally{release();}
  },{signal,windowPixels:pixels});
  await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width,height,budget});
  const record={surface,semantics:(semantics??'Native pointwise visualization.')+' Only admitted original pixels were computed; excluded pixels retain the original for display only.',metrics:{blocks,includedPixels:domain.countIncluded,excludedPixels:width*height-domain.countIncluded,storage:output.storage,sourceRegionPolicy:'point-independent-admitted-native-rectangles'}};
  const bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics:record.semantics,metrics:record.metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted',presentationOutsideDomain:'original-unanalysed'}};
 }catch(error){if(!published){if(surface)await surface.dispose();else await output?.dispose();}throw normalizeResourceError(error);}
}
const all=()=>true;
export const SOURCE_REGION_SPATIAL_ADAPTERS=Object.freeze({
 'analysis.complete':SOURCE_REGION_COMPLETE_ADAPTER,
 'subimages.detect':{shapes:['membership','native-regions'],validateParams:subimageParams,accepts:all,parameterConstraints:'Unchanged native geometric panel detector independently in complete admitted RGB contexts; no excluded palette/morphology observations or implied full-frame fallback.',run:sourceRegionSubimages},
 'analysis.clones':SOURCE_REGION_CLONES_ADAPTER,
 'ai.text.doctamper':{shapes:['rectangle','membership','native-regions'],accepts:()=>true,parameterConstraints:'Independent DTD512 contexts keep complete admitted Original8x8 support, original JPEG categories/QT or explicitly declared native grayQ90 working mode; no excluded RGB, encoded crop, substituted compression history or union verdict.',run:ctx=>sourceRegionDocTamper({...ctx,runNative:ctx.runGeneration})},
 'jpeg.comprint':{shapes:['rectangle','membership','native-regions'],accepts:()=>true,parameterConstraints:'Native CNN contexts before a single global FP32 normalization/SPAM512/PCA32/ten-restart EM population. No excluded RGB or invented spatial adjacency across contexts.',run:ctx=>sourceRegionComprint({...ctx,runNative:ctx.runGeneration})},
 'ai.generation.spai':{shapes:['rectangle','membership','native-regions'],accepts:()=>true,parameterConstraints:'Independent exact admitted native RGB contexts, unchanged224-pixel sampling/realFFT radius16/encoder and learned aggregator; no union score or exhaustive pixel classification.',run:ctx=>sourceRegionSpai({...ctx,runNative:ctx.runGeneration})},
 'ai.generation.bfree':{shapes:['rectangle','membership','native-regions'],accepts:()=>true,parameterConstraints:'Independent exact admitted native B-Free contexts, official grid14/five504sampling and native reduction retained. Context scores separate; no union verdict or pixel-wise localization.',run:ctx=>sourceRegionGeneration({...ctx,runNative:ctx.runGeneration})},
 'tampering.copyMove.orb':{shapes:['rectangle','membership','native-regions'],handledInputs:['params.maskImageId'],validateParams:cloningParams,accepts:all,parameterConstraints:'Native ORB observations and32-byte descriptors per exact admitted context; one global response selection, ordered Hamming and geometry/counting bank. Original-grid detection mask remains a native centre selector.',run:sourceRegionOrb},
 'tampering.copyMove.akaze':{shapes:['rectangle','membership','native-regions'],handledInputs:['params.maskImageId'],validateParams:cloningParams,accepts:all,parameterConstraints:'Native nonlinear AKAZE diffusion and 61-byte descriptors per admitted context, then unchanged union-global response selection/Hamming/geometry; large contexts retain native paged extraction. Detection mask selects native centres on the Original grid.',run:sourceRegionAkaze},
 'tampering.copyMove.brisk':{shapes:['rectangle','membership','native-regions'],handledInputs:['params.maskImageId'],validateParams:cloningParams,accepts:all,parameterConstraints:'Native BRISK observations and descriptors per admitted context; one unchanged global response selection, ordered Hamming and geometry bank. Detection mask remains a verified Original-grid native centre selector.',run:sourceRegionBrisk},
 'noise.prnu':{shapes:['rectangle','membership','native-regions'],validateParams:PIXEL_OPERATIONS['noise.prnu'].validate,accepts:all,parameterConstraints:'Native independent Wiener contexts on admitted RGB; identical Original-aligned fingerprint population for every camera; one native ordered union NCC, no score averaging. Explicit support and experimental threshold, no invented calibration.',run:sourceRegionPrnu},
 'comparison.image':{shapes:['rectangle','membership','native-regions'],handledInputs:['params.referenceImageId'],validateParams:PIXEL_OPERATIONS['comparison.image'].validate,accepts:all,parameterConstraints:'The same exact Original-grid membership applies to both SHA-bound source owners. Twelve union-global native measures; eight spatial measures retain separate native contexts, never an averaged score.',run:sourceRegionComparison},
 'jpeg.quality':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['jpeg.quality'].validate,accepts:all,parameterConstraints:'Unchanged native100-quality grayscale curve and optional explicit model in exact independent admitted JPEG contexts; original file tables retained.',run:sourceRegionJpegCurve},
 'jpeg.recompression':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['jpeg.recompression'].validate,accepts:all,parameterConstraints:'Unchanged native101-quality grayscale loss curves, includingQ0 andQ100, in exact independent admitted JPEG contexts.',run:sourceRegionJpegCurve},
 'tampering.copyMove.dense':{shapes:['membership'],validateParams:denseCopyParams,accepts:()=>true,parameterConstraints:'Strict native descriptor and detail RGB contexts; common original-coordinate matching across admitted acquisitions; native parameters, guides, candidate geometry and supplementary policy retained. Intrinsic small-context limitations are explicit.',run:sourceRegionDense},
 'various.median':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['various.median'].validate,accepts:all,parameterConstraints:'Unchanged native64x64 median features, historical padding and explicitly loaded XGBoost model per exact admitted RGB context; each native score/variance/margin/decision grid retained independently.',run:sourceRegionMedian},
 'jpeg.multiple':{shapes:['rectangle','membership','native-regions'],validateParams:PIXEL_OPERATIONS['jpeg.multiple'].validate,accepts:all,parameterConstraints:'Exact original stored JPEG component0 histograms; only complete original8x8 footprints entirely admitted in displayed EXIF coordinates update counts or lattice statistics. No crop is recompressed.',run:sourceRegionDoubleJpeg},
 'jpeg.zero':{shapes:['membership','native-regions'],previewOperations:['jpeg.zero'],validateParams:PIXEL_OPERATIONS['jpeg.zero'].validate,accepts:all,parameterConstraints:'Independent exact admitted native RGB contexts with unchanged ZERO NFA populations, JPEG99 branch and native boundaries; every native raw grid and non-evaluable context remains explicit.',run:sourceRegionZero},
 'ela.biomes':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['ela.biomes'].validate,accepts:all,parameterConstraints:'Complete admitted cells, one global Original-grid Native peer/coherence population; independent unchanged context JPEG/filters/Ghost upstream. No excluded observation.',run:sourceRegionBiomes},
 'jpeg.ghosts':{shapes:['membership','native-regions'],previewOperations:['jpeg.ghosts'],validateParams:ghostParams,accepts:all,parameterConstraints:'Native JPEG/circular phase and complete16x16 grids per exact admitted RGB context; native non-evaluable contexts supply explicit status and no fabricated scores.',run:sourceRegionGhost},
 'ela.energy':{shapes:['membership','native-regions'],validateParams:energyParams,accepts:all,parameterConstraints:'Complete native Energy contexts with independent seven-field grids and local profiles; explicit context selection, unique coverage and multiplicity; unchanged 25-complete-cell support.',run:sourceRegionEnergy},
 'tampering.resampling':{shapes:['membership','native-regions'],previewOperations:['tampering.resampling'],validateParams:PIXEL_OPERATIONS['tampering.resampling'].validate,accepts:all,parameterConstraints:'Native file-gray on admitted observations; exact independent native interpolation EM fits, composites, compact probability maps and separate native Fourier contexts.',run:sourceRegionResamplingAnalysis},
 'tampering.resampling.fourier':{shapes:['membership','native-regions'],previewOperations:['tampering.resampling.fourier'],validateParams:PIXEL_OPERATIONS['tampering.resampling.fourier'].validate,accepts:all,parameterConstraints:'Native original-file gray normalization on admitted membership, then complete unchanged independent native binary64 Fourier contexts and their separate grids/tables.',run:sourceRegionResamplingFourier},
 'ai.clones.d2prl':{shapes:['membership'],accepts:all,parameterConstraints:'Experimental strict native RGB fragments before CNN; independent acquisitions and comparison envelope; unchanged448-grid40-iteration model.',run:({runLegacy})=>runLegacy({})},
 'detail.frequency':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['detail.frequency'].validate,accepts:all,parameterConstraints:'Unchanged native padded DFT per exact admitted geometry rectangle; low/high retain source coordinates, complete magnitude/phase grids use explicit independent-frequency atlases and native mask tables remain per fragment.',run:sourceRegionFrequency},
 'various.stereogram':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['various.stereogram'].validate,accepts:all,parameterConstraints:'Unchanged native periodicity, pattern, disparity and all four modes in exact independent admitted contexts; no-period and unpaired observations explicit.',run:sourceRegionStereogram},
 'noise.blocking':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['noise.blocking'].validate,accepts:all,parameterConstraints:'Native db8 axes and block MAD within exact admitted native RGB rectangles, with every independent native noise grid retained.',run:sourceRegionBlocking},
 'various.ocr':SOURCE_REGION_OCR_ADAPTER,
 'ai.localization.focal':SOURCE_REGION_RESEARCH_ADAPTER,
 'ai.localization.adaifl':SOURCE_REGION_RESEARCH_ADAPTER,
 'ai.sources.safire':SOURCE_REGION_RESEARCH_ADAPTER,
 'tampering.copyMove.sparse':SOURCE_REGION_SPARSE_ADAPTER,
 'detail.wavelets':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['detail.wavelets'].validate,accepts:all,parameterConstraints:'Unchanged native symmetric wavelet transform per exact admitted geometry rectangle; requested and native effective levels explicit; no hole-filled global transform.',run:sourceRegionWavelets},
 
 'tampering.contrast':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['tampering.contrast'].validate,accepts:all,parameterConstraints:'Unchanged native histogram/channel indicators, padding and3x3median in exact independent admitted RGB contexts; every admitted pixel rendered and each raw grid retained.',run:sourceRegionContrast},
 'pixels.defects':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['pixels.defects'].validate,accepts:all,parameterConstraints:'Native candidate inequalities over real admitted neighbours, with observed counts and actual-observation upper medians; native outer border and ordered candidate rows retained.',run:sourceRegionDefects},
 'noise.noisesniffer':{shapes:['membership','native-regions'],previewOperations:['noise.noisesniffer'],validateParams:PIXEL_OPERATIONS['noise.noisesniffer'].validate,accepts:all,parameterConstraints:'Native union-global statistics/selection and ordered cell growth on complete admitted native footprints; unchanged global FFT geometry for block8, complete admitted8x8 blocks with native7-pixel halos; explicit observations without a native footprint.',run:sourceRegionNoisesniffer},
 'inspection.magnifier':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['inspection.magnifier'].validate,accepts:all,parameterConstraints:'Native ROI histograms and clipping on admitted observations only, with exact native LUT arithmetic and explicit analysis_scope.',run:sourceRegionMagnifier},
 'noise.minmax':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['noise.minmax'].validate,accepts:all,parameterConstraints:'Strict extrema against real admitted neighbours only, with observed-neighbour counts; native outer border remains noncandidate and density statistics omit excluded observations.',run:sourceRegionMinmax},
 'detail.gradient':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['detail.gradient'].validate,accepts:all,parameterConstraints:'Sobel retains its native coefficients and admitted reflected-or-centre boundary extension. Reconstructed Krawetz uses available admitted neighbours, local direction and native magnitude. Both cover every admitted centre; tone histograms use the admitted union.',run:sourceRegionDerivatives},
 'detail.echo':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['detail.echo'].validate,accepts:all,parameterConstraints:'Unchanged native Echo coefficients and radius; incomplete ROI support uses an explicit admitted reflected-or-centre extension. Union-global extrema include every admitted centre.',run:sourceRegionDerivatives},
 'noise.separation':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['noise.separation'].validate,accepts:all,parameterConstraints:'Every admitted centre uses its unchanged native kernel: observed median or normalized positive Gaussian/box/bilateral taps, and explicit reflected-or-centre support for native NLM. Residual equalization includes all admitted centres only.',run:sourceRegionSeparation},
 'various.illuminant':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['various.illuminant'].validate,accepts:all,parameterConstraints:'Admitted cell/global histograms, admitted cell areas and native Minkowski estimator; excluded samples omitted before every statistic.',run:sourceRegionIlluminant},
 'noise.planes':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['noise.planes'].validate,accepts:all,parameterConstraints:'Native bit mask for every admitted observation; incomplete majority and Gaussian display filters use only observed admitted taps with explicit median ties and weight normalization.',run:sourceRegionBitPlanes},
 'colors.pca':{shapes:['membership','native-regions'],validateParams:PIXEL_OPERATIONS['colors.pca'].validate,accepts:all,parameterConstraints:'One ordered native PCA over all admitted original observations; global moments, extrema and equalization omit excluded samples.',run:sourceRegionPca},
 'ela.classic':{shapes:['membership'],validateParams:validateElaParams,accepts:all,parameterConstraints:'Every admitted geometry rectangle is a complete native JPEG context; no selected boundary is eroded. Independent contexts use local native JPEG phase and unchanged edge padding.',run:sourceRegionEla},
 'colors.plots':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.plots'].validate,accepts:all,parameterConstraints:'Native pyrDown grid and RGB/HSV row order; partial support uses positive observed Gaussian mass with normalized weights, while complete-support bytes remain native.',run:sourceRegionPlots},
 'colors.stats':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.stats'].validate,accepts:all,parameterConstraints:'All native channel-rank parameters; pixels independent.',run:sourceRegionPointwise},
 'colors.space':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.space'].validate,accepts:all,parameterConstraints:'All native color-space parameters; no spatial or global reductions.',run:sourceRegionPointwise},
 'inspection.adjust':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['inspection.adjust'].validate,accepts:all,parameterConstraints:'Native pointwise/HSV/LUT on every admitted centre; incomplete Gaussian support and CLAHE interpolation renormalize only admitted observations. Complete native support is unchanged.',run:sourceRegionAdjust}
});
