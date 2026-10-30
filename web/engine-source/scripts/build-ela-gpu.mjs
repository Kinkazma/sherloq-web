#!/usr/bin/env node
import {writeFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import {createHash} from 'node:crypto';
import {JPEG_WGSL} from '../native/ela-gpu/jpeg-source.mjs';
import {jpegArchiveShader} from '../native/ela-gpu/jpeg-archive-source.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),output=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'vendor/ela-gpu');await mkdir(output,{recursive:true});
const archive=Buffer.from(jpegArchiveShader()),archiveSha=createHash('sha256').update(archive).digest('hex');await writeFile(path.join(output,'ela-jpeg-archive.wgsl'),archive);
const bytes=Buffer.from(JPEG_WGSL),sha256=createHash('sha256').update(bytes).digest('hex');await writeFile(path.join(output,'ela-jpeg.wgsl'),bytes);await writeFile(path.join(output,'PINNED.json'),JSON.stringify({schema:1,reference:'libjpeg-turbo-3.0.3/ISLOW/baseline420',method:'native-integer-color-downsample-FDCT-quantize-IDCT-fancyupsample-color-and-exact-ELA-LUT',entropy:'lossless roundtrip fused only for pixel-only consumers; encoded evidence remains native',files:{'ela-jpeg.wgsl':{bytes:bytes.length,sha256},'ela-jpeg-archive.wgsl':{bytes:archive.length,sha256:archiveSha}}},null,2)+'\n');console.log(sha256);
