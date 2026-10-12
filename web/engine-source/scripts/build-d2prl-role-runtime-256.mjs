// A new D2-only JS memory-bound candidate. Shared512 loaders and the numerical
// WASM remain byte-identical; --stage adds only this pair and its portable pin.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {D2PRL_ROLE_MODEL,D2PRL_ROLE_RUNTIME_256} from '../experiments/d2prl/role-runtime.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),SOURCE='ort-wasm-simd-threaded.mjs',LOADER='ort-wasm-simd-threaded-roles256.mjs',FACTORY='factory-roles256.mjs',KEY='roles-256-d2prl';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),identity=bytes=>({bytes:Buffer.byteLength(bytes),sha256:sha(bytes)});
export function prepareD2prlRoleRuntime256(source,pins){
 assert.equal(pins.rolesRuntime?.runtimeId,'ort130-wasm-512mib');assert.equal(pins.rolesRuntime.memoryMaximumBytes,512*1024**2);assert.equal(pins.rolesRuntime.upstreamVersion,'1.30.0');
 assert.deepEqual(identity(source),pins.files[SOURCE],'Shared512 loader identity differs');
 const before='new WebAssembly.Memory({initial:256,maximum:8192,shared:!0})',after='new WebAssembly.Memory({initial:256,maximum:4096,shared:!0})';assert.equal(source.split(before).length,2,'One pinned memory-constructor boundary required');
 const loader=source.replace(before,after),factory=`import factory from './${LOADER}';\nexport const runtimeId='${D2PRL_ROLE_RUNTIME_256.runtimeId}';\nexport const memoryMaximumBytes=${D2PRL_ROLE_RUNTIME_256.memoryMaximumBytes};\nexport const modelIdentity=Object.freeze({bytes:${D2PRL_ROLE_MODEL.bytes},sha256:'${D2PRL_ROLE_MODEL.sha256}',inputs:Object.freeze(${JSON.stringify(D2PRL_ROLE_MODEL.inputs)}),outputs:Object.freeze(${JSON.stringify(D2PRL_ROLE_MODEL.outputs)})});\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n`;
 assert.equal(loader.replace(after,before),source,'Only the memory maximum may change');
 const files={[LOADER]:identity(loader),[FACTORY]:identity(factory)},record={schema:1,status:'experimental-memory-cap-candidate',...D2PRL_ROLE_RUNTIME_256,upstreamVersion:'1.30.0',buildScript:'scripts/build-d2prl-role-runtime-256.mjs',factory:FACTORY,loader:LOADER,sharedWasm:'ort-wasm-simd-threaded.wasm',wasmSha256:pins.files['ort-wasm-simd-threaded.wasm'].sha256,source:{file:SOURCE,...pins.files[SOURCE]},modelIdentity:D2PRL_ROLE_MODEL,files,scope:'D2PRL fixed448 roles only. Exactly one JS memory maximum changes512MiB to256MiB; original loader/factory and numerical WASM untouched. Parent policy saving256MiB does not establish RSS savings.',qualification:'Pending actual role and full three-raw parity; runtime default remains512MiB.'};
 assert.equal(JSON.stringify(record).includes('/Users/'),false);return{loader,factory,record};
}
export function selectD2prlRoleStagingRecord(record,previous){
 if(!previous)return record;
 const immutable=value=>{const{status,qualification,...identity}=value;return identity;};
 assert.deepEqual(immutable(previous),immutable(record),'Previous role runtime metadata differs from the reproducible candidate');
 if(previous.status==='experimental-memory-cap-candidate')return record;
 assert.equal(previous.status,'qualified-exact-current-engine-memory-cap','Unknown prior role runtime status');
 const q=previous.qualification;assert.equal(q?.directModel?.status,'passed-exact-parity');assert.equal(q.directModel.threeRawAndDecisionsExact,true);assert.equal(q.directModel.finalOwnershipZero,true);assert.equal(q.directModel.globalSpeedQualified,false);
 assert.equal(q.rolePair?.status,'passed-real-role-pair-parity');assert.equal(q.rolePair.policySavingBytes,256*1024**2);
 return previous;
}
async function fileIdentity(file){const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){bytes+=chunk.length;h.update(chunk);}return{bytes,sha256:h.digest('hex')};}
async function main(argv){
 assert(argv.every(value=>['--help','--stage'].includes(value))&&new Set(argv).size===argv.length,'Only --help or explicit --stage supported');
 if(argv.includes('--help')){console.log('node scripts/build-d2prl-role-runtime-256.mjs [--stage]\nDefault prepares the two isolated JS candidate files and portable metadata in .build/d2prl-roles-runtime-256. --stage adds the two local vendor files and PINNED.builds.roles-256-d2prl; old512 loaders, numerical WASM and runtime default are untouched.');return;}
 const vendor=path.join(ROOT,'vendor/d2prl'),pinFile=path.join(vendor,'PINNED.json'),pinBytes=await readFile(pinFile),pins=JSON.parse(pinBytes),source=await readFile(path.join(vendor,SOURCE),'utf8'),result=prepareD2prlRoleRuntime256(source,pins);
 assert.deepEqual(await fileIdentity(path.join(vendor,result.record.sharedWasm)),pins.files[result.record.sharedWasm],'Shared numerical WASM differs');assert.equal(result.record.wasmSha256,pins.rolesRuntime.wasmSha256);
 const out=path.join(ROOT,'.build/d2prl-roles-runtime-256');await mkdir(out,{recursive:true});for(const[name,value]of [[LOADER,result.loader],[FACTORY,result.factory],['runtime.json',JSON.stringify(result.record,null,2)+'\n']])await writeFile(path.join(out,name),value);
 let stagedRecord;
 if(argv.includes('--stage')){
  assert.deepEqual(await readFile(pinFile),pinBytes,'Vendor pins changed during preparation');
  const record=selectD2prlRoleStagingRecord(result.record,pins.builds?.[KEY]);stagedRecord=record;
  const merged={...pins,builds:{...pins.builds,[KEY]:record},files:{...pins.files,...result.record.files}};
  for(const[name,value]of [[LOADER,result.loader],[FACTORY,result.factory],['PINNED.json',JSON.stringify(merged,null,2)+'\n']]){await writeFile(path.join(vendor,name)+'.staging',value);await rename(path.join(vendor,name)+'.staging',path.join(vendor,name));}
 }
 console.log(JSON.stringify({status:argv.includes('--stage')?(stagedRecord.status==='qualified-exact-current-engine-memory-cap'?'staged-local-qualified':'staged-local-experimental'):'prepared-experimental',runtimeId:result.record.runtimeId,files:result.record.files,wasmCopied:false,shared512Changed:false,runtimeDefaultChanged:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
