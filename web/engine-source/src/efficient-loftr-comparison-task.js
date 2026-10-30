// Source and Target are the two inputs of one requested comparison. Splitting
// them into autonomous analyses makes each input absent from the other job.
// The existing union route keeps their literal crops and every true exclusion.
export function efficientLoFtrComparisonTask(task){
 if(task?.operation!=='tampering.copyMove.sparse'||task.params?.algorithm!=='EfficientLoFTR'||task.params.compare!==true||task.params.regions?.length!==2||task.cloneWindowMode==='global')return task;
 return {...task,cloneWindowMode:'global',requestedCloneWindowMode:task.cloneWindowMode??'independent'};
}
