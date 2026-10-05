import {Budget} from '../src/cache.js';import {d2prlEntries,forgeryscopeEntries} from '../src/automatic-ai-entries.js';import {createCloneCorroboration} from '../src/clone-corroboration.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const assert=(v,m)=>{if(!v)throw Error(m);};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export async function cloneEntriesBrowserTest(){
 const ref=await(await fetch('/tests/data/clone-entries-native.json')).json(),{width,height,metadata,expected}=ref.large,budget=new Budget(192*1024**2),free=budget.reserve(width*height+1024**2),mask=new Uint8Array(width*height),fill=(x,y,r,b,value)=>{for(let yy=y;yy<b;yy++)mask.fill(value,yy*width+x,yy*width+r);};let result,forge,corroboration;
 try{fill(10,10,990,1000,1);fill(30,30,970,980,0);fill(100,100,500,500,1);fill(150,150,400,400,0);fill(550,550,900,750,1);fill(600,600,850,650,0);fill(0,1029,width,1030,1);
  result=await d2prlEntries({width,height,mask,metadata},{budget});const hash=await createSHA256(),records=[];
  for(const entry of result.entries){hash.init();hash.update(entry.pixel_mask.data);records.push({...entry,pixel_mask:{width:entry.pixel_mask.width,height:entry.pixel_mask.height,sha256:hash.digest('hex')}});}
  assert(same(records,expected),'Native large mask/contour/identity equality');
  corroboration=createCloneCorroboration({budget});let checkedPixels=0;await corroboration.stripes({width,height,entries:[...result.entries,...result.entries],stripRows:17},part=>{for(let i=0;i<part.values.length;i++)assert(part.values[i]===mask[part.top*width+i],'D2PRL union counted once including holes');checkedPixels+=part.values.length;});corroboration.dispose();corroboration=null;
  const c=ref.forgeryscope.at(-1);forge=await forgeryscopeEntries(c.input,{...c,budget});assert(same(forge.entries,c.expected),'Native positive Forgeryscope entries');forge.release();forge=null;result.release();result=null;free();assert(budget.total()===0,'Entry resources cleaned');
  return {passed:true,width,height,regions:records.length,checkedPixels,entries:records,exactNativeForgeryscopeEntries:c.expected.length,duplicateD2prlVotes:1,holesPreserved:true,memory:budget.snapshot()};
 }finally{corroboration?.dispose();forge?.release();result?.release();free();}
}
