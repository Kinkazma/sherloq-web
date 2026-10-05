import {readFile,writeFile} from 'node:fs/promises';
import {initCvWasm,initPrnuTwiddles,cvPrnuResidual} from '../src/opencv.js';
import {prnuNcc,PRNU_THRESHOLD} from '../src/prnu.js';
const root=new URL('../',import.meta.url),reference=JSON.parse(await readFile(new URL('fixtures/prnu-reference.json',root))),rows=[];
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});await initPrnuTwiddles({bytes:new Uint8Array(await readFile(new URL('vendor/pocketfft/prnu-twiddles.bin',root)))});
for(const f of reference.cases){
 const data=new Uint8Array(await readFile(new URL('fixtures/'+f.file,root)));let result,error;
 try{result=await cvPrnuResidual({width:f.width,height:f.height,format:'rgb8',data});}catch(e){error=e.code;}
 if(f.error){rows.push({name:f.name,error,expectedError:!!error});continue;}
 if(error)throw new Error(f.name+' '+error);
 const bytes=new Uint8Array(await readFile(new URL('fixtures/'+f.residual,root))),expected=new Float64Array(bytes.buffer),actual=result.values;
 let maximumError=0,differing=0;for(let i=0;i<actual.length;i++){maximumError=Math.max(maximumError,Math.abs(actual[i]-expected[i]));if(actual[i]!==expected[i])differing++;}
 const row={name:f.name,noisePower:result.noisePower,noiseError:result.noisePower-f.noisePower,method:result.method,methodMatches:result.method===f.method,maximumError,differing,count:actual.length};rows.push(row);console.log(JSON.stringify(row));
}
const ncc=reference.nccPairs.map(f=>{const convert=x=>({width:x.shape[1],height:x.shape[0],values:Float64Array.from(x.values)}),actual=prnuNcc(convert(f.first),convert(f.second));return {name:f.name,actual,expected:f.score,error:Math.abs(actual-f.score),thresholdMatches:(actual>=PRNU_THRESHOLD)===f.reachesThreshold};});
console.log(JSON.stringify({ncc}));
await writeFile(new URL('docs/prnu-parity-experiment.json',root),JSON.stringify({schema:1,status:'experimental-unqualified',rows,ncc},null,2)+'\n');
