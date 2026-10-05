import {readFile,writeFile} from 'node:fs/promises';import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';
const root=new URL('../',import.meta.url),ref=JSON.parse(await readFile(new URL('fixtures/opencv-reference.json',root)));
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});
const report={schema:1,outputs:0,operations:{},mismatches:[]};
for(const f of ref.cases){
 const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('fixtures/'+f.file,root)))},expected=new Uint8Array(await readFile(new URL('fixtures/'+f.outputFile,root)));
 for(const entry of f.expected){const op=OPENCV_OPERATIONS[entry.operation],result=await op.compute(image,op.validate(entry.params));let count=0,max=0,first=-1;
  for(let i=0;i<result.pixels.data.length;i++){const d=Math.abs(result.pixels.data[i]-expected[entry.offset+i]);if(d){count++;if(first<0)first=i;max=Math.max(max,d);}}
  const summary=report.operations[entry.operation]??={outputs:0,mismatchingOutputs:0,differentBytes:0,maxError:0};summary.outputs++;report.outputs++;summary.maxError=Math.max(summary.maxError,max);summary.differentBytes+=count;
  if(count){summary.mismatchingOutputs++;if(report.mismatches.length<100)report.mismatches.push({fixture:f.name,operation:entry.operation,params:entry.params,count,max,first,actual:result.pixels.data[first],expected:expected[entry.offset+first]});}
 }
}
await writeFile(new URL('docs/opencv-parity-experiment.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.operations,null,2));

if(report.mismatches.length)throw new Error('Native OpenCV output mismatch');
