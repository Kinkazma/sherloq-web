// Presentation groups never change detector parameters or suitability groups.
export function batchRecipeLabel(recipe,language='fr'){
 if(recipe.operation==='ai.clones.d2prl')return 'D2PRL';
 return recipe[language==='en'?'en':'fr']??recipe.title??recipe.id??recipe.operation;
}
export function batchAiRecipe(recipe){
 return recipe.operation?.startsWith('ai.')||recipe.operation?.startsWith('m2.')||/LightGlue|LoFTR|XFeat|ALIKED|DISK|SuperPoint|KeyNet/i.test(recipe.params?.algorithm??'');
}
export function batchDetectionMethods(recipe){
 if(recipe.kind==='automatic')return ['PatchMatch Zernike','SIFT + G2NN + RANSAC','Forgeryscope Auto','D2PRL'];
 if(!['clones','map','regions'].includes(recipe.kind))return [];
 if(recipe.operation==='ai.clones.d2prl')return ['D2PRL'];
 if(recipe.operation==='m2.forgeryscope')return ['Forgeryscope Auto'];
 return [recipe.params?.algorithm??recipe.params?.variant??recipe.operation];
}
export function batchAutomaticThreshold(recipes){
 const methods=[...new Set([...recipes].flatMap(batchDetectionMethods))];
 return {threshold:Math.max(1,Math.floor(methods.length/2)),count:methods.length,methods};
}
