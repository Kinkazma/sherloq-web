// Read-only contract backend for a sparse public checkout. Ordinary files are
// preferred. Missing files must have a reviewed manifest identity and actual
// content-addressed pieces. Small JSON is SHA-verified; weight bodies are not
// copied, rehashed or inferred by the metadata/closure tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateManifest} from '../sherloq-browser/assets/dependency-core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const defaultManifest=fileURLToPath(new URL('../compatibility-manifests/a488d0a8cba3120ea52cc497beadf6cf68758394cb2db81c81ab6c47890a6081.json',import.meta.url));
const asPath=value=>value instanceof URL?fileURLToPath(value):path.resolve(value);
const MAX_JSON_BYTES=8_000_000;

export function createRuntimeTestFiles(assetsRoot,{manifestPath=process.env.SHERLOQ_TEST_MANIFEST||defaultManifest,chunkRoots=(process.env.SHERLOQ_TEST_CHUNKS||'').split(path.delimiter).filter(Boolean)}={}){
 const base=asPath(assetsRoot),roots=[...chunkRoots,path.resolve(base,'../../../..','web-assets/chunks')].map(asPath);let inventory;
 async function manifest(){return inventory??= (async()=>{
  const identity=path.basename(manifestPath).match(/^([a-f0-9]{64})\.json$/)?.[1]||process.env.SHERLOQ_TEST_MANIFEST_SHA256;if(!identity)throw Error('Runtime tests require a SHA-verified immutable dependency manifest');const stat=await fs.stat(manifestPath);if(!stat.isFile()||stat.size>MAX_JSON_BYTES)throw Error('Oversized runtime test manifest');const bytes=await fs.readFile(manifestPath);
  if(sha(bytes)!==identity)throw Error('Runtime tests require a SHA-verified immutable dependency manifest');
  return validateManifest(JSON.parse(bytes));
 })();}
 function resourcePath(filename){const relative=path.relative(base,asPath(filename));if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Runtime test resource is outside the selected public assets');return relative.split(path.sep).join('/');}
 async function record(filename,expectedSHA){const name=resourcePath(filename),value=(await manifest()).files[name];if(!value||value.localOnly)throw Error('No public immutable resource descriptor: '+name);if(expectedSHA&&value.sha256!==expectedSHA)throw Error('Runtime lock differs from dependency manifest: '+name);return {name,value};}
 async function chunkPaths(hash,size){const candidates=[];for(const root of roots){const filename=path.join(root,hash+'.bin');try{const stat=await fs.stat(filename);if(stat.isFile()&&stat.size===size)candidates.push(filename);}catch(error){if(error.code!=='ENOENT')throw error;}}if(!candidates.length)throw Error('Missing or truncated reviewed piece '+hash+'; set SHERLOQ_TEST_CHUNKS to the existing public chunk directories');return candidates;}
 async function describe(filename,{expectedSHA}={}){
  try{const stat=await fs.stat(filename);if(!stat.isFile())throw Error('Runtime contract path is not a file');return {size:stat.size,source:'physical'};}catch(error){if(error.code!=='ENOENT')throw error;}
  const {name,value}=await record(filename,expectedSHA),m=await manifest();for(const hash of value.chunks)await chunkPaths(hash,m.chunks[hash]);
  return {size:value.size,sha256:value.sha256,source:'content-addressed-descriptor',manifestPath:name,bodyVerified:false};
 }
 async function readJSONBytes(filename,{expectedSHA}={}){
  const {name,value}=await record(filename,expectedSHA);if(!name.endsWith('.json')||value.size>MAX_JSON_BYTES)throw Error('Only small execution JSON may be read through the runtime contract backend');
  try{const stat=await fs.stat(filename);if(!stat.isFile()||stat.size!==value.size)throw Error('Physical runtime JSON length differs: '+name);const bytes=await fs.readFile(filename);if(bytes.length!==value.size||sha(bytes)!==value.sha256)throw Error('Physical runtime JSON identity differs: '+name);return bytes;}catch(error){if(error.code!=='ENOENT')throw error;}
  const pieces=[],m=await manifest();for(const hash of value.chunks){let verified;for(const filename of await chunkPaths(hash,m.chunks[hash])){const bytes=await fs.readFile(filename);if(bytes.length===m.chunks[hash]&&sha(bytes)===hash){verified=bytes;break;}}if(!verified)throw Error('Runtime JSON piece SHA-256 differs: '+hash);pieces.push(verified);}
  const bytes=Buffer.concat(pieces);if(bytes.length!==value.size||sha(bytes)!==value.sha256)throw Error('Reassembled runtime JSON identity differs: '+name);return bytes;
 }
 return {describe,readJSONBytes,manifest};
}
