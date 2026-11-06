import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {jpegGrayCurveShader} from './quality-source.mjs';
const root=new URL('../../vendor/jpeg-quality-gpu/',import.meta.url);await mkdir(root,{recursive:true});const source=jpegGrayCurveShader();await writeFile(new URL('jpeg-gray-curve.wgsl',root),source);const manifest=JSON.parse(await readFile(new URL('PINNED.json',root),'utf8'));manifest.files['jpeg-gray-curve.wgsl']={bytes:Buffer.byteLength(source),sha256:createHash('sha256').update(source).digest('hex')};await writeFile(new URL('PINNED.json',root),JSON.stringify(manifest,null,2)+'\n');
