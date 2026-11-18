import test from 'node:test';
import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {mapLoupePresentation} from '../sherloq-browser/assets/pointer-loupe.js';

// Source UI functions are evaluated unchanged. Real photographic bytes supply
// transport windows; no SHERLOQ/equalization calculation or image export runs.
const H=new URL('../../../../',import.meta.url),appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url),appText=await readFile(appURL,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
function fragment(name,next){const start=appText.indexOf('function '+name+'('),end=appText.indexOf('\nfunction '+next+'(',start);assert.ok(start>=0&&end>start);return appText.slice(start,end);}
const published=fragment('nativeMagnifierPublished','attachNativeMagnifierEffect'),attach=fragment('attachNativeMagnifierEffect','nativeMagnifierEffectsSurface');
const manifest=JSON.parse(await readFile(new URL('bit-depth-domain-comparison-20261116/REAL-CROP-DOMAINS.json',H))),domain=manifest.domains.find(d=>d.domain==='sdr8');
assert.deepEqual([domain.width,domain.height,domain.byteLength],[512,512,786432]);
const photo=new Uint8Array(domain.byteLength),input=await open(manifest.data.path,'r');try{assert.equal((await input.read(photo,0,photo.length,domain.offset)).bytesRead,photo.length);}finally{await input.close();}assert.equal(sha(photo),domain.sha256);
function photoWindow(rect){assert.ok([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger));assert.ok(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=512&&rect.y+rect.height<=512);const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++){const start=((rect.y+y)*512+rect.x)*3;data.set(photo.subarray(start,start+rect.width*3),y*rect.width*3);}return{width:rect.width,height:rect.height,format:'rgb8',data};}
const copyBounds=value=>({left:value.left,top:value.top,right:value.right,bottom:value.bottom});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function drawing(){const calls=[],stack=[];let transform={sx:1,sy:1,x:0,y:0};return{calls,get transform(){return{...transform};},save(){stack.push({...transform});calls.push(['save']);},restore(){transform=stack.pop();calls.push(['restore']);},translate(x,y){transform.x+=transform.sx*x;transform.y+=transform.sy*y;calls.push(['translate',x,y]);},scale(x,y){transform.sx*=x;transform.sy*=y;calls.push(['scale',x,y]);},beginPath(){},rect(...args){calls.push(['rect',...args]);},clip(){calls.push(['clip']);},imageSmoothingEnabled:false};}
function fixture({roi=false,hold=false,invalidTransform=false}={}){
 const bounds=roi?[64,48,448,432]:[0,0,512,512],calls=[],state={current:true,key:'captured-core-key'},gate=hold?deferred():null;
 const base={width:512,height:512,prepare(b,scale,options){calls.push({provider:'original-prepare',bounds:copyBounds(b),scale,options});return true;},draw(ctx,b,scale){calls.push({provider:'original-draw',bounds:copyBounds(b),scale,transform:ctx.transform});},fork(){return{...base,close(){calls.push({provider:'original-fork-close'});}};},readPixels(){throw Error('Presentation must not read scientific Original pixels.');}};
 const display=Object.freeze({id:'core256-'+(roi?'roi':'whole'),revision:1,width:256,height:256,format:'rgb8',coordinates:'selected-output-resolution'});
 const frame={width:256,height:256,display,presentationRevision:3,
  async readDisplayPixels(rect){assert.ok([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger));assert.ok(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=256&&rect.y+rect.height<=256,'Core reads must stay on its actual 256 grid');calls.push({provider:'core-display',rect:{...rect}});const pixels=photoWindow({x:96+rect.x,y:80+rect.y,width:rect.width,height:rect.height});if(gate)await gate.promise;return pixels;},
  readPixels(){throw Error('Presentation must use the Core display reader.');},prepare(b,scale,options){calls.push({provider:'core-prepare',bounds:copyBounds(b),scale,options});return true;},draw(ctx,b,scale){calls.push({provider:'core-draw',bounds:copyBounds(b),scale,transform:ctx.transform});}
 };
 const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1],transform=Object.freeze({sourceWidth:width,sourceHeight:height,outputWidth:invalidTransform?512:256,outputHeight:256,toSource:Object.freeze([width/256,height/256]),toOutput:Object.freeze([256/width,256/height])});
 const output=Object.freeze({id:'published-core',operation:'inspection.magnifier',surface:display,data:Object.freeze({bounds:Object.freeze(bounds),width:256,height:256,coordinateDomain:'selected-output-resolution'}),presentationCoordinateTransform:transform,provenance:Object.freeze({precision:Object.freeze({effectiveWorkingDepth:8})}),metrics:Object.freeze({inputDepth:8,backend:'cpu'})});
 const before=structuredClone(output),publication={output,key:state.key,owner:{id:'scope'},visualBinding:{sourceSha256:manifest.source.sha256}};
 const context=vm.createContext({Uint8Array,Map,Set,Number,Array,Object,Error,RangeError,mapLoupePresentation,nativeMagnifierPublication:publication,comparisonSurface:()=>base,sourceRegionTaskIsCurrent:()=>state.current,nativeMagnifierTaskKey:()=>state.key,resultMeta:{id:output.id},nativeMagnifierEffect:null,nativeMagnifierVisual:null,nativeMagnifierPresentationSerial:0,currentOperationWorkingDepth:()=>8,result:frame,scheduleDraw(){}});
 new vm.Script("'use strict';\n"+published+'\n'+attach+'\nglobalThis.__attach=attachNativeMagnifierEffect;',{filename:appURL.pathname+'#actual-functions'}).runInContext(context);context.__attach(frame);
 const effect=context.nativeMagnifierEffect;
 return{effect,frame,display,output,before,calls,state,context,gate,bounds,retire(kind){if(kind==='close')effect.close();else if(kind==='source')state.current=false;else if(kind==='key')state.key='replacement-key';else if(kind==='result')context.result={display:{id:'replacement'}};else throw Error('Unknown retirement');},unchanged(){assert.deepEqual(output,before);assert.equal(output.surface,display);assert.equal(frame.width,256);assert.equal(frame.height,256);assert.equal(display.width,256);assert.equal(display.height,256);}};
}

test('actual app keeps a reduced whole Core producer at256 and maps only presentation to Original512',async()=>{
 const h=fixture();try{
  assert.ok(h.effect);assert.equal(h.effect.frame,h.frame);assert.equal(h.effect.width,512);assert.equal(h.effect.height,512);assert.equal(h.effect.metrics.workingDepth,8);const producer=h.effect.prefetchSource;assert.equal(producer.width,256);assert.equal(producer.height,256);
  for(const rect of [{x:0,y:0,width:128,height:128},{x:192,y:192,width:64,height:64}]){const pixels=await producer.readDisplayPixels(rect);assert.deepEqual(pixels.data,photoWindow({x:96+rect.x,y:80+rect.y,width:rect.width,height:rect.height}).data);}
  const b={left:64,top:96,right:320,bottom:352},options={priority:'loupe'};assert.equal(h.effect.prepare(b,2,options),true);const prepare=h.calls.find(x=>x.provider==='core-prepare');assert.deepEqual(prepare.bounds,{left:32,top:48,right:160,bottom:176});assert.equal(prepare.scale,4);assert.equal(prepare.options,options);
  const ctx=drawing();h.effect.draw(ctx,b,2);const draw=h.calls.find(x=>x.provider==='core-draw');assert.deepEqual(draw.bounds,prepare.bounds);assert.deepEqual(draw.transform,{sx:2,sy:2,x:0,y:0});assert.equal(draw.scale,4);assert.ok(!h.calls.some(x=>x.provider.startsWith('original-')));h.unchanged();
 }finally{h.effect?.close();}
});

test('actual app maps a reduced ROI and its prefetched replacement without Original-grid Core reads',async()=>{
 const h=fixture({roi:true});try{
  const producer=h.effect.prefetchSource;assert.deepEqual([producer.width,producer.height],[256,256]);const rect={x:160,y:176,width:80,height:64},pixels=await producer.readPixels(rect);assert.deepEqual(pixels.data,photoWindow({x:256,y:256,width:80,height:64}).data);
  const warmedCalls=[],warmed={width:256,height:256,presentationRevision:9,setInteractive:value=>warmedCalls.push({interactive:value}),prepare(b,scale,options){warmedCalls.push({provider:'prepared',bounds:copyBounds(b),scale,options});return true;},draw(ctx,b,scale){warmedCalls.push({provider:'drawn',bounds:copyBounds(b),scale,transform:ctx.transform});}};
  const mapped=h.effect.mapPrefetched(warmed);assert.deepEqual([mapped.width,mapped.height],[512,512]);assert.equal(mapped.frame,h.frame);mapped.setInteractive(true);assert.equal(warmedCalls[0].interactive,true);mapped.setInteractive(false);assert.equal(warmedCalls[1].interactive,false);
  const b={left:160,top:144,right:352,bottom:336};assert.equal(mapped.prepare(b,2,{priority:'loupe'}),true);const prepare=warmedCalls.find(x=>x.provider==='prepared');assert.deepEqual(prepare.bounds,{left:64,top:64,right:192,bottom:192});assert.equal(prepare.scale,3);
  const ctx=drawing();mapped.draw(ctx,b,2);const draw=warmedCalls.find(x=>x.provider==='drawn');assert.deepEqual(draw.bounds,prepare.bounds);assert.deepEqual(draw.transform,{sx:1.5,sy:1.5,x:64,y:48});assert.equal(draw.scale,3);assert.deepEqual(ctx.calls.find(x=>x[0]==='rect'),['rect',64,48,384,384]);assert.ok(h.calls.some(x=>x.provider==='original-draw'));
  assert.equal(h.calls.filter(x=>x.provider==='core-display').length,1,'mapping and drawing do not request new Core pixels');assert.ok(h.calls.filter(x=>x.provider==='core-display').every(x=>x.rect.x+x.rect.width<=256&&x.rect.y+x.rect.height<=256));h.unchanged();
 }finally{h.effect?.close();}
});

test('actual scaled producer rejects retired publications before, after and on a failed asynchronous read',async()=>{
 for(const roi of [false,true])for(const kind of ['close','source','key','result']){
  const h=fixture({roi});h.retire(kind);await assert.rejects(h.effect.prefetchSource.readDisplayPixels({x:0,y:0,width:64,height:64}),{code:'CANCELLED'});assert.equal(h.calls.length,0);h.effect.close();h.unchanged();
 }
 for(const reject of [false,true]){
  const h=fixture({roi:true,hold:true}),pending=h.effect.prefetchSource.readDisplayPixels({x:160,y:176,width:80,height:64}),checked=assert.rejects(pending,{code:'CANCELLED'});assert.equal(h.calls.length,1);h.retire('result');if(reject)h.gate.reject(Object.assign(Error('Core record retired while awaiting display'),{code:'UNKNOWN_SURFACE'}));else h.gate.resolve();await checked;await assert.rejects(h.effect.prefetchSource.readPixels({x:0,y:0,width:1,height:1}),{code:'CANCELLED'});assert.equal(h.calls.length,1);h.effect.close();h.unchanged();
 }
});

test('actual app requires the declared output transform and leaves the Core descriptor export geometry unchanged',async()=>{
 const invalid=fixture({invalidTransform:true});assert.equal(invalid.effect,null);assert.equal(invalid.calls.length,0);invalid.unchanged();
 for(const roi of [false,true]){const h=fixture({roi});const producer=h.effect.prefetchSource;await producer.readDisplayPixels({x:0,y:0,width:256,height:256});assert.equal(h.calls.filter(x=>x.provider==='core-display').length,1);h.unchanged();h.effect.close();}
 assert.equal(sha(photo),domain.sha256,'the existing real photographic fixture is unchanged');assert.equal(await readFile(appURL,'utf8'),appText,'app Source stayed unchanged during qualification');
});
