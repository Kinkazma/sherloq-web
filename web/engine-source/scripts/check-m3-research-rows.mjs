import {readFile,writeFile} from 'node:fs/promises';import {prepareResearchRows,researchRows} from '../src/m3-research-rows.js';import {Budget} from '../src/cache.js';
const root=new URL('../.build/m3/',import.meta.url),read=async(file,T=Uint8Array)=>{const b=await readFile(new URL(file,root));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));},json=async f=>JSON.parse(await readFile(new URL(f,root))),records=[];
for(const method of ['focal','safire','adaifl']){
 const cases=await json(method==='adaifl'?'adaifl-prepare-reference.json':'learned/research-prepare-reference.json');
 for(const c of cases){const width=c.width??c.w,height=c.height??c.h,file=method==='adaifl'?c.prefix+'-rgb.bin':'learned/'+c.file,expectedFile=method==='adaifl'?c.prefix+'-expected.bin':'learned/'+c.outputs[method==='focal'?1:0],data=await read(file),expected=await read(expectedFile,Float32Array),budget=new Budget(32*1024**2);const result=await prepareResearchRows(researchRows({width,height,data}),{method,budget});let differences=0,max=0;
 try{for(let i=0;i<expected.length;i++){differences+=result.tensor[i]!==expected[i];max=Math.max(max,Math.abs(result.tensor[i]-expected[i]));}records.push({method,width,height,values:expected.length,differences,max,workspacePeakBytes:budget.peak,...result.metrics});}finally{result.release();}if(budget.total())throw Error('Leak');
 }
}
await writeFile(new URL('../docs/m3-research-rows-proof.json',import.meta.url),JSON.stringify({records,exact:records.every(r=>r.differences===0)},null,2)+'\n');console.log(JSON.stringify(records));if(records.some(r=>r.differences))process.exitCode=1;
