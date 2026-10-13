import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {rasterOptions} from '../sherloq-browser/assets/raster-export-client.js';
import {exportDefaults,linkedExportSize} from '../sherloq-browser/assets/media-settings.js';
import {analysisReportFilename,analysisImageFilename,analysisArtifactFilename} from '../sherloq-browser/assets/report-export-name.js';

test('a sparse tool container names the actual retained PatchMatch dense result and profile',()=>{
 const report={operation:'tampering.copyMove.dense',status:'ok',provenance:{operation:'tampering.copyMove.dense',params:{profile:'PatchMatch Zernike',patch:8,iterations:8}}},before=structuredClone(report);
 assert.equal(analysisReportFilename(report,{fallbackOperation:'tampering.copyMove.sparse'}),'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike-report.json');assert.deepEqual(report,before);
});
test('a neural tool container identifies successful variants and the actual captured failed SelfDM operation',()=>{
 const failure={operation:'ai.clones.segmentation',status:'error',context:{operation:'ai.clones.segmentation',parameters:{variant:'selfdm-proposal'}},error:{code:'INVALID_INPUT',message:'Unload the configured segmentation model before changing it'}},before=structuredClone(failure);
 assert.equal(analysisReportFilename(failure,{fallbackOperation:'ai.clones.d2prl'}),'SHERLOQ-ai.clones.segmentation-selfdm-proposal-report.json');assert.deepEqual(failure,before);
 assert.equal(analysisReportFilename({operation:'ai.clones.segmentation',provenance:{params:{variant:'mgcfdn-mpdn'}}},{fallbackOperation:'ai.clones.d2prl'}),'SHERLOQ-ai.clones.segmentation-mgcfdn-mpdn-report.json');
 assert.equal(analysisReportFilename({operation:'ai.clones.d2prl'}),'SHERLOQ-ai.clones.d2prl-report.json');
});
test('operation and method come from recorded provenance before UI fallback and filenames remain portable',()=>{
 assert.equal(analysisReportFilename({provenance:{operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT + G2NN + RANSAC'}}}),'SHERLOQ-tampering.copyMove.sparse-SIFT-+-G2NN-+-RANSAC-report.json');
 assert.equal(analysisReportFilename({context:{operation:'m2.forgeryscope',parameters:{profile:'auto'}}}),'SHERLOQ-m2.forgeryscope-auto-report.json');
 assert.equal(analysisReportFilename({operation:'ai.clones.segmentation'}),'SHERLOQ-ai.clones.segmentation-report.json');
 assert.equal(analysisReportFilename(null,{fallbackOperation:'analysis.original'}),'SHERLOQ-analysis.original-report.json');
 const name=analysisReportFilename({operation:'ai.clones.segmentation',provenance:{params:{variant:'../a/b:*?"<>|\u0000'}}});assert.doesNotMatch(name,/[\\/:*?"<>|\x00-\x1f\x7f]/);assert.ok(name.endsWith('-report.json'));
});
test('the actual app report action uses the retained snapshot and preserves the report body and existing automatic/composite routing',async()=>{
 const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),action=source.slice(source.indexOf("$('export-report').onclick="),source.indexOf("$('save-session').onclick="));
 assert.ok(action.includes('analysisReportFilename(resultMeta,{fallbackOperation:activeAnalysis})'));assert.ok(action.includes('report:{...resultMeta,'));assert.ok(action.includes("automaticMode()?'SHERLOQ-automatic-report.json'"));assert.ok(action.includes("compositeMode()?'SHERLOQ-composite-report.json'"));assert.equal(action.includes("'SHERLOQ-'+activeAnalysis+'-report.json'"),false);
});

test('each raster codec names the retained operation and reliable native method without altering evidence',()=>{
 const report={operation:'tampering.copyMove.dense',provenance:{params:{profile:'PatchMatch Zernike'}}},before=structuredClone(report);
 for(const format of ['png','webp','avif','heic','tiff'])assert.equal(analysisImageFilename(report,{fallbackOperation:'tampering.copyMove.sparse',format}),'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike.'+format);
 assert.equal(analysisImageFilename({operation:'ai.clones.segmentation',provenance:{params:{variant:'mgcfdn-st'}}},{fallbackOperation:'ai.clones.d2prl',format:'png'}),'SHERLOQ-ai.clones.segmentation-mgcfdn-st.png');
 assert.equal(analysisImageFilename(report,{format:'webp',original:true}),'SHERLOQ-original.webp');assert.deepEqual(report,before);
});
test('the shipped raster action captures its result identity before the export dialogue and leaves codecs unchanged',async()=>{
 const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),action=source.slice(source.indexOf('async function exportImage('),source.indexOf("$('export-png').onclick="));
 assert.ok(action.includes('exportMeta=resultMeta,exportOperation=activeAnalysis'));assert.ok(action.includes('analysisImageFilename(exportMeta,{fallbackOperation:exportOperation,format:options.format,original:host.sourceOnly||target===source})'));assert.ok(action.includes('ensureIndividualClient()).export(options.format,target.display,options)'));assert.ok(action.includes('exportPresentationRaster(target,options,'));assert.equal(action.includes("'SHERLOQ-'+(host.sourceOnly?'original':activeAnalysis)"),false);
});

test('the real exportImage action downloads the current Dense PNG and keeps the encoder contract',async()=>{
 const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function exportImage(settingsOverride){'),source.indexOf("$('export-png').onclick="));
 const nodes=new Map(),calls=[],downloads=[],blob=new Blob([Uint8Array.of(137,80,78,71)]),cleanup=async()=>{},artifact={blob,storage:'opfs',cleanup},original={width:659,height:676,display:{id:'original',revision:1,format:'rgb8',chroma:'444'}},result={width:659,height:676,display:{id:'dense-current',revision:1,format:'rgb8'}},report={operation:'tampering.copyMove.dense',provenance:{params:{profile:'PatchMatch Zernike',patch:8}}},before=structuredClone(report);
 const sandbox={analysisImageFilename,rasterOptions,exportDefaults,linkedExportSize,AbortController,host:{},source:original,result,resultMeta:report,activeAnalysis:'tampering.copyMove.sparse',revision:9,exportController:null,engineCapabilities:null,localMagnifier:()=>false,individualMode:()=>true,automaticMode:()=>false,compositeMode:()=>false,$:id=>{if(!nodes.has(id))nodes.set(id,{value:'result',disabled:false});return nodes.get(id);},controls(){},status(){},t:key=>key,setTimeout(){},download:(output,name,options)=>downloads.push({output,name,options}),ensureIndividualClient:async()=>({async export(format,descriptor,options){calls.push({format,descriptor,options});return artifact;}})};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);await sandbox.exportImage({...exportDefaults,format:'png',pngCompression:8});
 assert.equal(downloads[0].name,'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike.png');assert.equal(downloads[0].output,artifact);assert.equal(downloads[0].output.blob,blob);assert.equal(downloads[0].output.cleanup,cleanup);assert.equal(downloads[0].output.storage,'opfs');assert.ok(downloads[0].options.signal instanceof AbortSignal);assert.equal(downloads[0].options.signal.aborted,false);assert.equal(calls[0].format,'png');assert.equal(calls[0].descriptor,result.display);assert.equal(calls[0].options.compression,8);assert.deepEqual(report,before);
 // An open export dialogue retains the result it was opened for, even if a
 // caller subsequently replaces the UI's current result metadata.
 let pending;sandbox.host.requestExport=task=>pending=task;await sandbox.exportImage();sandbox.resultMeta={operation:'ai.clones.segmentation',provenance:{params:{variant:'selfdm-map'}}};sandbox.activeAnalysis='ai.clones.d2prl';await pending({...exportDefaults,format:'webp'});
 assert.equal(downloads[1].name,'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike.webp');assert.equal(downloads[1].output,artifact);
 sandbox.$('layer').value='source';await sandbox.exportImage({...exportDefaults,format:'tiff'});assert.equal(downloads[2].name,'SHERLOQ-original.tiff');assert.equal(calls[2].descriptor,original.display);
});

test('native panel JSON, NPZ and table filenames share actual method identity and portable suffixes',()=>{
 const result={operation:'tampering.copyMove.dense',provenance:{params:{profile:'PatchMatch Zernike'}}};
 for(const format of ['json','npz','csv'])assert.equal(analysisArtifactFilename(result,{format,fallbackOperation:'tampering.copyMove.sparse'}),'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike.'+format);
 assert.equal(analysisArtifactFilename(result,{format:'csv',suffix:'points:/1'}),'SHERLOQ-tampering.copyMove.dense-PatchMatch-Zernike-points__1.csv');
});
