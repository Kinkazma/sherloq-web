import {requireValue} from './errors.js';
import {automaticSnapshotArray as array} from './automatic-npz-stream.js';

const dimensions={content:[6],profiles:[3,5],signed_scores:[3,5],quality_scores:[3],background_profiles:[3,3],background_quality_scores:[3],background_signed_scores:[3,3],background_reference:[3,3],ghost_phase:[2],ghost_curves:[71]};
const fields=['score','legacy_score','coherent_score','quality_scores','signed_scores','profiles','content','peer_count','supported','background_profiles','background_score','background_quality_scores','background_signed_scores','background_reference','background_peer_count','background_supported','pre_background_score','ela_score','ghost_score','ghost_quality','ghost_phase','ghost_curves','ghost_peer_count','ghost_supported'];
const booleans=new Set(['supported','background_supported','ghost_supported']);
function planesSource(planes,n){
 requireValue(Array.isArray(planes)&&planes.length===3&&planes.every(p=>p.byteLength===n*4&&typeof p.readInto==='function'),'Three original-size native float32 energy planes required.');
 return {byteLength:3*n*4,async readInto(bytes,offset){let done=0;while(done<bytes.length){const position=offset+done,index=Math.floor(position/(n*4)),within=position%(n*4),count=Math.min(bytes.length-done,n*4-within);await planes[index].readInto(bytes.subarray(done,done+count),within);done+=count;}}};
}

/** Borrowed native ndarray shape/dtype wrappers for a complete ELA result.
 * Hold both raw-provider and selected-frame leases until the export settles. */
export function automaticElaSnapshot(raw,selected) {
 const {cells,energy}=raw??{},{width,height,rows,cols}=cells??{},n=width*height;
 requireValue(cells&&selected&&selected.width===width&&selected.height===height&&selected.rows===rows&&selected.cols===cols&&cells.ela?.byteLength===n*3&&Array.isArray(cells.key),'Matching global ELA profiles, native preview and selected result required.');
 for(const [key,value]of Object.entries(cells))if(ArrayBuffer.isView(value))requireValue(fields.includes(key)||key==='labels','Unrecognized scientific cell array: '+key);
 const output={key:cells.key};
 for(const key of fields){const value=key==='supported'?selected.supported:cells[key];if(value===undefined)continue;output[key]=array(value,{shape:[rows,cols,...(dimensions[key]??[])],...(booleans.has(key)?{descr:'|b1'}:{})});}
 output.ela=array(cells.ela,{shape:[height,width,3],descr:'|u1'});
 output.labels=array(selected.labels,{shape:[rows,cols],descr:'<i4'});
 output.energy_allowed=array(selected.energy_allowed,{shape:[height,width],descr:'|b1'});
 output.energy_planes=array(planesSource(cells.energy_planes??energy?.energy_planes,n),{shape:[3,height,width],descr:'<f4'});
 if(energy){
  requireValue(energy.width===width&&energy.height===height&&selected.energy_labels,'Matching selected native energy fields required.');
  for(const key of ['energy_low_score','energy_high_score','energy_scope'])output[key]=array(energy[key],{shape:[height,width],descr:key==='energy_scope'?'<i4':'<f4'});
  output.energy_labels=array(selected.energy_labels,{shape:[height,width],descr:'<i4'});output.energy_summary=energy.energy_summary;
 }
 output.metadata=selected.metadata;return output;
}
