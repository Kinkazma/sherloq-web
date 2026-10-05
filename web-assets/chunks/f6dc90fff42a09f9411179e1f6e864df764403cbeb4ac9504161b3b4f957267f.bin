import "../../runtime-context.js?v=0.14.5";
// Singular values and orthogonal polar factor of a real 2x2 matrix, using the
// closed form of the same SVD predicates as native transformed_groups.
export function denseTransformAccepted(matrix,sourceBin,targetBin,mirror=false){
 const [a,b]=matrix[0],[c,d]=matrix[1],det=a*d-b*c;
 const direct=Math.hypot(a+d,c-b),opposite=Math.hypot(a-d,c+b),large=(direct+opposite)/2,small=Math.abs(direct-opposite)/2;
 if(small<=0||large/small>1.15)return false;
 const reflected=det<0;if(reflected!==mirror)return false;
 const scale=Math.sqrt(large*small),angle=((Math.atan2(reflected?-b-c:c-b,reflected?d-a:a+d)*180/Math.PI)%360+360)%360;
 const q=angle/90,lo=Math.floor(q),r=q-lo,turn=(r<.5?lo:r>.5?lo+1:lo+(lo%2))%4;
 if(Math.abs(((angle-90*turn+180)%360+360)%360-180)>15)return false;
 const ratio=targetBin/sourceBin;if(Math.min(Math.abs(Math.log(scale/ratio)),Math.abs(Math.log(scale*ratio)))>Math.log(1.15))return false;
 return targetBin!==sourceBin||turn!==0||mirror;
}
export function filterDenseTransforms(groups,models,pass){
 if(!models.length)return {groups,models};const accepted=[],fitted=[];
 for(let i=0;i<models.length;i++)if(denseTransformAccepted(models[i].matrix,pass.patch,pass.targetPatch,pass.reflection)){accepted.push(groups[i]);fitted.push(models[i]);}
 return {groups:accepted,models:fitted};
}
