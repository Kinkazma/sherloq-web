import {Budget} from '../src/cache.js';
import {createDenseRegions} from '../src/dense-regions.js';
import {checkAbort,serializeEngineError} from '../src/errors.js';
const MiB=1024**2,ensure=(ok,message)=>{if(!ok)throw Error(message);};
function same(a,b,label){ensure(a.length===b.length,label+' length');const aa=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),bb=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);ensure(aa.length===bb.length&&aa.every((value,index)=>value===bb[index]),label+' bits');}
const bits=value=>{const bytes=new Uint8Array(8);new DataView(bytes.buffer).setFloat64(0,value,true);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function corpus(){
 const width=577,height=385,data=new Uint8Array(width*height*3);let seed=0x975134af;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 for(let i=0;i<data.length;i++)data[i]=random()&255;
 for(let y=0;y<192;y++)for(let x=0;x<192;x++)for(let c=0;c<3;c++){const value=data[(y*width+x)*3+c];data[(y*width+x+192)*3+c]=value;data[(y*width+575-x)*3+c]=value;}
 const coordinates=Array.from({length:80},(_,i)=>[10+i%10*17,10+Math.floor(i/10)*21]);
 coordinates.push([4,4],[5,5],[6,6],[64,64],[127,127],[128,128],[192,192],[511,319],[569,377],[572,380]);
 const points=new Float32Array(coordinates.length*7);coordinates.forEach(([x,y],i)=>{points[i*7]=x;points[i*7+1]=y;points[i*7+2]=8;points[i*7+6]=1;});
 const all=Array.from({length:80},(_,i)=>i),identity=[[1,0,0],[0,1,0],[0,0,1]],model=(name,matrix=identity,ids=all)=>({name,matrix,source_point_indices:ids});
 const models=[model('identity'),model('translation',[[1,0,192],[0,1,0],[0,0,1]]),model('mirror',[[-1,0,575],[0,1,0],[0,0,1]]),model('fractional',[[1,0,192.5],[0,1,.5],[0,0,1]]),model('unrelated',[[1,0,0],[0,1,192],[0,0,1]]),model('scale',[[1.125,0,192],[0,1.125,0],[0,0,1]]),model('perspective',[[1,0,192],[0,1,0],[.00003,.00002,1]]),model('five-samples',identity,all.slice(0,5)),model('six-samples',identity,all.slice(0,6)),model('outside',[[1,0,width*2],[0,1,0],[0,0,1]]),model('image-and-tile-boundaries',identity,Array.from({length:10},(_,i)=>80+i))];
 const x=new Float32Array(2592),y=new Float32Array(2592),edges=[-.5,0,.015625,.046875,63.984375,64.015625,127.984375,128.015625,width-.03125,width-.015625,width+.25];
 for(let i=0;i<x.length;i++){x[i]=i<edges.length?edges[i]:random()/2**32*(width+2)-1;y[i]=i<edges.length?i%2?0:height-.015625:random()/2**32*(height+2)-1;}
 return {width,height,data,points,models,groups:models.map(value=>value.source_point_indices.slice()),x,y};
}
function source(c,budget,signal){
 let readWindow=0,liveWindows=0;const rectangles=[];
 return {get reads(){return readWindow;},get liveWindows(){return liveWindows;},rectangles,surface:{descriptor:{id:'deterministic-detail',width:c.width,height:c.height,format:'rgb8'},async readWindow(rect){
  checkAbort(signal);const {x,y,width,height}=rect;readWindow++;rectangles.push([x,y,width,height]);const release=budget.reserve(width*height*3),data=new Uint8Array(width*height*3);liveWindows++;
  for(let row=0;row<height;row++)data.set(c.data.subarray(((y+row)*c.width+x)*3,((y+row)*c.width+x+width)*3),row*width*3);
  let closed=false;return {pixels:{width,height,format:'rgb8',data},release(){if(closed)return;closed=true;liveWindows--;release();}};
 }}};
}
async function modules(variant){return Promise.all([import(variant==='before'?'/__baseline/dense-detail.js':'../src/dense-detail.js'),import(variant==='before'?'/__baseline/dense-paged-detail.js':'../src/dense-paged-detail.js')]);}
async function parity(variant){
 const start=performance.now(),[[api,paged],c]=await Promise.all([modules(variant),Promise.resolve(corpus())]),budget=new Budget(64*MiB),releaseInput=budget.reserve(c.data.byteLength),image=source(c,budget),native=await createDenseRegions(),detail=native.detail(c),reference=native.sampler(detail);let sampler,result;
 try{
  sampler=await paged.createPagedDetailSampler(image,{budget});const first=await sampler.sample(c.x,c.y,32,81),expected=reference.sample(c.x,c.y,32,81);same(first,expected,'global native versus paged boundaries');const coldReads=image.reads;
  same(await sampler.sample(c.x,c.y,32,81),first,'warm-cache boundary samples');ensure(image.reads===coldReads,'warm sampler reread input');
  const scores=[],referenceScores=[];let usefulSamples=0;
  const wrapped={sample(...args){usefulSamples++;return sampler.sample(...args);}};
  const scoresStart=performance.now();
  for(const model of c.models){const actual=await api.corroborateDenseDetail(sampler.detail,wrapped,c.points,model),expected=await api.corroborateDenseDetail(detail,reference,c.points,model);ensure(JSON.stringify(actual)===JSON.stringify(expected),'native score mismatch '+model.name);scores.push({name:model.name,...actual,nccBits:bits(actual.ncc)});referenceScores.push(expected);}
  const scoreMilliseconds=performance.now()-scoresStart,groupsStart=performance.now(),groups=await api.corroborateDenseGroups(sampler.detail,wrapped,c.points,c.groups,c.models),groupMilliseconds=performance.now()-groupsStart;
  const accepted=referenceScores.flatMap((score,index)=>score.accepted?[index]:[]),expectedGroups={groups:accepted.map(index=>c.groups[index]),models:accepted.map(index=>({...c.models[index],detail_corroboration:referenceScores[index]}))};
  ensure(JSON.stringify(groups)===JSON.stringify(expectedGroups),'model/group identity or order changed');ensure(scores.find(value=>value.name==='translation').accepted&&scores.find(value=>value.name==='mirror').accepted,'known copies rejected');ensure(!scores.find(value=>value.name==='unrelated').accepted&&!scores.find(value=>value.name==='five-samples').accepted&&!scores.find(value=>value.name==='outside').accepted,'known invalid model accepted');
  result={variant,width:c.width,height:c.height,modelCount:c.models.length,modelsScored:scores,acceptedModelNames:groups.models.map(model=>model.name),groups,globalSampleSha256:await hash(first),readWindow:coldReads,readWindowFinal:image.reads,readRectangles:image.rectangles,usefulSamples,scoreMilliseconds,groupMilliseconds};
 }finally{sampler?.dispose();paged.clearPagedDetailCache(image,budget);reference.dispose();releaseInput();}
 ensure(image.liveWindows===0&&budget.total()===0,'parity owners leaked');return {...result,totalMilliseconds:performance.now()-start,finalAccountedBytes:budget.total(),peakAccountedBytes:budget.peak};
}
async function cancellation({variant,delivery,path,port}){
 const [api,paged]=await modules(variant),c=corpus(),budget=new Budget(64*MiB),controller=new AbortController(),releaseInput=budget.reserve(c.data.byteLength),image=source(c,budget,controller.signal);let sampler,reference,math,started=false,samples=0,abortAt,code;
 const abort=()=>{abortAt=performance.now();controller.abort();};port.onmessage=abort;port.start();
 try{
  let detail;if(path==='paged'){sampler=await paged.createPagedDetailSampler(image,{budget,signal:controller.signal});await sampler.sample(c.x,c.y,32,81);detail=sampler.detail;reference=sampler;}
  else{math=await createDenseRegions();detail=math.detail(c);reference=math.sampler(detail);}
  const wrapped={sample(...args){samples++;if(!started){started=true;postMessage({started:true,variant,delivery,path});if(delivery==='timer')setTimeout(abort,0);}return reference.sample(...args);}},models=Array.from({length:128},(_,i)=>c.models[i%c.models.length]),groups=models.map(value=>value.source_point_indices);
  try{await api.corroborateDenseGroups(detail,wrapped,c.points,groups,models,{signal:controller.signal});throw Error('Cancellation did not interrupt model traversal');}catch(error){code=error.code;if(code!=='CANCELLED')throw error;}
 }finally{sampler?.dispose();if(!sampler)reference?.dispose();paged.clearPagedDetailCache(image,budget);releaseInput();port.close();}
 ensure(started&&samples>0,'Cancellation arrived before useful sampling');ensure(image.liveWindows===0&&budget.total()===0,'cancelled owner leaked');return {variant,delivery,path,code,usefulSamples:samples,readWindow:image.reads,abortToSettlementMilliseconds:performance.now()-abortAt,finalAccountedBytes:budget.total()};
}
self.onmessage=async({data})=>{try{postMessage({result:data.mode==='cancel'?await cancellation(data):await parity(data.variant)});}catch(error){postMessage({error:serializeEngineError(error)});}};
