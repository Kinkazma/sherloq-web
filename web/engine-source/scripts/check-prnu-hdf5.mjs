import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {initCvWasm,initPrnuTwiddles,cvPrnuResidual} from '../src/opencv.js';
import {initJpegWasm,jpegCodec} from '../src/jpeg.js';
import {readPrnuDatabase,writePrnuDatabase} from '../src/prnu-hdf5.js';
import {identifyPrnu,prnuMean} from '../src/prnu.js';
import {createEngine} from '../src/index.js';
const root=new URL('../',import.meta.url),ref=JSON.parse(await readFile(new URL('fixtures/prnu-reference.json',root))),read=async name=>new Uint8Array(await readFile(new URL('fixtures/'+name,root)));
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});await initPrnuTwiddles({bytes:new Uint8Array(await readFile(new URL('vendor/pocketfft/prnu-twiddles.bin',root)))});await initJpegWasm({wasmBinary:await readFile(new URL('vendor/libjpeg/jpeg.wasm',root))});
const query=await jpegCodec.decode(await read(ref.query.file)),options={maxWorkingBytes:512*1024**2},rows=[];
for(const f of ref.databases){let result,error;try{result=await identifyPrnu(query,await readPrnuDatabase(await read(f.file),options),ref.query.sha256);}catch(e){error=e.code;}
 assert.equal(!!error,!!f.error,f.name);if(result){assert.deepEqual(result.scores.map(x=>x.camera),f.scores.map(x=>x[0]));assert.equal(result.reachesExperimentalThreshold,f.reachesThreshold);for(let i=0;i<f.scores.length;i++)assert.ok(Math.abs(result.scores[i].score-f.scores[i][1])<1e-12,f.name);}
 rows.push({name:f.name,...(error?{error}:{scores:result.scores,legacy:result.legacy,trainingMembershipVerified:result.trainingMembershipVerified})});
}
const native=await readPrnuDatabase(await read('prnu-snapshot.h5'),options),exported=await writePrnuDatabase(native,options);await writeFile(new URL('.build/prnu-browser-export.h5',root),exported);const reread=await readPrnuDatabase(exported,options);
for(let i=0;i<native.cameras.length;i++){assert.deepEqual(reread.cameras[i],native.cameras[i]);}
const fingerprints=[];
for(const f of ref.fingerprints){
 const residuals=[];for(const item of ref.training.filter(x=>x.camera===f.camera)){const image=await jpegCodec.decode(await read(item.file));residuals.push(await cvPrnuResidual(image));}
 const actual=await prnuMean(residuals),expected=new Float64Array((await read(f.file)).buffer);assert.equal(actual.width,f.shape[1]);assert.equal(actual.height,f.shape[0]);let maximumError=0,differing=0;
 for(let i=0;i<expected.length;i++){maximumError=Math.max(maximumError,Math.abs(actual.values[i]-expected[i]));if(actual.values[i]!==expected[i])differing++;}fingerprints.push({camera:f.camera,maximumError,differing});
}
const engine=createEngine();let built;
try{await engine.load({id:'q',bytes:await read(ref.query.file)});const files=[];for(const item of ref.training)files.push({name:item.name,blob:new Blob([await read(item.file)])});await engine.buildPrnuDatabase({id:'built',queryImageId:'q',files});built=engine.exportPrnuDatabase('built').bytes;await writeFile(new URL('.build/prnu-browser-built.h5',root),built);}finally{engine.dispose();}
const report={schema:1,status:'core-parity-passed',rows,fingerprints,exportBytes:exported.length,builtBytes:built.length};console.log(JSON.stringify(report));await writeFile(new URL('docs/prnu-hdf5-experiment.json',root),JSON.stringify(report,null,2)+'\n');
