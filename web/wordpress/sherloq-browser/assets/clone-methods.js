import {DENSE_PROFILES} from './unified-engine/src/dense-profiles.js';
export const isDenseClone=name=>DENSE_PROFILES.includes(name);
export const CLONE_ALGORITHMS=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB',...DENSE_PROFILES.slice(0,2),'XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue',DENSE_PROFILES[2],'SIFT + G2NN + RANSAC','SIFT + G2NN + RANSAC + Panels + Text',...DENSE_PROFILES.slice(3),'EfficientLoFTR']);
export const cloneOperation=name=>isDenseClone(name)?'tampering.copyMove.dense':'tampering.copyMove.sparse';
export const cloneMethodFamily=name=>isDenseClone(name)?'dense':name==='EfficientLoFTR'||name.startsWith('ALIKED')||name.startsWith('XFeat')||name.includes('LightGlue')?'learned':'classical';
export const cloneMethodYear=name=>name==='EfficientLoFTR'||name.startsWith('XFeat')?2024:name.startsWith('ALIKED')||name.includes('LightGlue')?2023:null;
export const cloneMethodLabel=name=>cloneMethodYear(name)?name+' · '+cloneMethodYear(name):name;
export const cloneFamilyLabels={fr:{classical:'Descripteurs classiques',dense:'PatchMatch dense',learned:'Appariements par IA'},en:{classical:'Classical descriptors',dense:'Dense PatchMatch',learned:'Learned matching'}};
export const denseCloneParameters=p=>({profile:p.algorithm,patch:p.patch,iterations:p.iterations,texture:p.texture,flip:p.algorithm.endsWith(' + Mirror')||p.reflections,auto:p.autoRadius,...Object.fromEntries(['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum','compact','regions','guides','compare'].map(k=>[k,p[k]])),excluded:[]});
// Follow desktop method defaults only upon a deliberate algorithm change.
export function changeCloneAlgorithm(p,previous){
 const minimum=name=>isDenseClone(name)&&name!=='PatchMatch SIFT'?5:10;
 if(p.minimum===minimum(previous))p.minimum=minimum(p.algorithm);
 if(p.algorithm.includes('Glue'))p.limit=Math.min(2000,p.limit);
 p.threshold=p.algorithm==='EfficientLoFTR'?.2:p.algorithm.includes('Glue')?.9:p.algorithm.startsWith('ALIKED')||p.algorithm==='SIFT + G2NN + RANSAC'?.7:['AKAZE','BRISK','ORB'].includes(p.algorithm)?.12:.3;
 if(!isDenseClone(p.algorithm)&&!p.algorithm.includes('Panels + Text')&&p.algorithm!=='EfficientLoFTR')p.reflections=false;
 if(p.algorithm==='EfficientLoFTR')Object.assign(p,{compare:true,model:'Affine',autoRadius:false,compact:false});
 if(p.algorithm==='SIFT + G2NN + RANSAC')Object.assign(p,{limit:20000,minimum:10,threshold:.725,tolerance:50,autoRadius:false,compact:false,radius:808.95,model:'Affine',geometricMinimum:10,geometricThreshold:5});
 if(p.algorithm.endsWith('Panels + Text'))Object.assign(p,{limit:6000,minimum:10,threshold:.725,tolerance:50,autoRadius:true,compact:false,model:'Affine',geometricMinimum:10,geometricThreshold:5,reflections:true});
 if(isDenseClone(p.algorithm))p.patch=Math.max(p.algorithm==='PatchMatch Zernike'?2:3,p.patch);
}
