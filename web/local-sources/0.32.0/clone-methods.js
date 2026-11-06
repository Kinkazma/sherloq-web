import {DENSE_PROFILES} from './unified-engine/src/dense-profiles.js';
export const isDenseClone=name=>DENSE_PROFILES.includes(name);
export const CLONE_ALGORITHMS=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB',...DENSE_PROFILES.slice(0,2),'XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue',DENSE_PROFILES[2],'SIFT + G2NN + RANSAC','SIFT + G2NN + RANSAC + Panels + Text',...DENSE_PROFILES.slice(3),'EfficientLoFTR','SSG']);
export const cloneOperation=name=>isDenseClone(name)?'tampering.copyMove.dense':'tampering.copyMove.sparse';
export const cloneMethodFamily=name=>isDenseClone(name)?'dense':name==='EfficientLoFTR'||name.startsWith('ALIKED')||name.startsWith('XFeat')||name.includes('LightGlue')?'learned':'classical';
export const cloneMethodYear=name=>name==='EfficientLoFTR'||name.startsWith('XFeat')?2024:name==='SSG'||name.startsWith('ALIKED')||name.includes('LightGlue')?2023:null;
export const cloneMethodLabel=name=>cloneMethodYear(name)?name+' · '+cloneMethodYear(name):name;
export const cloneFamilyLabels={fr:{classical:'Descripteurs classiques',dense:'PatchMatch dense',learned:'Appariements par IA'},en:{classical:'Classical descriptors',dense:'Dense PatchMatch',learned:'Learned matching'}};
export const SSG_DEFAULTS=Object.freeze({normalizationLongEdge:3000,minimumDistance:100,spatialK:3,ratio:.6,absolute:.1,salienceSigma:.001,maskThreshold:.4,minimumArea:.0001,roiRadius:50,ssimRadius:3,ssimOpening:4,rngSeed:1});
export const denseCloneParameters=p=>({profile:p.algorithm,patch:p.patch,iterations:p.iterations,texture:p.texture,flip:p.algorithm.endsWith(' + Mirror')||p.reflections,auto:p.autoRadius,...Object.fromEntries(['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum','compact','regions','guides','compare'].map(k=>[k,p[k]])),excluded:structuredClone(p.excluded??[])});
// Preparation state is derived from the two original model controls; it is
// neither another persisted setting nor a request to replace custom values.
export function alikedPreparationProfile(p){
 if(!p?.algorithm?.startsWith('ALIKED'))return null;
 const side=p.alikedInputSide??1024,threshold=p.alikedDetectionThreshold??.2;
 return side===2048&&threshold===.05?'fine':side===1024&&threshold===.2?'standard':'custom';
}
// Apply method defaults only upon a deliberate algorithm change.
export function changeCloneAlgorithm(p,previous){
 const fineTarget=p.algorithm?.startsWith('ALIKED')&&alikedPreparationProfile(p)==='fine',fineTransition=previous?.startsWith('ALIKED')&&fineTarget,previousThreshold=p.threshold,previousFineThreshold=previous?.includes('Glue')?.99:.7;
 // EfficientLoFTR requires two inputs; that requirement belongs to this method.
 // Returning to another detector restores an ordinary self-copy search.
 if(previous==='EfficientLoFTR'&&p.algorithm!==previous)p.compare=false;
 const minimum=name=>isDenseClone(name)&&name!=='PatchMatch SIFT'?5:10;
 if(p.minimum===minimum(previous))p.minimum=minimum(p.algorithm);
 if(p.algorithm.includes('Glue'))p.limit=Math.min(p.algorithm.startsWith('ALIKED')&&p.alikedInputSide===2048?6000:2000,p.limit);
 // Learned self-copy searches must cover the selected image/region, including
 // distant panels. A fixed 600-pixel inherited radius hides valid matches.
 if(p.algorithm.startsWith('XFeat')||p.algorithm.startsWith('ALIKED'))p.autoRadius=true;
 p.threshold=p.algorithm==='EfficientLoFTR'?.2:p.algorithm.includes('Glue')?.9:p.algorithm.startsWith('ALIKED')||p.algorithm==='SIFT + G2NN + RANSAC'?.7:['AKAZE','BRISK','ORB'].includes(p.algorithm)?.12:.3;
 if(fineTarget)p.threshold=fineTransition&&previousThreshold!==previousFineThreshold?previousThreshold:p.algorithm.includes('Glue')?.99:.7;
 if(!isDenseClone(p.algorithm)&&!p.algorithm.includes('Panels + Text')&&p.algorithm!=='EfficientLoFTR')p.reflections=false;
 if(p.algorithm==='EfficientLoFTR')Object.assign(p,{compare:true,model:'Affine',autoRadius:false,compact:false});
 if(p.algorithm==='SSG')Object.assign(p,{compare:false,autoRadius:false,compact:false,independent:false});
 if(p.algorithm==='SIFT + G2NN + RANSAC')Object.assign(p,{limit:20000,minimum:10,threshold:.725,tolerance:50,autoRadius:false,compact:false,radius:808.95,model:'Affine',geometricMinimum:10,geometricThreshold:5});
 if(p.algorithm.endsWith('Panels + Text'))Object.assign(p,{limit:6000,minimum:10,threshold:.725,tolerance:50,autoRadius:true,compact:false,model:'Affine',geometricMinimum:10,geometricThreshold:5,reflections:true});
 if(isDenseClone(p.algorithm))p.patch=Math.max(p.algorithm==='PatchMatch Zernike'?2:3,p.patch);
}

// Original ALIKED preparation parameters, plus the ordinary geometric guards.
// This preset changes model observations, never the accepted-overlap rule.
export function applyAlikedFinePreset(p){
 if(!p.algorithm?.startsWith('ALIKED'))return false;
 Object.assign(p,{alikedInputSide:2048,alikedDetectionThreshold:.05,limit:6000,minimum:10,threshold:p.algorithm.includes('Glue')?.99:.7,tolerance:50,model:'Similarity',geometricThreshold:3,geometricMinimum:6,autoRadius:true});
 return true;
}
