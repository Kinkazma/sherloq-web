import {createNumericSurface} from './numeric-surface.js';
export const energySemantics='Descriptive low/high JPEG residual energy relative to each detected panel. Scores are not probabilities or attribution of editing. Exact pixel support may be disconnected. Legacy peer biomes, background and Ghost corroboration are separate operations.';
export async function segmentedEnergyResult(analysis,{budget}={}){
 const d=analysis.value,{width,height}=d,records=[],release=budget.reserve(16384+8192*(d.regions.length+d.energy_summary.length));
 try{const make=(store,format,semantics)=>{const free=analysis.retain();let surface;try{surface=createNumericSurface(store,{width,height,format,budget,semantics,dispose:free});}catch(e){free();throw e;}records.push(surface);return {surface,energyAnalysis:d};},primary=make(d.energy_low_score,'float32','Low JPEG residual energy score; not a probability.'),planeRecords={energy_high_score:make(d.energy_high_score,'float32','High JPEG residual energy score; not a probability.'),energy_scope:make(d.energy_scope,'int32','Native reference panel identity; zero outside valid panels.'),energy_labels:make(d.energy_labels,'int32','Native energy region identity; zero outside accepted support.')};
  for(let i=0;i<3;i++)planeRecords['energy_plane_'+i]=make(d.energy_planes[i],'float32','JPEG residual energy at quality '+d.metadata.qualities[i]);
  return {...primary,planeRecords,semantics:energySemantics,data:{width,height,energy_summary:structuredClone(d.energy_summary),regions:structuredClone(d.regions),regionColors:structuredClone(d.regionColors),metadata:structuredClone(d.metadata),arrayLayout:'segmented; readPlane windows or NPZ surface export'}};
 }catch(error){await Promise.allSettled(records.map(s=>s.dispose()));throw error;}finally{release();}
}
