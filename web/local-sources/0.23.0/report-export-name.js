const text=value=>typeof value==='string'&&value.trim()?value.trim():undefined;
const component=value=>String(value).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/\s+/g,'-').replace(/^[. -]+|[. -]+$/g,'').slice(0,96)||'analysis';

// Use the retained result snapshot, not the current tool-container label or
// controls. One container can route to sparse, dense and learned detectors.
function analysisExportStem(report,fallbackOperation='analysis'){
 const operation=text(report?.operation)??text(report?.provenance?.operation)??text(report?.context?.operation)??text(fallbackOperation)??'analysis';
 const parameters=report?.provenance?.params??report?.context?.parameters??report?.parameters??report?.params;
 const key=operation==='ai.clones.segmentation'?'variant':operation==='tampering.copyMove.dense'?'profile':operation==='tampering.copyMove.sparse'?'algorithm':operation==='m2.forgeryscope'?'profile':undefined;
 const method=key?text(parameters?.[key]):undefined;
 return 'SHERLOQ-'+component(operation)+(method?'-'+component(method):'');
}

export function analysisReportFilename(report,{fallbackOperation='analysis'}={}){
 return analysisExportStem(report,fallbackOperation)+'-report.json';
}
export function analysisArtifactFilename(report,{fallbackOperation='analysis',format='json',suffix}={}){
 return analysisExportStem(report,fallbackOperation)+(text(suffix)?'-'+component(suffix):'')+'.'+component(format).toLowerCase();
}
export function analysisImageFilename(report,{fallbackOperation='analysis',format='png',original=false}={}){
 return original?'SHERLOQ-original.'+component(format).toLowerCase():analysisArtifactFilename(report,{fallbackOperation,format});
}
