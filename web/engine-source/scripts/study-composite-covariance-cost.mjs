import {study} from './m2-browser-study.mjs';
await study('composite-covariance-cost',async()=>{
 const values=new Float32Array(await(await fetch('/.build/composite/spam.bin')).arrayBuffer()),worker=new Worker('/experiments/composite-covariance-study-worker.js',{type:'module'});let report;
 try{report=await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data);worker.postMessage({values,rows:12000,base:new URL('/.build/pyodide/',location.href).href});});}finally{worker.terminate();}
 return {...report,rows:12000,columns:512,scope:'Development-only centered covariance on actual native SPAM rows repeated to the source-window shape. No product calibration.',passed:Object.values(report.records).every(r=>r.maxError<1e-8)};
});
