// Assemble every declared ordinary ONNX/WASM/module component. This is a local
// packaging command, never a runtime inference or a deployment/publication.
import {readFile,writeFile,mkdir,copyFile,symlink,lstat} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const manifestPath=resolve(process.argv[2]),resources=resolve(process.argv[3]),output=resolve(process.argv[4]),link=process.argv.includes('--link');
const engine=resolve(fileURLToPath(new URL('../',import.meta.url))),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);
if(manifest.schema!==1||manifest.family!=='selfdm-proposal')throw Error('SelfDM Proposal manifest schema required');
const entries=[...Object.entries(manifest.models).map(([id,spec])=>({id,spec,source:resolve(resources,id==='selfdm'?'../browser-selfdm-512/'+spec.file:'onnx/'+spec.file)})),
 {id:'cv',spec:manifest.cv,source:resolve(engine,'vendor/selfdm-proposal/'+manifest.cv.file)},
 {id:'cvFactory',spec:manifest.cvFactory,source:resolve(engine,'vendor/selfdm-proposal/'+manifest.cvFactory.file)},
 {id:'prepare',spec:manifest.prepare,source:resolve(engine,'vendor/d2prl/'+manifest.prepare.file)}];
async function verified(path,spec){
 if(!spec||basename(spec.file)!==spec.file||!Number.isSafeInteger(spec.bytes)||!/^[a-f0-9]{64}$/.test(spec.sha256))throw Error('Invalid declared component identity');
 const data=await readFile(path),sha256=createHash('sha256').update(data).digest('hex');
 if(data.length!==spec.bytes||sha256!==spec.sha256)throw Error('Component bytes/SHA mismatch: '+spec.file);
 return data;
}
await mkdir(output,{recursive:true});const receipts=[];
for(const {id,spec,source} of entries){
 await verified(source,spec);const target=resolve(output,spec.file);
 const existing=await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(existing)await verified(target,spec);
 else if(link)await symlink(source,target);else await copyFile(source,target);
 await verified(target,spec);receipts.push({id,file:spec.file,bytes:spec.bytes,sha256:spec.sha256});
}
const targetManifest=resolve(output,basename(manifestPath));
if(targetManifest!==manifestPath)await writeFile(targetManifest,manifestBytes);
const result={schema:1,manifest:{file:basename(manifestPath),bytes:manifestBytes.length,sha256:createHash('sha256').update(manifestBytes).digest('hex')},components:receipts,componentBytes:receipts.reduce((sum,x)=>sum+x.bytes,0),mode:link?'development-links':'ordinary-files',publication:false};
console.log(JSON.stringify(result,null,2));
