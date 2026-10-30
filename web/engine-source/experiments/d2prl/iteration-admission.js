// No generic caller silently changes its fine progress/operation contract.
export function admitsIterationResident({side,arithmetic,scientificMask,cnnFeatures,cnnFinalFeatures=cnnFeatures,progressMode,onTrace}={}){
 return side===448&&arithmetic==='mps'&&scientificMask==null&&cnnFeatures instanceof Uint16Array&&cnnFinalFeatures===cnnFeatures&&progressMode==='iteration-atomic'&&onTrace==null;
}
