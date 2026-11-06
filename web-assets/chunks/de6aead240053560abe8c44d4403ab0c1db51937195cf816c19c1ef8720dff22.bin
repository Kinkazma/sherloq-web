import "../../runtime-context.js?v=0.31.0";
// D is a distinct codec/cache candidate. Model certificate C does not qualify D.
const SCHEMA='sherloq.ai-detectors.qualification-evidence/1';
const STATUS='experimental-qualified-corpus';
const fields=['browserInference','source30Mp','memory4Gb'];
// This reads a catalogue declaration. The private builder verifies the pinned
// certificate bytes; loading metadata performs no fetch, inference or probe.
export function aiDetectorQualification(value){
 const pending=()=>({status:'pending-qualification',qualification:Object.fromEntries(fields.map(field=>[field,false])),qualificationEvidence:null});
 const certificate=value?.certificate,file=certificate?.file;
 if(file!=='QUALIFICATION-D.json'||value?.schema!==SCHEMA||value.status!==STATUS||typeof file!=='string'||!file||file.length>1024||file.startsWith('/')||file.includes('\\')||file.includes(':')||file.split('/').some(part=>!part||part==='.'||part==='..')||!/[.]json$/i.test(file)||typeof certificate.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(certificate.sha256)||!fields.every(field=>value.qualification?.[field]===true))return pending();
 const qualification=Object.fromEntries(fields.map(field=>[field,true]));
 return{status:STATUS,qualification,qualificationEvidence:{schema:SCHEMA,status:STATUS,certificate:{file,sha256:certificate.sha256.toLowerCase()},qualification:{...qualification}}};
}
