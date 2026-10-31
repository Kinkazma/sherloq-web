// Read only the identities already owned by this ToolClient. The returned
// description is never executed; executeCore retains the normal load/prepare.
export function usefulTaskInputs(task,extras,{median,quality,reference,mask,prnu,source}={}){
 const next={...task,params:{...task.params}};
 if(task.operation==='various.median'&&median)next.params.modelId=median;
 if(task.operation==='jpeg.quality'&&quality)next.params.modelId=quality;
 if(task.operation==='comparison.image'&&reference?.blob===extras.reference)next.params.referenceImageId=reference.id;
 if(['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation)&&extras.mask&&mask?.blob===extras.mask)next.params.maskImageId=mask.id;
 if(task.operation==='noise.prnu'&&prnu&&prnu.file===extras.database&&prnu.training===extras.training&&prnu.camera===extras.camera&&(extras.database||prnu.trainingQuerySha256===source?.sha256))next.params.databaseId=prnu.id;
 if(['metadata.structure','metadata.location'].includes(task.operation))next.usefulExecutionRoute=task.operation==='metadata.structure'?'tool-exiftool-headers':'tool-exiftool-location';
 return next;
}
