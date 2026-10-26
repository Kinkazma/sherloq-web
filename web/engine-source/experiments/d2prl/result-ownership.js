import {requireValue} from '../../src/errors.js';
import {scientificJsonBound} from '../../src/scientific-json.js';
import {retainAutomaticElaValue} from '../../src/automatic-ela-owner.js';
import {noisesnifferOwnerRetirement as retirement} from '../../src/noisesniffer-owner-retirement.js';

// Live native outputs borrow one shared raw-bank owner. Small records and all
// raw loans are admitted; refused retirements remain reachable for explicit retry.
export function createD2prlResultOwnership({budget,rawBytes}){
 const banks=new Map(),results=new Map();
 function bank(analysisId,values,funding=[]){
  const known=banks.get(analysisId);
  if(known){requireValue(known.values.length===values.length&&known.values.every((v,i)=>v===values[i]),'D2PRL raw bank identity changed.');return known.owner.retain();}
  const releases=funding.length?funding.splice(0):[budget.reserve(rawBytes*values.length)];let metadata;
  try{metadata=budget.reserve(4096+values.length*128+2*scientificJsonBound({analysisId,values:values.map(value=>({decision:value.decision,execution:value.execution,byteLength:value.byteLength}))}));}catch(error){for(const free of releases)free();throw error;}
  const record={values:values.slice(),owner:null,retiring:null};
  const retire=retirement([...releases,metadata],{onRetired(){if(banks.get(analysisId)===record)banks.delete(analysisId);}});
  record.owner=retainAutomaticElaValue(record.values,()=>{record.retiring=retire;return retire();});banks.set(analysisId,record);return record.owner;
 }
 function register({resultId,context,metadata,raw,dispose}){
  requireValue(!results.has(resultId)&&typeof dispose==='function','Unique live D2PRL result owner required.');
  const free=budget.reserve(4096+2*scientificJsonBound({context,metadata}));let record;
  try{record={context:structuredClone(context),metadata:structuredClone(metadata),raw,provenance:undefined,provenanceRelease:null,retirement:null};}
  catch(error){free();throw error;}
  const projected=retirement([dispose]),rawOwner=retirement([()=>raw.release()]),meta=retirement([()=>record.provenanceRelease?.(),free]);
  record.retirement=retirement([async()=>{await projected();await rawOwner();await meta();}],{onRetired(){if(results.get(resultId)===record)results.delete(resultId);}});results.set(resultId,record);return record;
 }
 return{
  bank,register,
  result(id){const r=results.get(id);return r&&!r.retirement.started?r:null;},
  retiring(id){return results.get(id)?.retirement.started===true;},
  values(analysisId){const b=banks.get(analysisId);return b&&!b.retiring?b.values:null;},
  provenance(id,value){const r=results.get(id);requireValue(r&&!r.retirement.started&&r.provenance===undefined,'Live unpublished D2PRL provenance owner required.');const free=budget.reserve(4096+2*scientificJsonBound(value));try{r.provenance=structuredClone(value);r.provenanceRelease=free;}catch(error){free();throw error;}},
  async drain(){for(const r of [...results.values()])if(r.retirement.started)await r.retirement();for(const b of [...banks.values()])if(b.retiring)await b.retiring();},
  get state(){return{liveResults:results.size,rawBanks:banks.size,retiringResults:[...results.values()].filter(r=>r.retirement.started).length};}
 };
}
