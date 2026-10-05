// Development harness only: long jobs must not mix an old ESM loader with a
// newly rebuilt WASM binary while another independent lot is being developed.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
export async function freezeBrowserRuntime(root,directory){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'runtime-manifest.json'),'utf8')),files=new Map(),records=[];
 for(const {file}of manifest.files){const source=path.join(root,file),target=path.join(directory,'runtime',file),bytes=await fs.readFile(source);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);files.set('/'+file,target);records.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const sha256=createHash('sha256').update(JSON.stringify(records)).digest('hex');await fs.writeFile(path.join(directory,'runtime-lock.json'),JSON.stringify({sha256,files:records},null,2)+'\n');return {files,proof:{sha256,files:records.length}};
}
