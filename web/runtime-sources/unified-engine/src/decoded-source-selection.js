import "../../runtime-context.js?v=0.33.2";
// Choose a representation before the source service publishes a lease.
// It never fetches a resource, allocates pixels or decides from dimensions.
const types=new Set(['uint','sint','float','shared-exponent','unknown']);
const limitation=reason=>Object.freeze({kind:'borrowed-presentation',quantumDepth:null,preservationQualified:false,reason});
export function decodedChannelModel(f){
 if(['RGB','GRAY','CMYK','indexed'].includes(f?.sourceModel))return f.sourceModel;
 if(f?.sourceModel==='declared-channels'){
  const names=f.channels.filter(c=>c.role==='color').map(c=>c.name).sort();
  if(names.join(',')==='B,G,R')return'RGB';if(names.length===1&&names[0]==='Y')return'GRAY';
 }
 return null;
}
export function selectDecodedRepresentation({sourceSamples,canBorrowFaithful=false,simpleRgb8=false}={}){
 const f=sourceSamples;
 if(!f||f.schema!=='sherloq.coder-source-samples/1'||f.precisionOrigin!=='decoder-source-header'
  ||!Array.isArray(f.channels)||f.channels.length<1||f.channels.length>64
  ||f.channels.some(c=>!types.has(c.codedType)||!(c.codedBits===null||Number.isInteger(c.codedBits)&&c.codedBits>0&&c.codedBits<=64)))return limitation('coded-source-metadata-unavailable');
 if(!f.selection?.metadataComplete)return limitation('coded-source-metadata-incomplete');
 const coded=f.channels.filter(c=>c.role==='color'||c.role==='alpha');
 if(!coded.length)return limitation('decoded-color-layout-not-established');
 if(canBorrowFaithful)return Object.freeze({kind:'borrowed-faithful',quantumDepth:null,preservationQualified:false,reason:'same-existing-native-sample-owner'});
 const model=decodedChannelModel(f);if(!model)return limitation('decoded-model-needs-a-qualified-unit-contract');
 if(f.channels.some(c=>c.role==='meta')||coded.filter(c=>c.role==='alpha').length>1
  ||coded.filter(c=>c.role==='color').length!==(model==='GRAY'?1:model==='CMYK'?4:3))return limitation('extra-channel-preservation-not-yet-qualified');
 if(coded.some(c=>c.codedType==='unknown'||c.codedType==='sint'||c.codedBits===null))return limitation('typed-source-contract-not-yet-qualified');
 const floating=coded.some(c=>c.codedType==='float'||c.codedType==='shared-exponent');
 if(coded.some(c=>c.codedType==='uint'&&c.codedBits>16)||coded.some(c=>c.codedType==='float'&&c.codedBits>32))return limitation('typed-source-range-exceeds-qualified-bank');
 const maximum=Math.max(...coded.map(c=>c.codedBits)),alpha=f.alpha?.present===true;
 if(!floating&&maximum<=8){
  if(simpleRgb8&&model==='RGB'&&!alpha)return Object.freeze({kind:'borrowed-faithful',quantumDepth:null,preservationQualified:false,reason:'unchanged-simple-rgb8-owner'});
  return Object.freeze({kind:'q8-native-channels',quantumDepth:8,preservationQualified:false,reason:'decoded-channels-before-cms-required'});
 }
 return Object.freeze({kind:'high-precision',quantumDepth:floating?32:16,preservationQualified:false,
  sampleType:floating?'float32':'uint16',reason:floating?'declared-floating-source':'declared-integer-source-above-eight',sourceModel:model,alpha});
}
