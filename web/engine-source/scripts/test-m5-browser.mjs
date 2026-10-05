import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),types={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M5 isolated tests</title>');return;}const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error('Outside root');const bytes=await readFile(p);res.setHeader('Content-Type',types[path.extname(p)]??'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const suites={
 'jpeg-gray-stored':['jpeg-gray-stored-browser.js','jpegGrayStoredBrowserTest'],
 'temporary-storage':['temporary-storage-browser.js','temporaryStorageBrowserTest'],
 'automatic-ela-provider-indexeddb':['automatic-ela-provider-browser.js','automaticElaProviderIndexedDbBrowserTest'],
 'automatic-ela-provider':['automatic-ela-provider-browser.js','automaticElaProviderBrowserTest'],
 'automatic-export-indexeddb':['automatic-export-browser.js','automaticExportIndexedDbBrowserTest'],
 'automatic-export':['automatic-export-browser.js','automaticExportBrowserTest'],
 'automatic-npz':['automatic-npz-browser.js','automaticNpzBrowserTest'],
 'automatic-ela':['automatic-ela-browser.js','automaticElaBrowserTest'],
 'clone-entries':['clone-entries-browser.js','cloneEntriesBrowserTest'],
 'thumbnail-fallback':['thumbnail-api-browser.js','thumbnailFallbackBrowserTest'],
 'thumbnail-api-large':['thumbnail-api-browser.js','thumbnailApiLargeBrowserTest'],
 'thumbnail-api':['thumbnail-api-browser.js','thumbnailApiBrowserTest'],
 'thumbnail-stream':['thumbnail-stream-browser.js','thumbnailStreamBrowserTest'],
 'energy-stream-pool':['energy-stream-pool-browser.js','energyStreamPoolBrowserTest'],
 'segmented-energy':['segmented-energy-browser.js','segmentedEnergyBrowserTest'],
 'energy-prepare-stream':['energy-prepare-stream-browser.js','energyPrepareStreamBrowserTest'],
 'energy-statistics-stream':['energy-statistics-stream-browser.js','energyStatisticsStreamBrowserTest'],
 'zero-stream-pool':['zero-stream-pool-browser.js','zeroStreamPoolBrowserTest'],
 'segmented-zero':['segmented-zero-browser.js','segmentedZeroBrowserTest'],
 'zero-region-stream':['zero-region-stream-browser.js','zeroRegionStreamBrowserTest'],
 'zero-stream':['zero-stream-browser.js','zeroStreamBrowserTest'],
 'segmented-biomes-ghost':['segmented-biomes-ghost-browser.js','segmentedBiomesGhostBrowserTest'],
 'segmented-biomes':['segmented-biomes-browser.js','segmentedBiomesBrowserTest'],
 'ela-cell-stream':['ela-cell-stream-browser.js','elaCellStreamBrowserTest'],
 'energy-stream':['energy-stream-browser.js','energyStreamBrowserTest'],
 'ghost-stream-pool':['ghost-stream-pool-browser.js','ghostStreamPoolBrowserTest'],
 'segmented-ghost':['segmented-ghost-browser.js','segmentedGhostBrowserTest'],
 'segmented-ela':['segmented-ela-browser.js','segmentedElaBrowserTest'],
 'raster-export':['raster-export-browser.js','rasterExportBrowserTest'],
 'tiff-stream':['tiff-stream-browser.js','tiffStreamBrowserTest'],
 'png-stream':['png-stream-browser.js','pngStreamBrowserTest'],
 'digest-stream':['digest-stream-browser.js','digestStreamBrowserTest'],
 bigtiff:['bigtiff-browser.js','bigtiffBrowserTest'],
 'tiff-formats':['tiff-formats-browser.js','tiffFormatsBrowserTest'],
 exiftool:['exiftool-browser.js','exiftoolBrowserTest'],
 'segmented-recompression-pool':['segmented-recompression-pool-browser.js','segmentedRecompressionPoolBrowserTest'],
 'header-inspection':['header-inspection-browser.js','headerInspectionBrowserTest'],
 'segmented-recompression':['segmented-recompression-browser.js','segmentedRecompressionBrowserTest'],
 c2pa:['c2pa-browser.js','c2paBrowserTest'],
 'png-exif':['png-exif-browser.js','pngExifBrowserTest'],
 'derive-original':['derive-original-browser.js','deriveOriginalBrowserTest'],
 composition:['composition-browser.js','compositionBrowserTest'],
 recompression:['recompression-browser.js','recompressionBrowserTest'],
 'ela-peers':['ela-peer-browser.js','elaPeerBrowserTest'],
 'ela-describe':['ela-describe-fixture.js','checkElaDescribe'],
 'ela-pipeline':['ela-pipeline-browser.js','elaPipelineBrowserTest'],
 'source-file':['source-file-browser.js','sourceFileBrowserTest'],
 'digest-extra':['digest-extra-browser.js','digestExtraBrowserTest'],
 'png-formats':['png-formats-browser.js','pngFormatsBrowserTest']
};
const [name,suite]=Object.entries(suites).find(([key])=>process.argv.includes('--'+key))??['composition',suites.composition];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const outside=[];if(name==='header-inspection')page.context().on('request',request=>{if(/\.wasm(?:$|\?)/.test(request.url()))outside.push(request.url());});if(['c2pa','exiftool'].includes(name))page.context().on('request',request=>{const url=request.url();if(/^https?:/.test(url)&&!url.startsWith(`http://127.0.0.1:${server.address().port}/`))outside.push(url);});await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async([file,fn])=>{
  const module=await import('/tests/'+file);
  return fn==='checkElaDescribe'?module[fn]({load:async name=>new Uint8Array(await(await fetch('/tests/data/'+name)).arrayBuffer())}):module[fn]();
 },suite);
 if(name==='header-inspection'){if(outside.length)throw Error('Header inspection loaded a WASM codec');result.codecWasmRequests=outside;}
 if(['c2pa','exiftool'].includes(name)){if(outside.length)throw Error(name+' attempted external network: '+outside.join(', '));result.networkRequestsOutsideTestOrigin=outside;}
 result.browser=browser.version();await writeFile(path.join(root,'docs/'+name+'-chrome-proof.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
