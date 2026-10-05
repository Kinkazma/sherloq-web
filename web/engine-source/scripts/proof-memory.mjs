// A worker restart resets its high-water mark. Preserve all recorded lifetimes.
export function summarizeRecordedMemory(record){
 const peaks=[];function visit(value){if(!value||typeof value!=='object')return;if(Number.isFinite(value.peakAccountedBytes))peaks.push(value.peakAccountedBytes);for(const entry of Object.values(value))visit(entry);}visit(record);
 return{scope:'Maximum of recorded load/completed-task snapshots across worker lifetimes; aborted intervals do not return a peak. Excludes browser process and browser-managed Blob residency.',maxRecordedAccountedBytes:peaks.length?Math.max(...peaks):null,finalWorkerPeakAccountedBytes:record.memory?.peakAccountedBytes??null};
}
