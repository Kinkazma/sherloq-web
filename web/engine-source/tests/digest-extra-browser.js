import {createWorkerEngine} from '../src/worker-client.js';
export async function digestExtraBrowserTest(){
 const load=async url=>new Uint8Array(await(await fetch(url)).arrayBuffer()),small=await(await fetch('/fixtures/image-hash-reference.json')).json(),large=await(await fetch('/tests/data/digest-extra-native.json')).json(),engine=createWorkerEngine();let cases=0,values=0;
 function equal(actual,expected,name){if(actual.length!==expected.length)throw Error(name+' length');for(let i=0;i<actual.length;i++){if(actual[i]!==expected[i])throw Error(name+'/'+i);values++;}}
 try{
  for(const item of small.cases){const data=await load('/fixtures/'+item.file);await engine.load({id:'i',bytes:data,pixels:{width:item.width,height:item.height,format:'rgb8',data},provenance:{decoder:'native synthetic RGB fixture'}});const result=await engine.run({id:'d',imageId:'i',operation:'file.digest'});for(const [kind,name]of ['Average','Block mean','Color moments','Marr-Hildreth','pHash','Radial variance'].entries())equal(result.data.imageHashes[name],item.hashes[kind].values,name);cases++;await engine.unload('i');}
  for(const item of large.cases){await engine.load({id:'i',bytes:await load('/tests/data/'+item.file)});const result=await engine.run({id:'d',imageId:'i',operation:'file.digest'});for(const [name,expected]of Object.entries(item.hashes))equal(result.data.imageHashes[name],expected,name);result.data.imageHashes['Marr-Hildreth'][0]^=255;const cached=await engine.run({id:'cache',imageId:'i',operation:'file.digest'});if(!cached.metrics.cache.result)throw Error('Cache miss');equal(cached.data.imageHashes['Marr-Hildreth'],item.hashes['Marr-Hildreth'],'owned cache');cases++;await engine.unload('i');}
  return {status:'passed',cases,values,different:0,visualAlgorithms:6,includesOriginalByte1MP:true,cacheOwnership:true};
 }finally{engine.dispose();}
}
