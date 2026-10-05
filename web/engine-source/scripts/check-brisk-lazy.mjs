import {readFile,writeFile} from 'node:fs/promises';
import {gray} from '../src/pixel-utils.js';
import {cloningDetect,cloningSelect,cloningDescribeBrisk} from '../src/cloning-math.js';
const base=new URL('../.build/m3/',import.meta.url),ref=JSON.parse(await readFile(new URL('sparse-reference.json',base))),rgb=await readFile(new URL('sparse-rgb.bin',base)),input=Uint8Array.from({length:ref.width*ref.height},(_,i)=>gray(rgb[i*3],rgb[i*3+1],rgb[i*3+2])),records=[];
for(const masked of [false,true]){
 const mask=masked?Uint8Array.from({length:input.length},(_,i)=>+(i%ref.width<ref.width/2)):null,full=await cloningDetect(input,mask,ref.width,ref.height,{algorithm:'BRISK'}),lazy=await cloningDetect(input,mask,ref.width,ref.height,{algorithm:'BRISK',pointsOnly:true});
 if(full.total!==lazy.total||lazy.descriptors.length)throw Error('Lazy detection population changed');
 for(const response of [0,30,90,100]){const expected=await cloningSelect(full,response),selected=await cloningSelect(lazy,response),actual=await cloningDescribeBrisk(selected,input,ref.width,ref.height),record={masked,response,total:lazy.total,selected:actual.points.length/7,pointDifferences:actual.points.reduce((s,v,i)=>s+(v!==expected.points[i]),0),descriptorDifferences:actual.descriptors.reduce((s,v,i)=>s+(v!==expected.descriptors[i]),0)};
  if(actual.points.length!==expected.points.length||actual.descriptors.length!==expected.descriptors.length||record.pointDifferences||record.descriptorDifferences)throw Error(JSON.stringify(record));records.push(record);
 }
}
await writeFile(new URL('../docs/m3-brisk-lazy-proof.json',import.meta.url),JSON.stringify({reference:'full qualified BRISK detectAndCompute before response selection',records},null,2)+'\n');console.log(JSON.stringify(records));
