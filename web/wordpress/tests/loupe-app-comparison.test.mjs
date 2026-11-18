import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Descriptor/control flow only: actual app functions, no pixels or engine.
const appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url),appText=await readFile(appURL,'utf8');
const remoteText=await readFile(new URL('../sherloq-browser/assets/remote-surface.js',import.meta.url),'utf8'),previewStart=remoteText.indexOf('export function previewSurfaceIsCurrent('),previewEnd=remoteText.indexOf('\n// One immutable',previewStart);assert.ok(previewStart>=0&&previewEnd>previewStart);const previewCurrent=remoteText.slice(previewStart,previewEnd).replace(/^export /,'');
function fragment(name,next){const start=appText.indexOf('function '+name+'('),end=appText.indexOf('\nfunction '+next+'(',start);assert.ok(start>=0&&end>start,name);return appText.slice(start,end);}
const sourceOwner=fragment('presentedFrameSourceCurrent','retireResult'),preparedPaint=fragment('reportPreparedMagnifierPainted','beginSourceFrame'),inputs=appText.slice(appText.indexOf('function loupeInputSurface('),appText.indexOf('\nconst displayedZoom=',appText.indexOf('function loupeInputSurface('))),draw=fragment('draw','rememberSourceRegionPresentationSpace');
assert.ok(inputs.includes('function loupeInputCamera(')&&inputs.includes('function setCompareOriginal('));
const pointerStart=appText.indexOf('pointerLoupe=createPointerLoupe('),providerStart=appText.indexOf('getSurface:',pointerStart),providerEnd=appText.indexOf(',getComparingOriginal:',providerStart);assert.ok(pointerStart>=0&&providerStart>pointerStart&&providerEnd>providerStart);const providers=appText.slice(providerStart,providerEnd);
function fixture({registered=true,localMain=false}={}){
 const calls=[],state={afterReady:true},elements=new Map(),ownerMap=new WeakMap();let context;
 const original={width:2048,height:1536,prepare(){calls.push('original-prepare');return true;},draw(){calls.push('original-painted');}};
 const after={width:512,height:256,prepare(){calls.push('after-prepare');return state.afterReady;},draw(){calls.push('after-painted');}};
 const $=id=>{if(!elements.has(id))elements.set(id,{value:id==='layer'?'result':'',classList:{contains:()=>false}});return elements.get(id);};
 const noop=()=>{},canvasContext={isContextLost:()=>false,setTransform:noop,clearRect:noop,save:noop,translate:noop,scale:noop,restore:noop};
 const snapshot={fingerprint:'source-snapshot'},scope={fingerprint:'source-scope'};
 context=vm.createContext({WeakMap,Map,Object,Math,Number,Error,
  loupeComparisonFrame:null,loupeComparisonCurrent:null,loupeComparisonCamera:null,presentedSurface:after,presentedFrameOwners:ownerMap,comparingOriginal:false,acknowledgedToolFrames:new WeakSet(),preparedMagnifierPaintTicket:null,requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  zoom:1.25,offset:{x:17,y:19},source:original,fileInput:{name:'retained-source'},imageId:'original-id',hash:'original-sha',activeAnalysis:'inspection.sherloq7c',elaMode:'classic',regionController:{scope},sourceRegionsStale:false,sourceRegionsLocalOverride:false,sourceRegionsSnapshot:()=>snapshot,
  destroyed:false,drawing:false,individualMode:()=>true,automaticMode:()=>false,compositeMode:()=>false,individualUI:{presentationMethodIdentity:()=> 'same-method',setOriginal:value=>calls.push(['panel-original',value])},localMagnifier:()=>localMain,comparisonSurface:()=>context.source,$,
  pointerLoupe:{enabled:true,draw:()=>calls.push('loupe-draw')},host:{visible:()=>true,changed:noop,sourceOnly:false},view:{clientWidth:800,clientHeight:600},devicePixelRatio:1,canvas:{width:800,height:600},ctx:canvasContext,mainGraphics:{lost:false},layouts:null,
  selectedSurface:()=>context.comparingOriginal?context.source:after,comparisonReference:()=>null,processedSurface:()=>after,previousPresentation:null,result:after,resultMeta:{id:'after-result'},sherloqGeneration:0,
  energyViewBusy:false,elaParameterDraft:false,energyPreviewed:false,zeroViewPresentation:null,synthesisState:{enabled:false},firstToolFrameReported:true,openingDisplay:null,firstSourceFrame:{presented:noop},localChannelHistogram:null,ocrTextLayer:{clear:noop},syncOcrTextLayer:noop,
  drawRegionOverlay:noop,reportPresentedPreview:noop,preparePaintedParameterWorker:noop,finishZeroViewPresentation:noop,refreshEnergyHistogram:noop,busy:false,lang:'fr',toolTitle:()=> 'Current tool',t:value=>value,displayedZoom:()=>Math.round(context.zoom*100)
 });
 new vm.Script("'use strict';\n"+previewCurrent+'\n'+sourceOwner+'\n'+preparedPaint+'\n'+inputs+'\n'+draw+'\nglobalThis.__providers={'+providers+'};',{filename:appURL.pathname+'#actual-comparison-and-draw'}).runInContext(context);
 if(registered)ownerMap.set(after,context.presentedFrameSourceCurrent());
 return{context,calls,state,original,after};
}

test('actual O functions retain the painted after owner/camera through repeated keydown and until after paints',()=>{
 const h=fixture(),c=h.context,initialOwner=c.presentedFrameOwners.get(h.after);c.setCompareOriginal(true);
 assert.equal(c.comparingOriginal,true);assert.equal(c.presentedSurface,h.original,'the real draw now presents the differently sized Original');assert.equal(c.loupeInputSurface(),h.after);assert.equal(c.loupeComparisonCurrent,initialOwner);
 assert.deepEqual({...c.loupeInputCamera()},{scale:1.25,x:17,y:19});assert.notEqual(c.zoom,1.25,'Original fitting changes the live camera, not the captured loupe camera');
 const heldFrame=c.loupeComparisonFrame,heldCamera=c.loupeComparisonCamera,heldOwner=c.loupeComparisonCurrent,beforeRepeat=h.calls.length;c.setCompareOriginal(true);
 assert.equal(h.calls.length,beforeRepeat,'repeated O keydown returns before redraw/recapture');assert.equal(c.loupeComparisonFrame,heldFrame);assert.equal(c.loupeComparisonCamera,heldCamera);assert.equal(c.loupeComparisonCurrent,heldOwner);
 h.state.afterReady=false;c.setCompareOriginal(false);assert.equal(c.comparingOriginal,false);assert.equal(c.presentedSurface,h.original,'unprepared after cannot replace the painted Original yet');assert.equal(c.loupeInputSurface(),h.after);assert.equal(c.loupeComparisonCamera,heldCamera);assert.ok(!h.calls.includes('after-painted'));
 c.draw();assert.equal(c.loupeComparisonFrame,heldFrame,'another unprepared draw retains the captured producer');assert.equal(c.loupeComparisonCurrent,heldOwner);
 h.state.afterReady=true;c.draw();assert.ok(h.calls.includes('after-painted'));assert.equal(c.presentedSurface,h.after);assert.equal(c.loupeComparisonFrame,null,'the actual successful draw clause releases the held frame');assert.equal(c.loupeComparisonCurrent,null);assert.equal(c.loupeComparisonCamera,null);assert.equal(c.loupeInputSurface(),h.after);assert.deepEqual({...c.loupeInputCamera()},{scale:c.zoom,x:c.offset.x,y:c.offset.y});
});

test('actual fallback Source owner revocation makes loupe inputs use the current frame and camera',async()=>{
 const h=fixture({registered:false}),c=h.context;c.setCompareOriginal(true);assert.equal(c.loupeInputSurface(),h.after);assert.equal(c.loupeComparisonCurrent(),true,'missing painted-frame registration uses the actual Source-owner closure');
 const current={width:1024,height:768};c.source=current;c.presentedSurface=current;c.imageId='replacement-id';c.hash='replacement-sha';c.zoom=.5;c.offset={x:3,y:4};
 assert.equal(c.loupeComparisonCurrent(),false);assert.equal(c.loupeInputSurface(),current);assert.deepEqual({...c.loupeInputCamera()},{scale:.5,x:3,y:4});assert.notEqual(c.loupeInputSurface(),h.after);
 assert.equal(await readFile(appURL,'utf8'),appText,'app Source remains unchanged during this contract suite');
});

test('Main local providers use the same Original before its first paint while other tools keep their after frame',()=>{
 const h=fixture({localMain:true}),c=h.context;assert.equal(c.presentedSurface,h.after);assert.equal(c.__providers.getSurface(),h.original);assert.equal(c.__providers.getComparisonSurface(),h.original,'Main O reuses the same raw producer');
 const replacement={width:700,height:500};c.source=replacement;assert.equal(c.__providers.getSurface(),replacement);assert.equal(c.__providers.getComparisonSurface(),replacement,'no stale Main producer is recovered from the previous painted result');
 const other=fixture();assert.equal(other.context.__providers.getSurface(),other.after);assert.equal(other.context.__providers.getComparisonSurface(),other.original);
});
