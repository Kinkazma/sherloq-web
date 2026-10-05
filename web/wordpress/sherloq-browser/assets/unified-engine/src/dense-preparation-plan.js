import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
import {missingMigrationWorkspaceBytes,migrationWorkspaceBytes} from './migration-workspace.js';

// All banks share one migration window. Count only the additional capacity the
// largest planned bank needs; its actual owner reserves it when created.
export function densePreparationMigrationBytes(budget,largestBankBytes,{storage='auto',temporarySession,getTemporarySession}={}){
 if(storage==='temporary'||!(temporarySession||getTemporarySession)||temporarySession?.backend==='opfs')return 0;
 return missingMigrationWorkspaceBytes(budget,migrationWorkspaceBytes(largestBankBytes,temporarySession));
}

// Reserve the representation before choosing its CPU width. More workers must
// not evict a preparation that would fit with fewer useful workers.
export function planDensePreparation({availableBytes,dataBytes,workspaceBytes,ioBytes,migrationBytes=0,total,maxWorkers,storage='auto'}){
 requireValue([availableBytes,dataBytes,workspaceBytes,ioBytes,migrationBytes,total,maxWorkers].every(Number.isFinite)&&availableBytes>=0&&dataBytes>=0&&workspaceBytes>0&&ioBytes>=0&&migrationBytes>=0&&total>=1&&maxWorkers>=1,'Invalid dense preparation plan.');
 const workerBytes=workspaceBytes+ioBytes;
 if(workerBytes>availableBytes)throw new EngineError('MEMORY_LIMIT','One exact dense preparation worker does not fit.');
 const resident=storage!=='temporary'&&dataBytes+workerBytes+migrationBytes<=availableBytes;
 if(storage==='memory'&&!resident)throw new EngineError('MEMORY_LIMIT','The dense preparation and one worker do not fit in RAM.');
 // When the full representation cannot fit, preserve a useful RAM working
 // set without serializing all external preparation solely to maximize RAM.
 const hotBytes=storage==='temporary'?0:resident?dataBytes+migrationBytes:Math.min(dataBytes,Math.floor((availableBytes-workerBytes)/2));
 const workers=Math.max(1,Math.min(maxWorkers,total,Math.floor((availableBytes-hotBytes)/workerBytes)));
 return {workers,storage:resident?'memory':storage,dataBytes,hotBytes,workerBytes,resident,migrationBytes:resident?migrationBytes:0};
}

export function planDenseOutputStorage(jobs,{coherence=true,availableBytes}){
 const counts=jobs.map(job=>{const border=job.pass.method?3*Math.max(job.pass.patch,job.pass.targetPatch):0;return (job.width-border)*(job.height-border);});
 const rawBytes=counts.reduce((sum,n)=>sum+n*9,0),filteredBytes=counts.reduce((sum,n)=>sum+n*(coherence?5:1),0);
 // Coherence owns global union/find scratch in addition to every retained raw
 // and filtered field. The source budget is already charged by the caller.
 const scratchBytes=(coherence?Math.max(...counts)*12:0)+80*1024**2,peakBytes=rawBytes+filteredBytes+scratchBytes;
 return {storage:peakBytes<=availableBytes?'auto':'temporary',rawBytes,filteredBytes,scratchBytes,peakBytes};
}
