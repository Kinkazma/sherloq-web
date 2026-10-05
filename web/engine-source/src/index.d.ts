import type {AutomaticFilters,AutomaticState} from './automatic-analyzer.js';
import type {CloneEntry} from './clone-relations.js';
import type {AutomaticViewState} from './automatic-analysis-view.js';
export interface Pixels { width:number; height:number; format:'rgb8'; data:Uint8Array; }
export interface Surface {id:string;revision:number;width:number;height:number;format:'rgb8';coordinates:'full-resolution';}
export interface NumericSurface extends Omit<Surface,'format'> {format:'float32'|'int32';semantics:string;storage:string;}
export interface NumericPlane {width:number;height:number;format:'float32'|'int32';data:Float32Array|Int32Array;}
export interface ScientificExportPageRequest {exportId:string;revision:number;offset?:number;length?:number;}
export interface ScientificExportPage {exportId:string;revision:number;offset:number;bytes:Uint8Array;totalBytes:number;nextOffset:number;done:boolean;mime:'application/zip';}
export interface MaskSurface extends Omit<Surface,'format'> {format:'mask8';range:readonly [number,number];semantics:string;}
export interface ScientificSurface extends Omit<Surface,'format'> {format:'float32'|'int32';semantics:string;storage:string;}
export type ScientificPlane = {width:number;height:number}&({format:'float32';data:Float32Array}|{format:'int32';data:Int32Array});
export interface FlagSurface extends Omit<MaskSurface,'format'> {format:'rgb-flags8';channelOrder:'RGB';}
export interface Table {id:string;revision:number;format:'uint32-table'|'float32-table'|'float64-table';rowCount:number;columns:readonly string[];order:string;coordinates:string;scale?:number;gridWidth?:number;gridHeight?:number;storage?:string;}
export interface TableWindow {tableId:string;revision:number;offset?:number;length?:number;}
export interface TablePage {tableId:string;revision:number;offset:number;length:number;totalRows:number;columns:readonly string[];data:Uint32Array|Float32Array|Float64Array;done:boolean;imageId:string;metrics:Record<string,unknown>;}
export interface TableCsvPage extends Omit<TablePage,'columns'|'data'> {nextOffset:number;mime:'text/csv';bytes:Uint8Array;}
export interface PixelWindow {surfaceId:string;revision:number;rect:{x:number;y:number;width:number;height:number};}
export interface ElaParams { quality:number; scale:number; contrast:number; linear:boolean; grayscale:boolean; }
export type Polygon=[number,number][];
export interface SparseParams {algorithm:'SIFT'|'RootSIFT'|'AKAZE'|'BRISK'|'ORB'|'XFeat'|'XFeat + LighterGlue'|'ALIKED'|'ALIKED rotation'|'ALIKED + LightGlue'|'ALIKED rotation + LightGlue'|'SIFT + LightGlue'|'SIFT + G2NN + RANSAC'|'SIFT + G2NN + RANSAC + Panels + Text';limit:number;radius:number;minimum:number;threshold:number;tolerance:number;model:'None'|'Similarity'|'Affine'|'Homography';geometricThreshold:number;geometricMinimum:number;regions:Polygon[];excluded:Polygon[];guides:Polygon[];compare:boolean;reflections:boolean;autoRadius:boolean;compact:boolean;independent:boolean;}
export interface SparseView {low?:number;high?:number;minimum?:number;chosen?:number[];hidden?:number[];circles?:boolean;lines?:boolean;points?:boolean;areas?:boolean;textExclusions?:boolean;}
export interface M3Asset {sha256:string;data?:Uint8Array;url?:string;}
export interface M3Resources {models:Record<string,M3Asset|{graphs:Record<string,M3Asset>}>;language?:{data:Uint8Array;sha256:string};}
export interface OperationParams {
 'analysis.complete':AutomaticRuntimeParams;
 'analysis.clones':AutomaticRuntimeParams;
 'tampering.copyMove.brisk':OperationParams['tampering.copyMove.orb'];
 'tampering.copyMove.sparse':SparseParams;
 'ai.sources.safire':{side:4|8|16|24|32;groups:number;kind:'kmeans'|'dbscan';eps:number;minimum:number;binary:boolean};
 'ai.localization.focal':Record<string,never>;
 'ai.localization.adaifl':Record<string,never>;
 'ai.clones.d2prl':{minimum:number;exclusions:[number,number,number,number][];selectionPresent:boolean;refilterOf:string};
 'ai.clones.segmentation':{variant:SegmentationVariant;selectionPresent:boolean;reprojectOf:string;zoneIds:string[];exclusions:never[];compare:false};
 'ela.biomes':{quality:number;block:number;threshold:number;minimum:number;ghost:boolean;allGrids:boolean;background:boolean};
 'ela.energy':{quality:number;block:16|32|64|96;minimum:number;profile:'standard'|'manual'|'sensitive'|'conservative';histogramLow:number;histogramHigh:number;shadow:number;highlight:number};
 'subimages.detect':Record<string,never>;
 'tampering.copyMove.akaze':{response:number;matching:number;distance:number;minimum:number;showPoints:boolean;hideLines:boolean;maskImageId:string|null};
 'tampering.copyMove.orb':{response:number;matching:number;distance:number;minimum:number;showPoints:boolean;hideLines:boolean;maskImageId:string|null};
 'tampering.resampling.fourier':{rect:[number,number,number,number]|null;window:'hanning'|'radial';upsample:boolean;center:boolean;highpass:'simple'|'radial';gamma:number;rescale:boolean};
 'various.median':{modelId:string;variance:number;threshold:number;showScore:boolean;speckle:boolean};
 'noise.noisesniffer':{blockSize:3|5|7|8;cellSize:number;samplesPerBin:number;lowFrequencyFraction:number;lowNoiseFraction:number;view:'regions'|'mask'|'distribution'};
 'noise.prnu':{databaseId:string|null};
 'ela.classic':ElaParams;
 'comparison.image':{referenceImageId:string|null;view:'normal'|'difference'|'ssim'|'butter';metrics:boolean;equalized:boolean;grayscale:boolean};
 'tampering.contrast':{block:32|64|128|256;mode:0|1|2};
 'various.stereogram':{mode:0|1|2|3};
 'jpeg.zero':{missing:boolean;view:0|1|2|3|4};
 'jpeg.ghosts':{low:number;high:number;step:number;x:number;y:number;grayscale:boolean;includeOriginal:boolean};
 'jpeg.multiple':Record<string,never>;
 'jpeg.recompression':Record<string,never>;
 'jpeg.quality':{modelId:string|null};
 'file.digest':{imageHashes:boolean};
 'file.hex':{offset:number;length:number};
 'metadata.exiftool':{mode:'dump'|'location'|'headers'|'thumbnail'};
 'metadata.c2pa':{trustAnchors:string|null};
 'metadata.structure':Record<string,never>;
 'metadata.location':Record<string,never>;
 'metadata.thumbnail':Record<string,never>;
 'inspection.magnifier':{mode:'equalize'|'contrast';percent:number;channel:boolean;bounds:[number,number,number,number]|null};
 'various.illuminant':{block:32|64|128|256;method:0|1|2;linear:boolean;exclude:boolean;mode:0|1|2};
 'colors.plots':{scale:number|null;x:number;y:number;z:number;colored:boolean;alpha:number;kind:'2d'|'3d'|'classic'};
 'colors.pca':{component:number;mode:'distance'|'project'|'crossprod';invert:boolean;equalize:boolean};
 'colors.space':{space:'rgb'|'cmyk'|'gray'|'hsv'|'hls'|'ycrcb'|'xyz'|'lab'|'luv';channel:number};
 'noise.separation':{mode:number;radius:number;sigma:number;grayscale:boolean;denoised:boolean;levels:number};
 'noise.blocking':{block:number};
 'detail.frequency':{split:number;smooth:number;threshold:number;filter:number};
 'detail.wavelets':{wavelet:string;threshold:number;level:number|null;mode:'soft'|'hard'|'garrote'|'greater'|'less'};
 'detail.gradient':{intensity:number;mode:number;invert:boolean;equalize:boolean};
 'inspection.adjust':{brightness:number;saturation:number;hue:number;gamma:number;shadows:number;highlights:number;sweep:number;width:number;sharpen:number;threshold:number;equalize:number;invert:boolean};
 'detail.echo':{radius:number;contrast:number;grayscale:boolean};
 'inspection.histogram':{channel:number;start:number;end:number};
 'colors.stats':{mode:'min'|'avg'|'max';inclusive:boolean};
 'noise.planes':{channel:number;bit:number;filter:number};
 'noise.minmax':{channel:number;minimum:number;maximum:number;filter:number};
 'pixels.defects':{radius:number;threshold:number;spread:number;kind:number;mode:number};
}
export interface OriginalBytePatch {offset:number;deleteCount:number;bytes:Uint8Array;}
export interface DerivedOriginal {blob:Blob;sizeBytes:number;originalSizeBytes:number;edits:{offset:number;deleteCount:number;insertedBytes:number;outputOffset:number}[];provenance:Record<string,unknown>;metrics:Record<string,unknown>;}
export interface RasterExportRequest {surfaceId:string;revision:number;format?:'png'|'webp'|'avif'|'heic'|'tiff';compression?:number;quality?:number;chroma?:'420'|'422'|'444';lossless?:boolean;adaptive?:boolean;maximumMegapixels?:number;resize?:{width?:number;height?:number;algorithm?:'auto'|'lanczos3'|'area'|'nearest'};render?:{range?:[number,number];palette?:number[][];red?:boolean;overlaySurfaceId?:string;opacity?:number};maxBytes?:number;storage?:'auto'|'temporary';}
export interface RasterExport {id:string;revision:number;mime:'image/png'|'image/webp'|'image/avif'|'image/heic'|'image/tiff';format:'png'|'webp'|'avif'|'heic'|'tiff';width:number;height:number;byteLength:number;sha256:string;imageId:string;sourceSurfaceId:string;sourceSurfaceRevision:number;sourceFormat:'rgb8'|'mask8'|'rgb-flags8';provenance:Record<string,unknown>;metrics:Record<string,unknown>;}
export interface ScientificExportRequest {surfaceId:string;revision:number;format:'npz';storage?:'auto'|'memory'|'temporary';maxBytes?:number;temporarySessionId?:string;}
export interface ScientificExport extends Omit<RasterExport,'mime'|'format'|'sourceFormat'> {mime:'application/zip';format:'npz';}
export interface PrnuDatabaseExport {id:string;revision:number;mime:'application/x-hdf5';format:'hdf5';byteLength:number;sha256:string;imageId:string;provenance:Record<string,unknown>;metrics:Record<string,unknown>;}
export type SurfaceExport = RasterExport|ScientificExport;
export interface RasterExportPageRequest {exportId:string;revision:number;offset?:number;length?:number;}
export interface RasterExportPage {exportId:string;revision:number;offset:number;bytes:Uint8Array;totalBytes:number;nextOffset:number;done:boolean;mime:'image/png'|'image/webp'|'image/avif'|'image/heic'|'image/tiff'|'application/zip'|'application/json'|'application/x-hdf5';}
export interface Progress { id:string; phase:string; fraction?:number; completed?:number;total?:number;revision?:number;zone?:string;completedZones?:number;totalZones?:number;message?:string; }
export interface Hooks { signal?:AbortSignal; onProgress?:(event:Progress)=>void; }
export interface Input { id:string; bytes:Uint8Array; mime?:string; name?:string; lastModified?:number; pixels?:Pixels; provenance?:Record<string,unknown>; }
export interface D2prlRegion {id:string;kind:'region'|'envelope'|'whole-image';bounds:[number,number,number,number];}
export interface D2prlManifest {url:string;bytes:number;sha256:string;}
export type SegmentationVariant = 'mgcfdn-mpdn'|'mgcfdn-16'|'mgcfdn'|'mgcfdn-effnet'|'mgcfdn-st'|'mgcfdn-tnt'|'mgcfdn-vig'|'cmseg-generalization'|'cmseg-addnoise';
export interface SegmentationAsset {url:string;bytes:number;sha256:string;}
export interface SegmentationModelInput extends SegmentationAsset {variant:SegmentationVariant;gpu?:SegmentationAsset;}
export const SEGMENTATION_MODEL_IDENTITIES:Readonly<Record<SegmentationVariant,Readonly<{id:string;variant:string;side:number;kind:'sigmoid'|'softmax';bytes:number;sha256:string;checkpointSha256:string;status:string;cpuContinuousBitExact:false;family?:'cmseg'|'tnt'|'vig';backbone?:Readonly<{file:string;bytes:number;sha256:string}>;tail?:Readonly<{file:string;bytes:number;sha256:string}>;assetBytes?:number;gpu?:Readonly<{id:string;bytes:number;sha256:string;status:string;sharedAssets?:true;correlationGpuOnly?:true;residentCorrelation?:true;minimumResidentBytes?:number}>}>>>;
export const D2PRL_MODEL_IDENTITY:Readonly<{bytes:number;sha256:string;modelId:string;checkpointSha256:string;assets:number;assetBytes:number}>;
export type Task = { [K in keyof OperationParams]:{id:string;imageId:string;operation:K;params?:Partial<OperationParams[K]>;view?:K extends 'tampering.copyMove.sparse'?SparseView:{mode?:'overlay'|'map'|'mask'|'confidence'};backend?:'cpu'|'auto'|(K extends 'detail.frequency'|'ai.clones.d2prl'|'ai.clones.segmentation'|'tampering.copyMove.brisk'|'tampering.copyMove.orb'|'tampering.copyMove.akaze'|'tampering.copyMove.sparse'|'ai.sources.safire'|'ai.localization.focal'|'ai.localization.adaifl'?'webgpu':never);regions?:K extends 'ai.clones.d2prl'|'ai.clones.segmentation'?D2prlRegion[]:never[]} }[keyof OperationParams];
export interface Mask {width:number;height:number;format:'mask8';data:Uint8Array;range:number[];semantics:string;}
export interface Flags extends Omit<Mask,'format'> {format:'rgb-flags8';channelOrder:'RGB';}
export interface Result { id:string; imageId:string; operation:keyof OperationParams; status:'ok'|'no-regions'|'partial';analysisId?:string;selection?:AutomaticSelection; layout?:'surface'|'table';surface?:Surface|NumericSurface;planeSurfaces?:Record<string,NumericSurface>;rgbSurfaces?:Record<string,Surface>;maskSurfaces?:Record<string,MaskSurface>;flagSurfaces?:Record<string,FlagSurface>;tables?:Record<string,Table>;pixels?:Pixels; masks?:Record<string,Mask>; data?:Record<string,unknown>; layers:unknown[]; provenance:Record<string,unknown>; metrics:Record<string,unknown>; }
export class EngineError extends Error { code:string; }
export const DEFAULT_ELA_PARAMS:Readonly<ElaParams>;
export const DEFAULT_ENERGY_PROFILE:Readonly<{id:'standard';name:'Conservateur';percentiles:readonly number[];deviations:readonly number[];adaptive:false;available:true}>;
export function createEngine(options?:{memoryBudgetBytes?:number;cpuKernel?:'auto'|'single'|'reference';computeProfile?:'aggressive'|'maximum';resourceHints?:ResourceHints}):{
 updateResourceHints(hints:ResourceHints):{accepted:boolean;revision:number;budgetBytes:number;observation:Record<string,unknown>|null};
 capabilities():Record<string,unknown>;load(input:Input,hooks?:Hooks):Promise<Record<string,unknown>>;
 loadBlob(input:{id:string;blob:Blob;layout?:'auto'|'segmented';name?:string;mime?:string;lastModified?:number},hooks?:Hooks):Promise<Record<string,unknown>&{surface:Surface}>;
 readPlane(request:PixelWindow,hooks?:Hooks):Promise<{surfaceId:string;revision:number;origin:[number,number];plane:ScientificPlane;imageId:string;metrics:Record<string,unknown>}>;
 readDisplay(request:{surfaceId:string;revision:number;tile:{x:number;y:number;w:number;h:number;step:number};render?:{range?:[number,number];palette?:number[][];red?:boolean;overlaySurfaceId?:string;opacity?:number}},hooks?:Hooks):Promise<{pixels:Pixels;metrics:Record<string,unknown>}>;
 readPixels(request:PixelWindow,hooks?:Hooks):Promise<{surfaceId:string;revision:number;origin:[number,number];pixels:Pixels;imageId:string;metrics:Record<string,unknown>}>;
 readMask(request:PixelWindow,hooks?:Hooks):Promise<{surfaceId:string;revision:number;origin:[number,number];mask:Mask;imageId:string;metrics:Record<string,unknown>}>;
 readFlags(request:PixelWindow,hooks?:Hooks):Promise<{surfaceId:string;revision:number;origin:[number,number];flags:Flags;imageId:string;metrics:Record<string,unknown>}>;
 readTable(request:TableWindow,hooks?:Hooks):Promise<TablePage>;
 readTableCsv(request:TableWindow,hooks?:Hooks):Promise<TableCsvPage>;
 releaseTable(id:string):Promise<void>;
 releaseSurface(id:string):Promise<void>;
 inspectMetadata(input:{blob:Blob;mode?:'dump'|'location'|'headers'|'thumbnail';name?:string;mime?:string;lastModified?:number},hooks?:Hooks):Promise<{data:Record<string,unknown>;file:Record<string,unknown>;mode:string;warnings:string;metrics:Record<string,unknown>;semantics:string}>;
 inspectHeaders(input:{blob:Blob;name?:string;mime?:string;lastModified?:number},hooks?:Hooks):Promise<{header:Record<string,unknown>;file:Record<string,unknown>;metrics:Record<string,unknown>;semantics:string}>;
 reserveExternalMemory(request:{bytes:number}):{id:string;bytes:number}|Promise<{id:string;bytes:number}>;
 releaseExternalMemory(id:string):void|Promise<void>;
 exportPixelBuffer(request:{pixels:Pixels}&Omit<RasterExportRequest,'surfaceId'|'revision'>,hooks?:Hooks):Promise<RasterExport>;
 exportSurface(request:RasterExportRequest,hooks?:Hooks):Promise<RasterExport>;
 exportSurface(request:ScientificExportRequest,hooks?:Hooks):Promise<ScientificExport>;
 exportSurface(request:RasterExportRequest|ScientificExportRequest,hooks?:Hooks):Promise<SurfaceExport>;
 readExport(request:RasterExportPageRequest,hooks?:Hooks):Promise<RasterExportPage>;
 releaseExport(id:string):Promise<void>;
 originalBlob(id:string):Blob;
 deriveOriginal(request:{imageId:string;patches:OriginalBytePatch[]},hooks?:Hooks):Promise<DerivedOriginal>;
 readOriginal(id:string,range?:{offset?:number;length?:number},hooks?:Hooks):Promise<{offset:number;bytes:Uint8Array;totalBytes:number}>;
 loadPrnuDatabase(input:{id:string;fingerprintStorage?:'auto'|'memory'|'temporary';temporarySessionId?:string}&({bytes:Uint8Array;blob?:Blob}|{blob:Blob;bytes?:Uint8Array}),hooks?:Hooks):Promise<Record<string,unknown>>;
 loadMedianModel(input:{id:string;blob:Blob},hooks?:Hooks):Promise<Record<string,unknown>>;
 loadQualityModel(input:{id:string;blob:Blob},hooks?:Hooks):Promise<Record<string,unknown>>;
 loadAutomaticModels(input:{forgeryscope?:{assets:Record<string,NeuralAsset>;alikedSegments?:Record<string,unknown>;runtimes:Partial<Record<'wasm'|'webgpu',NeuralRuntime>>;preparationFactoryUrl:string;siftFactoryUrl:string;siftIdentity?:string}},hooks?:Hooks):Promise<Record<string,boolean>>;
 resumeAutomatic(request:{analysisId:string;groups?:string[]},hooks?:Hooks):Promise<Result>;
 updateAutomatic(request:{analysisId:string;filters?:AutomaticFilters;view?:AutomaticViewAction[]},hooks?:Hooks):Promise<Result>;
 renderAutomatic(request:{analysisId:string;layer?:'corroboration'|'ela-preview'|'energy-low'|'energy-high'},hooks?:Hooks):Promise<{surface:NumericSurface|Surface;analysisId:string;view:AutomaticViewState;layers:unknown[]}>;
 exportAutomatic(request:{analysisId:string;options?:Record<string,unknown>;storage?:'auto'|'memory'|'temporary';maxBytes?:number},hooks?:Hooks):Promise<AutomaticRuntimeExport>;
 releaseAutomatic():Promise<void>;
 readNpz(request:{surfaceId:string;revision:number;offset?:number;length?:number},hooks?:Hooks):Promise<Record<string,unknown>>;
 loadM3Models(input:M3Resources,hooks?:Hooks):Promise<Record<string,unknown>>;
 unloadM3Models():Promise<void>;
 loadD2prlModel(input:D2prlManifest,hooks?:Hooks):Promise<Record<string,unknown>>;
 loadSegmentationModel(input:SegmentationModelInput,hooks?:Hooks):Promise<Record<string,unknown>>;
 unloadSegmentationModel():Promise<void>;
 readSegmentationRaw(request:{imageId:string;resultId:string}):Result;
 unloadD2prlModel():Promise<void>;
 readD2prlRaw(request:{imageId:string;resultId:string}):Result;
 buildPrnuDatabase(input:{id:string;queryImageId:string;singleCamera?:string;outputLayout?:'auto'|'bytes'|'pages';fingerprintStorage?:'auto'|'memory'|'temporary';temporarySessionId?:string;files:(File|{name:string;blob:Blob})[]},hooks?:Hooks):Promise<Record<string,unknown>>;
 createPrnuDatabaseExport(id:string,hooks?:Hooks):Promise<PrnuDatabaseExport>;
 exportPrnuDatabase(id:string):{mime:'application/x-hdf5';bytes:Uint8Array};
 exportResultFile(result:Result,options?:{format?:'json';storage?:'auto'|'memory'|'temporary';maxBytes?:number},hooks?:Hooks):Promise<{id:string;revision:number;mime:'application/json';format:'json';byteLength:number;sha256:string;metrics:Record<string,unknown>}>;
 exportResult(result:Result,options?:{format?:'json'|'csv'|'npz';maxBytes?:number}):{mime:string;bytes:Uint8Array};
 run(task:Task,hooks?:Hooks):Promise<Result>;imagePixels(id:string):Pixels;original(id:string):Uint8Array;unload(id:string):void|Promise<void>;dispose():void|Promise<void>;
};
export function exportAnalysis(result:Result,options?:{format?:'json'|'csv'|'npz';maxBytes?:number}):{mime:string;bytes:Uint8Array};
export function resolveComputeProfile(id?:'aggressive'|'maximum',hints?:Record<string,number>):Record<string,unknown>;
export const COMPUTE_PROFILES:Readonly<Record<string,unknown>>;
export interface AnalysisRegion {id:string;bounds:[number,number,number,number];}
export interface AnalysisScopeRequest {imageId:string;width:number;height:number;generation:number;signal:AbortSignal;onProgress:(progress:unknown)=>void;}
export interface CompleteAnalysisRequest extends AnalysisScopeRequest {mode:'automatic'|'whole-image';restartAllBranches:true;regions:AnalysisRegion[];exclusions:[number,number,number,number][];}
export function createAnalysisScopeController(options:{imageId:string;width:number;height:number;detectSubimages:(request:AnalysisScopeRequest)=>Promise<AnalysisRegion[]>;analyze:(request:CompleteAnalysisRequest)=>Promise<unknown>;onEvent?:(event:Record<string,unknown>)=>void}):{
 getState():Record<string,unknown>;start():Promise<Record<string,unknown>>;useAutomaticRegions():Promise<Record<string,unknown>>;useWholeImage():Promise<Record<string,unknown>>;replaceExclusions(rectangles:[number,number,number,number][]):Promise<Record<string,unknown>>;cancel():Record<string,unknown>;dispose():void;
};
export interface ElaEnergyValues {histogramLow:number;histogramHigh:number;shadow:number;highlight:number;}
export interface ElaEnergyState {revision:number;profileId:string;adaptive:boolean;estimatePending:boolean;values:ElaEnergyValues;quantiles:[number,number];thresholds:[number,number];analysisAvailable:true;}
export interface ElaEnergyEstimateToken {revision:number;profileId:string;}
export function createElaEnergyControls():{
 snapshot():ElaEnergyState;beginManualEdit():ElaEnergyState;edit(patch:Partial<ElaEnergyValues>):ElaEnergyState;
 selectProfile(id:'standard'|'manual'|'conservative'|'sensitive'):ElaEnergyState&{estimateRequest:ElaEnergyEstimateToken|null};
 applySnapshot(profile:{id:string;values:ElaEnergyValues}):ElaEnergyState;
 acceptAutomatic(answer:ElaEnergyEstimateToken&{values:ElaEnergyValues}):boolean;
 accepts(answer:{revision:number}):boolean;
};

export interface NeuralAsset {url:string;bytes:number;sha256:string;checkpointSha256?:string;graphOptimizationLevel?:'disabled'|'basic'|'extended'|'all';qualification?:string;attentionLoops?:number;fusionLoops?:number;[key:string]:unknown;}
export interface NeuralRuntime {factoryUrl:string;ortUrl:string;wasmUrl:string;}
export interface NativeOrderNetwork {asset:NeuralAsset & {program:{url:string;bytes:number;sha256:string}};runtime:{executor:'noiseprint-plus';factoryUrl:string;wasmUrl:string};}
export interface NeuralOptions {signal?:AbortSignal;onProgress?:(event:{phase:string;fraction?:number;model?:string})=>void;backend?:'auto'|'cpu'|'webgpu';}
export interface TruForResult {
 data:{width:number;height:number;map:Float32Array;confidence:Float32Array;noiseprint_pp:Float32Array;score:number;metadata:Record<string,unknown>};
 provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():void;
}
export interface TruForSegmentedResult {
 data:{width:number;height:number;segmented:true;map:SegmentedNeuralField & {channels:number};confidence:SegmentedNeuralField & {channels:number};noiseprint_pp:SegmentedNeuralField & {channels:number};score:number;metadata:Record<string,unknown>};
 provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():Promise<void>;
}
export function createTruforAnalyzer(config:{asset:NeuralAsset;segments?:Record<string,unknown>;noiseprint?:NativeOrderNetwork;runtimes:Partial<Record<'wasm'|'webgpu',NeuralRuntime>>;budget?:unknown;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):{
 analyze(image:Pixels,params?:Record<string,never>,options?:NeuralOptions):Promise<TruForResult>;
 analyze(image:M2SegmentedImage,params?:Record<string,never>,options?:NeuralOptions):Promise<TruForSegmentedResult>;
 render(result:TruForResult|TruForSegmentedResult,view:'map'|'confidence'|'noiseprint_pp',options?:NeuralOptions):Promise<Pixels & {release():void}>;
 renderWindow(image:M2SegmentedImage,result:TruForSegmentedResult,view:'map'|'confidence'|'noiseprint_pp',rect:{x:number;y:number;width:number;height:number},options?:NeuralOptions):Promise<Pixels & {origin:[number,number];release():void}>;
 exportNpz(result:TruForResult):{mime:string;bytes:Uint8Array;release():void};
 clearCache():void|Promise<void>;dispose():void|Promise<void>;memory():Record<string,number>;
};
export interface SegmentedNumericField<T extends Float32Array|Float64Array|Uint8Array> {length:number;byteLength:number;BYTES_PER_ELEMENT:number;elementType:string;storage:string;readInto(target:T,offset?:number,options?:NeuralOptions):Promise<T>;readBytes(target:Uint8Array,offset?:number,options?:NeuralOptions):Promise<Uint8Array>;}
export interface CompositeStatisticsMetadata {statistics_policy?:'covariance-floor-v1';covariance_regularizations?:number;pca_regularized_components?:number;covariance_reference_scale?:number;[key:string]:unknown}
export interface CompositeSegmentedResult {data:{width:number;height:number;segmented:true;gray:SegmentedNumericField<Float32Array>;noise:SegmentedNumericField<Float32Array>;noise_rgb:SegmentedNumericField<Uint8Array>;model:number;map?:Float64Array;map_rgb?:SegmentedNumericField<Uint8Array>;raster?:SegmentedNumericField<Uint8Array>;metadata:CompositeStatisticsMetadata;[key:string]:unknown};mapError?:{code:string;message:string};provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():Promise<void>;}
export interface CompositeResult {data:{width:number;height:number;gray:Float32Array;noise:Float32Array;noise_rgb:Uint8Array;model:number;map?:Float64Array;map_rgb?:Uint8Array;mapShape?:number[];metadata:CompositeStatisticsMetadata;[key:string]:unknown};mapError?:{code:string;message:string};provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():void;}
export function createCompositeAnalyzer(config:{segmentedStorage?:'auto'|'memory'|'temporary';assets:Record<string,NeuralAsset>;runtimes:Partial<Record<'wasm'|'webgpu',NeuralRuntime>>;statisticsRuntime:{url:string;sourceSha256:string;downloadBytes:number;statisticsPolicy?:'covariance-floor-v1'};budget?:unknown;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):{
 analyze(image:Pixels,params?:{quality?:number;stage?:'noise'|'map';memoryBounded?:boolean},options?:NeuralOptions):Promise<CompositeResult>;
 analyze(image:M2SegmentedImage,params?:{quality?:number;stage?:'noise'|'map';memoryBounded?:true},options?:NeuralOptions):Promise<CompositeSegmentedResult>;
 render(result:CompositeSegmentedResult,view?:'noise'|'map'):Promise<Pixels & {release():void}>;
 renderWindow(image:M2SegmentedImage,result:CompositeSegmentedResult,view:'noise'|'map',rect:{x:number;y:number;width:number;height:number},options?:NeuralOptions):Promise<Pixels & {origin:[number,number];release():void}>;
 render(result:CompositeResult,view?:'noise'|'map'):Pixels & {release():void};
 exportNpz(result:CompositeResult):{mime:string;bytes:Uint8Array;release():void};clearCache():Promise<void>;dispose():Promise<void>;memory():Record<string,number>;
};
export interface SegmentedNeuralField {width:number;height:number;length:number;byteLength:number;storage:string;readInto(target:Float32Array,offset?:number,options?:NeuralOptions):Promise<Float32Array>;readBytes(target:Uint8Array,offset?:number,options?:NeuralOptions):Promise<Uint8Array>;}
export interface M2SegmentedImage {segmented:true;surface:{descriptor:Surface;readWindow(rect:{x:number;y:number;width:number;height:number},options?:NeuralOptions):Promise<{pixels:Pixels;release():void}>};source:unknown;store:unknown;sha256:string;}
export interface CatnetSegmentedResult {data:{width:number;height:number;segmented:true;map:SegmentedNeuralField;native_map:SegmentedNeuralField;nativeShape:number[];metadata:Record<string,unknown>};provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():Promise<void>;}
export interface CatnetResult {data:{width:number;height:number;map:Float32Array;native_map:Float32Array;nativeShape:number[];metadata:Record<string,unknown>};provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():void;}
export function createCatnetAnalyzer(config:{segments?:Record<string,unknown>;assets?:Partial<Record<'standard'|'bounded'|'compact',NeuralAsset>>;runtimes:Partial<Record<'wasm'|'webgpu',NeuralRuntime>>;jpegFactory:(options:Record<string,unknown>)=>Promise<unknown>;budget?:unknown;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):{
 analyze(image:Pixels,params?:{sourceBytes?:Uint8Array;memoryBounded?:boolean},options?:NeuralOptions):Promise<CatnetResult>;
 analyze(image:M2SegmentedImage,params?:{memoryBounded?:true},options?:NeuralOptions):Promise<CatnetSegmentedResult>;
 renderWindow(image:M2SegmentedImage,result:CatnetSegmentedResult,mode:0|1|2,rect:{x:number;y:number;width:number;height:number},options?:NeuralOptions):Promise<Pixels & {origin:[number,number];release():void}>;
 render(image:Pixels,result:CatnetResult,mode?:0|1,options?:NeuralOptions):Promise<Pixels & {release():void}>;
 exportNpz(result:CatnetResult):{mime:string;bytes:Uint8Array;release():void};clearCache():Promise<void>;dispose():Promise<void>;memory():Record<string,number>;
};
export interface CfaResult {data:{width:number;height:number;probabilities:Float32Array;grids:Float32Array;local_grid:Uint8Array;suspicion:Float32Array;gridShape:[number,number];metadata:Record<string,unknown>};provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():void;}
export function createCfaAnalyzer(config:{assets:Record<'Original'|'JPEG 95'|'Sans JPEG',NeuralAsset & {program:{url:string;bytes:number;sha256:string};wasmMaximumBytes:2147483648}>;runtimes:{wasm:{executor:'cfa';factoryUrl:string;wasmUrl:string}};budget?:unknown;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):{
 analyze(image:Pixels,params?:{variant?:'Original'|'JPEG 95'|'Sans JPEG';block?:number;tile?:number},options?:NeuralOptions):Promise<CfaResult>;
 render(image:Pixels,result:CfaResult,mode?:0|1|2,options?:NeuralOptions):Promise<Pixels & {release():void}>;
 exportNpz(result:CfaResult):{mime:string;bytes:Uint8Array;release():void};clearCache():void;dispose():void;memory():Record<string,number>;
};
export interface ForgeryscopeResult {width:number;height:number;mask:Uint8Array;map:Float32Array;candidates:Uint8Array;geometric?:Uint8Array;branch_microscopy?:Uint8Array;branch_blots?:Uint8Array;branch_lanes?:Uint8Array;metadata:Record<string,unknown>;provenance:Record<string,unknown>;metrics:Record<string,unknown>;release():void;}
export type ForgeryscopeSegmentedResult = Omit<ForgeryscopeResult,'mask'|'map'|'candidates'|'geometric'|'branch_microscopy'|'branch_blots'|'branch_lanes'> & {mask:SegmentedNumericField<Uint8Array>;map:SegmentedNumericField<Float32Array>;candidates:SegmentedNumericField<Uint8Array>;geometric?:SegmentedNumericField<Uint8Array>;branch_microscopy?:SegmentedNumericField<Uint8Array>;branch_blots?:SegmentedNumericField<Uint8Array>;branch_lanes?:SegmentedNumericField<Uint8Array>};
export function createForgeryscopeAnalyzer(config:{assets:Record<string,NeuralAsset>;alikedSegments?:{assets:Record<string,NeuralAsset>};runtimes:Partial<Record<'wasm'|'webgpu',NeuralRuntime>>;preparationFactory:(options:Record<string,unknown>)=>Promise<unknown>;siftFactory?:(options:Record<string,unknown>)=>Promise<unknown>;siftIdentity?:string;sift?:unknown;budget?:unknown;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):{
 analyze(image:Pixels,params?:{profile?:'auto'|'microscopy'|'duplicate'|'overlap'|'lanes';panels?:[string,number,number,number,number,number][];exclusions?:[number,number,number,number][]},options?:NeuralOptions):Promise<ForgeryscopeResult>;
 analyze(image:M2SegmentedImage,params?:{profile?:'auto'|'microscopy'|'duplicate'|'overlap'|'lanes';panels?:[string,number,number,number,number,number][];exclusions?:[number,number,number,number][]},options?:NeuralOptions):Promise<ForgeryscopeSegmentedResult>;
 exportNpz(result:ForgeryscopeResult):{mime:string;bytes:Uint8Array;release():void};clearCache():void;dispose():void;memory():Record<string,number>;
};

export interface M2WorkerResult {id:number;method:'forgeryscope'|'trufor'|'composite'|'catnet'|'cfa';width:number;height:number;fields:Record<string,{type:string;length:number;byteLength:number;storage?:string}>;metadataBytes:number;memory:Record<string,number>;}
export interface M2WorkerExport {id:number;bytes:number;mime?:string;type?:'rgb8';width?:number;height?:number;origin?:[number,number];}
/** Method configs use preparationFactoryUrl/siftFactoryUrl/jpegFactoryUrl instead of functions. */
export function createM2WorkerClient(config:{methods:Partial<Record<M2WorkerResult['method'],Record<string,unknown>>>;memoryBudgetBytes?:number;computeProfile?:'aggressive'|'maximum';resourceHints?:Record<string,number>}):Promise<{
 ready:{profile:Record<string,unknown>;memory:Record<string,number>;windowBytes:number};
 analyze(method:M2WorkerResult['method'],image:Pixels,params?:Record<string,unknown>,options?:NeuralOptions & {transferSource?:boolean}):Promise<M2WorkerResult>;
 analyzeBlob(method:'cfa'|'trufor'|'catnet'|'composite'|'forgeryscope',blob:Blob,params?:Record<string,unknown>,options?:NeuralOptions):Promise<M2WorkerResult>;
 readDisplay(resultId:number,view:string|number,tile:{x:number;y:number;w:number;h:number;step:number},options?:Record<string,unknown>):Promise<{pixels:Pixels;metrics:Record<string,unknown>}>;
 renderWindow(resultId:number,view:string|number,rect:{x:number;y:number;width:number;height:number},options?:Record<string,unknown>):Promise<M2WorkerExport>;
 readArray(resultId:number,field:string,offset:number,count:number):Promise<ArrayBufferView>;
 metadata(result:M2WorkerResult):Promise<Record<string,unknown>>;
 render(resultId:number,view:string|number,options?:Record<string,unknown>):Promise<M2WorkerExport>;
 beginExport(resultId:number,options?:{signal?:AbortSignal;onProgress?:(event:unknown)=>void}):Promise<M2WorkerExport>;readExport(exportId:number,offset:number,count:number):Promise<Uint8Array>;releaseExport(exportId:number):Promise<boolean>;
 exportTo(resultId:number,writable:WritableStream<Uint8Array>,options?:{signal?:AbortSignal}):Promise<{mime:string;bytes:number}>;
 release(resultId:number):Promise<boolean>;clearCache():Promise<Record<string,number>>;memory():Promise<Record<string,number>>;dispose():Promise<unknown>;
}>;
export const SPARSE_COPY_ALGORITHMS:readonly SparseParams['algorithm'][];
export function sparseCopyParams(input?:Partial<SparseParams>):SparseParams;
export function sparseCopyViewParams(input?:SparseView):Required<SparseView>;
export interface M3GraphIdentity {file?:string;bytes:number;sha256:string;}
export const SAFIRE_MODEL:Readonly<{weightSha256:string;graphs:Record<string,M3GraphIdentity>}>;
export const FOCAL_MODEL:Readonly<{weights:Record<string,string>;graphs:Record<string,M3GraphIdentity>}>;
export const ADAIFL_MODEL:Readonly<{weight:M3GraphIdentity;graphs:Record<string,M3GraphIdentity>}>;
export const XFEAT_PAGED_MODEL:Readonly<M3GraphIdentity&{weightSha256:string;file:string}>;
export const XFEAT_MODEL:Readonly<M3GraphIdentity&{weightSha256:string}>;
export const ALIKED_MODELS:Readonly<Record<string,{weightSha256:string;graphs:Record<string,M3GraphIdentity>}>>;
export const SPARSE_GLUE_PAGED_MODELS:Readonly<Record<string,M3GraphIdentity&{weightSha256:string;layers:number;heads:number;dim:number}>>;
export const SPARSE_GLUE_MODELS:Readonly<Record<string,M3GraphIdentity&{weightSha256:string}>>;
export {createCloneCorroboration,colorizeCounts,COUNT_COLORS} from './clone-corroboration.js';
export {annotateRelations,pairRelations,visibleCloneEntries,biomePaintOrder,CLONE_SOURCES,CLASSICAL_SOURCES,AI_SOURCES,ELA_SOURCE} from './clone-relations.js';
export {createAutomaticAnalysisView} from './automatic-analysis-view.js';
export {createAutomaticAnalyzer} from './automatic-analyzer.js';
export type {AutomaticAnalyzer,AutomaticFrame,AutomaticFilters,AutomaticState,AutomaticArchive,AutomaticHooks} from './automatic-analyzer.js';
export type {CloneEntry,CloneViewOptions} from './clone-relations.js';
export type {CorroborationRequest,CountPlane,SharedCompositionBudget} from './clone-corroboration.js';

export function pipeRasterExport(engine:{readExport(request:RasterExportPageRequest,hooks?:Hooks):Promise<RasterExportPage>;releaseExport(id:string):Promise<void>},descriptor:Pick<SurfaceExport,'id'|'revision'|'byteLength'>,writable:WritableStream<Uint8Array>,hooks?:Hooks&{release?:boolean}):Promise<void>;

export interface AutomaticSelection {regions:Polygon[];envelope?:Polygon|null;disabled?:number[];}
export interface AutomaticRuntimeParams {selection?:AutomaticSelection;d2Minimum?:number;maxConcurrent?:number;ela?:{cellParams?:Partial<OperationParams['ela.biomes']>;energyParams?:Partial<OperationParams['ela.energy']>;storage?:'auto'|'memory'|'temporary'};}
export type AutomaticViewAction = {method:'selectTab'|'setPresentation'|'setRelation'|'setOpacity'|'setEla'|'setElaFamilies'|'setForgeryscopeBranch'|'setEnabledSources'|'setHidden'|'focus'|'setD2prlMinimum';value:unknown};
export interface AutomaticRuntimeExport extends Omit<ScientificExport,'sourceSurfaceId'|'sourceSurfaceRevision'> {analysisId:string;}

/** Optional dated host observation, never an allocation guarantee. */
export interface ResourceHints {deviceMemoryGiB?:number;heapLimitBytes?:number;hardwareConcurrency?:number;systemMemoryCapacityBytes?:number;systemMemoryAvailableBytes?:number;systemMemoryObservedAt?:number}
export interface BrowserMemoryObservation {deviceMemoryGiB:number|null;jsHeapSizeLimit:number|null;reportedUsedJSHeapSize:number|null;reportedTotalJSHeapSize:number|null;availableAllocationBytes:null;scope:string;measurement:'metadata-only'}
export function browserMemoryObservation(options?:{performanceObject?:unknown;navigatorObject?:unknown}):BrowserMemoryObservation;
export function readSystemMemoryHints(systemMemory?:{getInfo():Promise<{capacity:number;availableCapacity:number}>}):Promise<Pick<ResourceHints,'systemMemoryCapacityBytes'|'systemMemoryAvailableBytes'|'systemMemoryObservedAt'>|null>;
export function readExtensionMemoryHints(extensionId:string,options?:{runtime?:{sendMessage(id:string,message:{type:string},callback:(response:unknown)=>void):void;lastError?:{message?:string}}}):ReturnType<typeof readSystemMemoryHints>;

/** Direct native PatchMatch operation, available through run(). All six dense profiles,
 * full-frame/independent/compare polygons; surface retains complete scientific fields.
 * Export them with exportSurface({surfaceId,revision,format:'npz'}) and readExport(). */
export type DenseCopyProfile = 'PatchMatch Zernike' | 'PatchMatch SIFT' | 'PatchMatch Zernike + PatchMatch SIFT' | 'Extended: PatchMatch Zernike + PatchMatch SIFT' | 'PatchMatch Zernike + PatchMatch SIFT + Mirror' | 'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror';
