import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm,cvDecode} from '../src/opencv.js';import {imageHeader} from '../src/image-headers.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const reference=JSON.parse(await readFile(new URL('../fixtures/image-codec-reference.json',import.meta.url))),report=[];
for(const expected of reference.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+expected.file,import.meta.url)));let decoded,error,header;
 try{header=imageHeader(bytes);decoded=await cvDecode(bytes);}catch(e){error=e.code??e.message;}
 const sha=decoded?createHash('sha256').update(decoded.data).digest('hex'):null;
 report.push({file:expected.file,nativeError:expected.nativeError??null,error:error??null,width:decoded?.width,height:decoded?.height,headerWidth:header?.width,headerHeight:header?.height,exact:sha===expected.sha256});
}
await writeFile(new URL('../docs/image-codec-experiment.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
