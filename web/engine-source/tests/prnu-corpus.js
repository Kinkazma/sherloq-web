import {cvPrnuResidual} from '../src/opencv.js';
import {prnuNcc,prnuMean,identifyPrnu,PRNU_THRESHOLD} from '../src/prnu.js';
import {readPrnuDatabase,writePrnuDatabase} from '../src/prnu-hdf5.js';
import {numpyBufferedSum} from '../src/numpy-sum.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const identical=(a,b)=>a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
export function prnuRecipe(recipe){
 let state=recipe.seed;const values=new Float64Array(recipe.shape[0]*recipe.shape[1]);
 for(let i=0;i<values.length;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;values[i]=(state/4294967295-.5)*recipe.scale+recipe.offset;}
 return {width:recipe.shape[1],height:recipe.shape[0],values};
}
const crop=(a,width,height)=>{const values=new Float64Array(width*height);for(let y=0;y<height;y++)values.set(a.values.subarray(y*a.width,y*a.width+width),y*width);return values;};
export async function prnuCorpus(read,decode){
 const ref=JSON.parse(new TextDecoder().decode(await read('prnu-reference.json'))),rows=[];
 for(const f of ref.cases){
  let actual,error;try{actual=await cvPrnuResidual({width:f.width,height:f.height,format:'rgb8',data:await read(f.file)});}catch(e){error=e;}
  if(f.error){check(error?.code==='INVALID_INPUT',f.name+' expected invalid dimensions');rows.push({name:f.name,rejected:true});continue;}
  if(error)throw error;
  const bytes=await read(f.residual),expected=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8);
  check(actual.width===f.shape[1]&&actual.height===f.shape[0],f.name+' residual shape');
  check(identical(actual.values,expected),f.name+' residual bits');
  check(Object.is(actual.noisePower,f.noisePower),f.name+' noise power bits');
  check(actual.method===f.method,f.name+' SciPy method choice');
  rows.push({name:f.name,method:actual.method,values:actual.values.length,exact:true});
 }
 for(const f of [...ref.nccPairs,...ref.nccLargePairs]){
  const convert=x=>x.values?{width:x.shape[1],height:x.shape[0],values:Float64Array.from(x.values)}:prnuRecipe(x);
  const a=convert(f.first),b=convert(f.second),score=prnuNcc(a,b);
  check(Object.is(score,f.score),f.name+' score '+score+' != '+f.score);
  check((score>=PRNU_THRESHOLD)===f.reachesThreshold,f.name+' experimental threshold');
  if('meanA' in f){const width=Math.min(a.width,b.width),height=Math.min(a.height,b.height),n=width*height;check(Object.is(numpyBufferedSum(crop(a,width,height))/n,f.meanA),f.name+' cropped mean A');check(Object.is(numpyBufferedSum(crop(b,width,height))/n,f.meanB),f.name+' cropped mean B');}
 }
 const options={maxWorkingBytes:512*1024**2},query=await decode(await read(ref.query.file)),databases=[];
 for(const f of ref.databases){
  let actual,error;try{actual=await identifyPrnu(query,await readPrnuDatabase(await read(f.file),options),ref.query.sha256);}catch(e){error=e;}
  if(f.error){check(error?.code==='INVALID_INPUT',f.name+' invalid database');databases.push({name:f.name,rejected:true});continue;}
  if(error)throw error;
  check(actual.scores.length===f.scores.length,f.name+' camera count');
  for(let i=0;i<f.scores.length;i++)check(actual.scores[i].camera===f.scores[i][0]&&Object.is(actual.scores[i].score,f.scores[i][1]),f.name+' ranked score '+i);
  for(let i=0;i<f.scores.length;i++)check(actual.scores[i].scoreText===f.scoreTexts[i]&&actual.scores[i].gapText===(i===0?f.gapText:''),f.name+' native displayed decimal');
  check(actual.gapAboveHistoricalDisplayCutoff===f.gapAboveHistoricalDisplayCutoff,f.name+' historical gap display cutoff');
  check(actual.reachesExperimentalThreshold===f.reachesThreshold,f.name+' score threshold');
  if(f.name==='legacy')check(actual.legacy&&!actual.trainingMembershipVerified,'Legacy snapshot membership must remain unverified');
  databases.push({name:f.name,exact:true});
 }
 const fingerprints=[];
 for(const f of ref.fingerprints){
  const residuals=[];for(const image of ref.training.filter(x=>x.camera===f.camera))residuals.push(await cvPrnuResidual(await decode(await read(image.file))));
  const actual=await prnuMean(residuals),bytes=await read(f.file),expected=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8);
  check(actual.width===f.shape[1]&&actual.height===f.shape[0]&&identical(actual.values,expected),f.camera+' incremental fingerprint bits');fingerprints.push({camera:f.camera,values:actual.values.length,exact:true});
 }
 const native=await readPrnuDatabase(await read('prnu-snapshot.h5'),options),exported=await writePrnuDatabase(native,options),reread=await readPrnuDatabase(exported,options);
 for(let i=0;i<native.cameras.length;i++){const a=native.cameras[i],b=reread.cameras[i];check(a.name===b.name&&identical(a.fingerprint.values,b.fingerprint.values),'HDF5 float64 write/read');check(JSON.stringify({...a,fingerprint:null})===JSON.stringify({...b,fingerprint:null}),'HDF5 metadata write/read');}
 return {schema:1,status:'core-parity-passed',rows,nccPairs:ref.nccPairs.length,nccLargePairs:ref.nccLargePairs.length,databases,fingerprints,exportBytes:exported.length};
}
