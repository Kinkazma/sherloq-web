#!/usr/bin/env node
// Regenerate GPU source from the native pocketfft operation graphs. No image,
// reference-output table, native compiler or private test corpus is required.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {dctSource} from '../native/noisesniffer-gpu/dct-gpu-source.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
if(args.length>1)throw Error('Usage: node scripts/build-noisesniffer-gpu.mjs [output-directory]');
const source=path.join(root,'native/noisesniffer-gpu'),output=args[0]?path.resolve(args[0]):path.join(root,'vendor/noisesniffer-gpu');
await mkdir(output,{recursive:true});
const manifest={schema:1,method:'native-pocketfft-DCT-operation-graph-hi-lo-f32-with-bounded-variance-and-native-fallback',maximumAbsoluteVarianceError:1e-4,files:{}};
for(const width of[3,5,7,8]){
 const graph=JSON.parse(await readFile(path.join(source,`dct-${width}-graph.json`),'utf8'));
 if(graph.width!==width||graph.outputs.length!==width*width)throw Error('Invalid native operation graph.');
 const name=`dct-${width}.wgsl`,bytes=Buffer.from(dctSource(graph,'pair',{image:true,raw:false,guard:true}));
 await writeFile(path.join(output,name),bytes);manifest.files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(path.join(output,'PINNED.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
