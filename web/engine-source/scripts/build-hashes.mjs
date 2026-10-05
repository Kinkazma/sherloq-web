import {build} from 'esbuild';import {mkdir,copyFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(new URL('../vendor/hash-wasm',import.meta.url),{recursive:true});
await build({absWorkingDir:root,entryPoints:['scripts/hash-entry.js'],outfile:'vendor/hash-wasm/hashes.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,legalComments:'inline'});
await copyFile(new URL('../node_modules/hash-wasm/LICENSE',import.meta.url),new URL('../vendor/hash-wasm/LICENSE',import.meta.url));
