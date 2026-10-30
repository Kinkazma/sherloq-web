import {fusedCpu} from '../src/ela-lut.js';
let table;self.onmessage=async({data})=>{if(data.table){table=data.table;postMessage({ready:true});return;}try{const result=await fusedCpu(data.a,data.b,data.params,table);postMessage({result},[result.buffer]);}catch(e){postMessage({error:e.message});}};
