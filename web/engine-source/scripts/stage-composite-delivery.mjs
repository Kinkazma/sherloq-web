// Offline assembly only. All output stays in this checkout's private .build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync('git',['diff','--quiet','HEAD'],{cwd:root});
const read=name=>fs.readFile(path.join(root,name));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimeBytes=await read('runtime-manifest.json'),runtime=JSON.parse(runtimeBytes);
const assetBytes=await read('docs/composite-statistics-runtime-manifest.json'),assets=JSON.parse(assetBytes);
const config=JSON.parse(await read('docs/composite-statistics-runtime-config.json'));
const source=path.resolve(root,process.argv[2]??'.build/pyodide');
const destination=path.resolve(root,process.argv[3]??`.build/composite-${assets.statisticsPolicy}-${runtime.version}`);
if(!destination.startsWith(path.join(root,'.build')+path.sep))throw Error('Delivery must be inside this checkout .build');
const zip=assets.files.find(f=>f.file==='noiseprint-statistics.zip');
if(assets.schema!==2||config.statisticsPolicy!==assets.statisticsPolicy||config.sourceSha256!==zip.sha256||config.downloadBytes!==assets.files.reduce((s,f)=>s+f.bytes,0))throw Error('Statistics contract mismatch');
// Reject an existing delivery instead of mutating a previously pinned package.
await fs.mkdir(destination);
async function copyManifest(base,folder,records){
 for(const record of records){
  const file=path.resolve(base,record.file);
  if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Invalid manifest path');
  const bytes=await fs.readFile(file);
  if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error('Identity mismatch: '+record.file);
  const target=path.join(destination,folder,record.file);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
  if(hash(await fs.readFile(target))!==record.sha256)throw Error('Delivery readback mismatch: '+record.file);
 }
}
await copyManifest(root,'runtime',runtime.files);
await copyManifest(source,'pyodide',assets.files);
await fs.writeFile(path.join(destination,'runtime/runtime-manifest.json'),runtimeBytes);
await fs.writeFile(path.join(destination,'pyodide/manifest.json'),assetBytes);
const configuration=JSON.stringify({...config,url:'./pyodide/'},null,2)+'\n';
await fs.writeFile(path.join(destination,'statistics-runtime.json'),configuration);
const binding={schema:1,engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),version:runtime.version,statisticsPolicy:assets.statisticsPolicy,runtimeManifestSha256:hash(runtimeBytes),statisticsManifestSha256:hash(assetBytes),configurationSha256:hash(configuration),runtimeFiles:runtime.files.length,statisticsFiles:assets.files.length,statisticsDownloadBytes:config.downloadBytes,statisticsSourceSha256:config.sourceSha256,scope:'Frozen runtime and separately manifested Python assets. No neural weights included; preserve the existing Noiseprint model/runtime configuration. No deployment performed.'};
await fs.writeFile(path.join(destination,'binding.json'),JSON.stringify(binding,null,2)+'\n');
console.log(JSON.stringify({destination,...binding}));
