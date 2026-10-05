import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),p=new URL('docs/engine-registry.json',root),registry=JSON.parse(await readFile(p));
const entries={
 '0:0':['imagePixels','metadata-reference + image-codec-reference','35 new native decodes exact; four TIFF orientations explicitly rejected','Original encoded bytes and RGB8 analysis accessor; qualified EXIF JPEG/PNG/TIFF'],
 '0:1':['file.digest','image-hash-reference + digest.test','30 independent cryptographic cases and 36 perceptual outputs exact; two image hash algorithms rejected','Ten cryptographic digests, four perceptual hashes; other hashes and filename ballistics unavailable'],
 '0:2':['file.hex','metadata-tools.test','Byte window exact','Read-only byte window; interactive editing unavailable'],
 '1:0':['metadata.structure','metadata-reference + metadata-tools.test','Bounded structural parser; not full ExifTool parity','JPEG/PNG/TIFF structure and supported numeric EXIF tags'],
 '1:2':['metadata.thumbnail','exif-tools-reference','Embedded bytes, Lanczos4 resize and difference exact','Supported embedded JPEG thumbnail'],
 '1:3':['metadata.location','exif-tools-reference','Synthetic GPS rationals exact','EXIF GPS subset; no network or inferred location'],
 '2:0':['inspection.magnifier','magnifier-reference','440 output/bounds cases exact','Clipped ROI equalization and auto contrast; half-open bounds'],
 '2:2':['inspection.adjust','opencv-reference','510 outputs exact','All native adjustment controls in their original order'],
 '3:3':['detail.frequency','frequency-reference + frequency-large-reference','4368 images and base float32 values exact; 132 GPU masks exact','DFT, split/smooth/threshold, four views, display filter; base/mask/analysis caches'],
 '3:2':['detail.wavelets','wavelet-reference','3380 outputs exact','All 59 UI wavelets, five thresholds, levels, float64 symmetric reconstruction; decomposition cache'],
 '4:0':['colors.plots','plots-reference','1674 views exact, all values/axes/colors/alpha','Native pyrDown and RGB/HSV points; graph UI and vector export pending'],
 '4:2':['colors.pca','pca-reference','360 displays and all model values exact','All three components/modes/invert/equalize; shared float64 basis'],
 '5:3':['noise.blocking','blocking-reference','1094 displays/noise maps exact; grayscale and db8 details exact','Original-file grayscale, block median / 0.6745, native normalization and nearest display'],
 '3:0':['detail.gradient','opencv-reference','640 outputs exact','All gradient views and parameters'],
 '3:1':['detail.echo','opencv-reference','900 outputs exact','All radii 1–15 and contrast/gray controls'],
 '4:1':['colors.space','opencv-reference','290 outputs exact','Nine color-space families and all channels'],
 '5:0':['noise.separation','opencv-reference','1680 outputs exact','Median/Gaussian/Box/Bilateral/NLM; residual and denoised views'],
 '6:0':['jpeg.quality','quality-reference','600 raw means and table estimates exact; curve <=1e-12','Quantization and recompression curves; learned non-JPEG predictor unavailable'],
 '9:1':['various.illuminant','illuminant-reference','1440 displays/counts/validity exact; numeric <=1e-12','Three estimators, four cell sizes, transfer/exclusion switches and all views']
};
for(const row of registry.panels){const entry=entries[row.nativeId];if(!entry)continue;const [operation,reference,errors,cpu]=entry;Object.assign(row,{status:'partial',operation,cpu,gpu:'not selected; no speedup measured for this operation',data:'Synthetic publicable fixtures only',reference,errors,measurements:'docs/extended-browser-*-proof.json: correctness RPC totals, not isolated benchmarks',integration:row.nativeId==='0:0'?'Original accessor already integrated by B; new format UI pending':'Portable worker validated; WordPress controls/rendering pending',deviceLimits:'Browser memory admission; single-thread WASM; physical mobile and native Safari not tested',tests:'44 Node tests plus extended real-worker browser corpus; see EXTENDED-ENGINES.md'});}
Object.assign(registry.panels.find(row=>row.nativeId==='3:3'),{gpu:'Gaussian mask only; runtime rounding probes and median benefit gate; CPU override retained',measurements:'frequency-benchmark.json: 1 MP RPC median 21604.9 ms CPU / 301.5 ms hybrid; exact recorded outputs',tests:'44 Node tests; 4368 images under Chrome/Firefox/WebKit; frequency lifecycle and GPU corpus',deviceLimits:'GPU implementation qualification required; Firefox test uses CPU; physical mobile/Safari untested'});
await writeFile(p,JSON.stringify(registry,null,2)+'\n');
const lines=['# Browser engine register','','All 50 native panels remain individually enumerated. A partial status means callable','qualified subsets; it does not claim every sub-engine or WordPress panel is complete.','Sources, functions and choices: native-inventory.json. Controls/evidence for new tools:','EXTENDED-ENGINES.md. Presence of native weights does not prove browser conversion.','','| ID | Panel | Browser status | Native variants |','| --- | --- | --- | --- |'];for(const row of registry.panels)lines.push(`| ${row.nativeId} | ${row.panel} | ${row.status} | ${row.variants.replaceAll('|','/')} |`);await writeFile(new URL('docs/ENGINE-REGISTER.md',root),lines.join('\n')+'\n');
