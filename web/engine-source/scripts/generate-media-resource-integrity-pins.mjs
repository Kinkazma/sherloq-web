import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),pinned=JSON.parse(await readFile(new URL('vendor/media/PINNED.json',root))),target=new URL('src/media-resource-integrity.js',root),entries=[['magick','magick/x86/magick.wasm'],['avifSt','avif/avif-st.wasm'],['srgb','srgb.icc']],rows=[];
for(const[id,file]of entries){
 const bytes=await readFile(new URL('vendor/media/'+file,root)),digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==pinned.files[file])throw Error('Pinned media source differs: '+file);
 rows.push(' '+id+":Object.freeze({file:'"+file+"',url:new URL('../vendor/media/"+file+"',import.meta.url).href,bytes:"+bytes.length+",sha256:'"+digest+"'})");
}
const block='// BEGIN GENERATED MEDIA PINS\nexport const MEDIA_RESOURCE_PINS=Object.freeze({\n'+rows.join(',\n')+'\n});\n// END GENERATED MEDIA PINS',before=await readFile(target,'utf8'),pattern=/\/\/ BEGIN GENERATED MEDIA PINS[\s\S]*?\/\/ END GENERATED MEDIA PINS/;
if(!pattern.test(before))throw Error('Media pin block is missing');
const after=before.replace(pattern,block);
if(process.argv.includes('--check')){if(after!==before)throw Error('Media resource pins require regeneration');}
else if(after!==before)await writeFile(target,after);
console.log(JSON.stringify({status:'pinned-media-identities-match',resources:entries.length}));
