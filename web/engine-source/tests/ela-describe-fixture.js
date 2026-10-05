import {createElaCellDescriber} from '../src/ela-cell-describe.js';
import {createElaPeerScorer} from '../src/ela-peer-scores.js';
import {coherentCellScores,segmentElaCells} from '../src/ela-cell-tools.js';
import {Budget} from '../src/cache.js';
import {imageCodec} from '../src/codecs.js';
import {jpegCodec} from '../src/jpeg.js';

export async function checkElaDescribe({load,describeWasm,peersWasm}){
 const ref=JSON.parse(new TextDecoder().decode(await load('ela-describe-native.json'))),budget=new Budget(160*1024**2),describer=createElaCellDescriber({budget,wasmBinary:describeWasm}),scorer=createElaPeerScorer({budget,wasmBinary:peersWasm});
 const pattern=await imageCodec.decode(await load('recompression-2.png')),texture=await imageCodec.decode(await load('ela-content.png')),odd={width:473,height:277,format:'rgb8',data:new Uint8Array(473*277*3)};
 for(let y=0;y<odd.height;y++)odd.data.set(texture.data.subarray(y*texture.width*3,(y*texture.width+odd.width)*3),y*odd.width*3);
 const sources=[pattern,texture,odd],metrics={preparations:0,scoreGroups:0,segmentations:0,values:0,maximumContentError:0};
 function equal(actual,expected,name,tolerance=0){const flat=Array.isArray(expected)?expected.flat(5).map(Number):expected;if(actual.length!==flat.length)throw Error(name+' length');for(let i=0;i<flat.length;i++){const error=Math.abs(actual[i]-flat[i]);if(error>tolerance)throw Error(`${name}/${i}: ${actual[i]} != ${flat[i]}`);if(name==='content')metrics.maximumContentError=Math.max(metrics.maximumContentError,error);metrics.values++;}}
 try{
  for(const group of ref.groups){
   const image=sources[Number(group.source.split('-')[1].split('.')[0])],n=group.rows*group.cols,profiles=new Float32Array(n*15),background=new Float32Array(n*9);let content,usable;
   for(const [qi,q]of [70,75,80].entries()){
    const compressed=await jpegCodec.recompress(image,q),result=await describer.describe(image,compressed,group.block),expected=ref.cases.find(c=>c.source===group.source&&c.block===group.block&&c.compressed===group.source.replace('.rgb','-'+q+'.rgb'));
    try{for(const key of ['content','profiles','usable','background'])equal(result[key],expected[key],key,key==='content'?3e-7:0);
     for(let i=0;i<n;i++){profiles.set(result.profiles.subarray(i*5,i*5+5),i*15+qi*5);background.set(result.background.subarray(i*3,i*3+3),i*9+qi*3);}content=result.content.slice();usable=result.usable.slice();metrics.preparations++;
    }finally{result.release();}
   }
   const shape={rows:group.rows,cols:group.cols},legacy=await scorer.score({...shape,content,supported:usable,profiles}),supported=Uint8Array.from(legacy.peer_count,v=>v>=16),bg=await scorer.score({...shape,content,supported,profiles:background,kind:'background'});
   try{
    for(const key of ['quality_scores','signed_scores','peer_count'])equal(legacy[key],group[key],key);
    for(const key of Object.keys(group.background))equal(bg[key],group.background[key],key);
    const coherent=await coherentCellScores({...shape,supported,signed_scores:legacy.signed_scores}),legacy_score=Float32Array.from({length:n},(_,i)=>[...legacy.quality_scores.subarray(i*3,i*3+3)].sort((a,b)=>a-b)[1]),score=Float32Array.from(legacy_score,(v,i)=>Math.max(v,coherent[i]));
    equal(coherent,group.coherent_score,'coherent');equal(score,group.score,'score');metrics.scoreGroups++;
    const combined=Float32Array.from(score,(v,i)=>Math.max(v,bg.background_score[i]));
    for(const expected of group.segments){const result=await segmentElaCells({...shape,score:combined,legacy_score,signed_scores:legacy.signed_scores,supported,...bg,metadata:{block:group.block}},{threshold:expected.threshold,minimum:expected.minimum});equal(result.labels,expected.labels,'labels');if(JSON.stringify(result.regions)!==JSON.stringify(expected.regions))throw Error('Region metadata differ');metrics.segmentations++;}
   }finally{legacy.release();bg.release();}
  }
 }finally{describer.dispose();scorer.dispose();}
 if(budget.total())throw Error('Descriptor budget leak');return {status:'passed',...metrics,peakAccountedBytes:budget.peak};
}
