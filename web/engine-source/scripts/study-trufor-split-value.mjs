import {study} from './m2-browser-study.mjs';
const allCandidates=process.argv.includes('--all-candidates');
await study(allCandidates?'trufor-split-value-all-candidates-96mp-shapes':'trufor-split-value-96mp-shapes',async({allCandidates})=>{
 const worker=new Worker('/experiments/trufor-split-value-study-worker.js',{type:'module'});
 try{return await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=e=>{if(e.data.progress)console.error(JSON.stringify(e.data.progress));else if(e.data.error)reject(Error(e.data.error));else resolve(e.data);};worker.postMessage({allCandidates});});}finally{worker.terminate();}
},{allCandidates});
