import {readFile,writeFile} from 'node:fs/promises';import {initCvWasm,cvPca} from '../src/opencv.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/pca-reference.json',import.meta.url))),report={schema:1,outputs:0,mismatches:[],models:[]};
for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},expected=await readFile(new URL('../fixtures/'+f.outputFile,import.meta.url));let first=true;
 for(const e of f.expected){const p=e.params,r=await cvPca(image,[p.component,['distance','project','crossprod'].indexOf(p.mode),+p.invert,+p.equalize]);report.outputs++;let different=0,max=0;for(let i=0;i<r.pixels.data.length;i++){const d=Math.abs(r.pixels.data[i]-expected[e.offset+i]);if(d)different++;max=Math.max(max,d);}if(different)report.mismatches.push({fixture:f.name,params:p,different,max});
 if(first){for(const key of ['mean','eigenvectors','eigenvalues']){let max=0;for(let i=0;i<r.data[key].length;i++)max=Math.max(max,Math.abs(r.data[key][i]-f.model[key][i]));report.models.push({fixture:f.name,key,max});}first=false;}
 }
}
await writeFile(new URL('../docs/pca-parity-experiment.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({outputs:report.outputs,mismatches:report.mismatches.length,first:report.mismatches.slice(0,15),models:report.models.filter(x=>x.max>0)},null,2));
