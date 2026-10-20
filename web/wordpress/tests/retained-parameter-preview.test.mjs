import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRetainedPreview as preview,updateRetainedParameters,retainedPreviewWorkingBytes,renderRetainedWindow,planRetainedPreview} from '../sherloq-browser/assets/retained-parameter-preview.js';
import {parameterPreviewPolicy as policy,parameterPreviewInventory,PARAMETER_PREVIEW_KINDS} from '../sherloq-browser/assets/parameter-preview-policy.js';
import {toolCatalog,toolFields} from '../sherloq-browser/assets/tool-catalog.js';
import {histogramSummary} from '../sherloq-browser/assets/unified-engine/src/histogram.js';
import {renderResearch} from '../sherloq-browser/assets/unified-engine/src/research-view.js';
import {illuminantCellDisplay} from '../sherloq-browser/assets/unified-engine/src/illuminant.js';
import {ghostView} from '../sherloq-browser/assets/unified-engine/src/ghost-maps.js';
import {GHOST_PALETTES} from '../sherloq-browser/assets/unified-engine/src/ghost-palettes.js';
const rgb=(width,height,value=64)=>({width,height,format:'rgb8',data:new Uint8Array(width*height*3).fill(value)});
const output=(operation,data,width=8,height=4)=>({id:'native-result',status:'ok',operation,data,surface:{id:'native',revision:1,width,height,format:'rgb8'},provenance:{originalSha256:'fixture-native',params:{}}});
const channels=p=>Array.from(p.data).filter((_,i)=>i%3===0);

test('every catalog field has an explicit auditable preview policy',()=>{
 let count=0;for(const id of Object.keys(toolCatalog))for(const field of toolFields(id)){const rule=policy(id,field.key);assert.ok(PARAMETER_PREVIEW_KINDS.includes(rule.kind),id+'/'+field.key);assert.ok(rule.reason.length>10);assert.ok(['native','view','explicit','none'].includes(rule.final));count++;}assert.ok(count>100);assert.ok(parameterPreviewInventory().length>=count);assert.equal(policy('missing','anything').kind,'none');assert.equal(policy('inspection.adjust','unknown').kind,'explicit');
});
test('scientific clone thresholds, models, encoded JPEG and statistics stay explicit',()=>{
 for(const [id,key]of [['tampering.copyMove.sparse','minimum'],['tampering.copyMove.sparse','algorithm'],['ai.clones.d2prl','minimum'],['m2.rita','model'],['noise.noisesniffer','samplesPerBin'],['noise.prnu','saturation'],['comparison.image','metrics']])assert.equal(policy(id,key).kind,'explicit',id+'/'+key);
 assert.equal(policy('jpeg.ghosts','low').kind,'pixel-proxy');assert.equal(policy('jpeg.zero','view').kind,'retained');assert.equal(policy('various.stereogram','mode').kind,'retained');
 assert.equal(policy('tampering.copyMove.sparse','view.minimum').kind,'retained');assert.equal(policy('colors.stats','mode').kind,'pixel-proxy');assert.equal(policy('colors.plots','scale').previewOwner,'workspace');assert.equal(policy('colors.plots','scale').final,'native');assert.equal(policy('colors.plots','alpha').kind,'local');
});
test('neural display policies reuse retained fields and preserve existing exact response controls',()=>{
 assert.equal(policy('ai.localization.focal','view.mode').strategy,'research');assert.equal(policy('ai.localization.focal','view.mode').kind,'retained');assert.equal(policy('m2.trufor','view.mode').kind,'local');assert.equal(policy('m2.rita','threshold').existing,true);assert.equal(policy('ela.energy','scoreThreshold').existing,true);
});
test('native histogram summary is exact, has the UI data shape, and cannot mutate native arrays',async()=>{
 const bins=new Float64Array(1024),cumulative=new Float64Array(1024);for(let c=0;c<4;c++){bins[c*256+5]=3;bins[c*256+10]=1;}const native=output('inspection.histogram',{bins,cumulative,summary:{old:true},uniqueColors:4}),params={channel:2,start:11,end:4};const before=bins.slice(),answer=await preview({output:native,params});
 assert.deepEqual(answer.data.summary,histogramSummary(bins,2,11,4,4));assert.equal(answer.data.bins,bins);assert.equal(answer.data.cumulative,cumulative);assert.equal(answer.metrics.sourceReads,0);assert.equal(answer.summaryExact,true);assert.deepEqual(native.data.summary,{old:true});assert.deepEqual(bins,before);
 const final=updateRetainedParameters({output:native,params});assert.notEqual(final,native);assert.equal(final.data.bins,bins);assert.equal(final.data.uniqueColors,4);assert.deepEqual(final.data.summary,answer.data.summary);assert.equal(final.provenance.params.channel,2);assert.equal(native.provenance.params.channel,undefined);
 await assert.rejects(preview({output:native,params:{start:-1}}),{code:'INVALID_INPUT'});assert.equal(updateRetainedParameters({output:output('colors.pca',{})}),null);
});
test('median threshold previews reuse native compact probabilities and variance',async()=>{
 const probabilities=Float32Array.of(.2,.8),variances=Float64Array.of(10,1),native=output('various.median',{geometry:{width:2,height:1,imageWidth:128,imageHeight:64},probabilities,variances},128,64),before=probabilities.slice();
 let a=await preview({output:native,params:{threshold:.5,variance:5,speckle:false}});assert.deepEqual(Array.from(a.pixels.data.subarray(0,3)),[0,255,0]);assert.deepEqual(Array.from(a.pixels.data.subarray(64*3,64*3+3)),[0,0,255]);
 a=await preview({output:native,params:{threshold:.1,variance:0,speckle:false}});assert.deepEqual(Array.from(a.pixels.data.subarray(0,3)),[255,0,0]);assert.deepEqual(probabilities,before);assert.equal(a.metrics.inferenceCalls,0);assert.equal(a.exact,false);
});
test('median speckle filter changes only the provisional raster, and bounds compact grids',async()=>{
 const probabilities=Float32Array.of(0,0,0,0,1,0,0,0,0),native=output('various.median',{geometry:{width:3,height:3,imageWidth:192,imageHeight:192},probabilities,variances:new Float64Array(9).fill(10)},192,192);const raw=await preview({output:native,params:{speckle:false}}),clean=await preview({output:native,params:{speckle:true}});const at=(64*192+64)*3;assert.deepEqual(Array.from(raw.pixels.data.subarray(at,at+3)),[255,0,0]);assert.deepEqual(Array.from(clean.pixels.data.subarray(at,at+3)),[0,255,0]);native.data.geometry.width=131073;assert.equal(await preview({output:native}),null);
});
test('contrast and illuminant previews reuse native cell statistics',async()=>{
 const contrast=output('tampering.contrast',{cols:1,rows:1,block:32,values:Float32Array.of(.1,.5,.8)},32,32),c=await preview({output:contrast,params:{mode:1,block:32}});assert.ok(channels(c.pixels).every(x=>x===128));assert.equal(await preview({output:contrast,params:{mode:1,block:64}}),null);
 const native=output('various.illuminant',{cols:1,rows:1,block:32,rgb:Float64Array.of(1,.5,0),globalRGB:Float64Array.of(1,1,1),counts:Uint32Array.of(1),areas:Uint32Array.of(2),valid:Uint8Array.of(1)},32,32);const valid=await preview({output:native,params:{mode:2}});assert.ok(channels(valid.pixels).every(x=>x===128));const color=await preview({output:native,params:{mode:0,linear:false}});assert.deepEqual(Array.from(color.pixels.data.subarray(0,3)),[255,128,0]);
});
test('PCA uses the retained global BGR basis and a bounded native pixel sample',async()=>{
 const native=output('colors.pca',{mean:Float64Array.of(10,20,30),eigenvectors:Float64Array.of(1,0,0,0,1,0,0,0,1)},1024,512),source=rgb(1024,512);source.data[2]=10;source.data[(4*3)+2]=20;const saved=source.data.slice();let reads=0;
 const answer=await preview({output:native,params:{component:0,mode:'project'},source,maxSide:256,readSource:async geometry=>{reads++;assert.equal(geometry.step,4);return source;}});assert.equal(answer.pixels.width,256);assert.equal(answer.pixels.height,128);assert.equal(answer.pixels.logicalWidth,1024);assert.equal(answer.pixels.data[0],0);assert.ok(answer.pixels.data[3]>0);assert.equal(reads,1);assert.deepEqual(source.data,saved);assert.equal(answer.metrics.nativeAnalysisCalls,0);assert.equal(await preview({output:output('colors.pca',{},8,4),source:rgb(8,4)}),null);
});
test('research display recolors existing maps, labels and masks without inference',async()=>{
 const native=output('ai.localization.focal',{metadata:{method:'focal',native_shape:[2,2]},map:Float32Array.of(0,.3,.7,1)},8,4),a=await preview({output:native,view:{mode:'map'}}),b=await preview({output:native,view:{mode:'overlay'},source:rgb(8,4,100)});assert.equal(a.pixels.width,8);assert.notDeepEqual(a.pixels.data,b.pixels.data);assert.equal(a.metrics.inferenceCalls,0);
 const ada=output('ai.localization.adaifl',{metadata:{method:'adaifl',native_shape:[1,2]},mask:Uint8Array.of(0,1)},2,1);assert.deepEqual(channels((await preview({output:ada,view:{mode:'mask'}})).pixels),[0,255]);
 const safire=output('ai.sources.safire',{metadata:{method:'safire',binary:false,native_shape:[1,2]},source_labels:Uint8Array.of(0,1)},2,1);assert.ok(await preview({output:safire,view:{mode:'map'}}));assert.equal(await preview({output:safire,view:{mode:'confidence'}}),null);
});
test('JPEG ghost display uses the existing native map values and pinned palette',async()=>{
 const native=output('jpeg.ghosts',{cols:3,rows:1,qualities:Uint8Array.of(50,60),maps:Float64Array.of(0,.5,.25,.75,1,1)},3,1);const a=await preview({output:native,params:{grayscale:false},view:{index:1}});assert.deepEqual(Array.from(a.pixels.data.subarray(0,3)),GHOST_PALETTES.viridis.slice(128*3,128*3+3));assert.equal(a.logicalWidth,3);assert.equal(native.data.maps[1],.5);assert.equal(await preview({output:native,params:{includeOriginal:true}}),null);
});
test('ZERO can sample retained masks but never fabricates absent native votes',async()=>{
 const native=output('jpeg.zero',{width:4,height:1},4,1);native.maskSurfaces={mask_f_reg:{id:'foreign',width:4,height:1,revision:1,format:'mask8'}};let reads=0;const a=await preview({output:native,params:{view:3},readTile:async descriptor=>{reads++;assert.equal(descriptor.id,'foreign');const pixels=rgb(4,1,0);pixels.data[3]=255;return{pixels};}});assert.deepEqual(channels(a.pixels),[0,255,0,0]);assert.equal(reads,1);assert.equal(await preview({output:native,params:{view:1},readTile:()=>{throw Error('No vote surrogate allowed');}}),null);
});
test('Noisesniffer region preview uses native cell membership and no significance recalculation',async()=>{
 const native=output('noise.noisesniffer',{width:4,height:2,metadata:{parameters:[3,2],regions:[{cells:[[0,1]]}]}},4,2);const a=await preview({output:native,params:{view:'mask'}});assert.deepEqual(channels(a.pixels),[0,0,255,255,0,0,255,255]);assert.equal(await preview({output:native,params:{view:'distribution'}}),null);
});
test('Fourier gamma reads only sampled native magnitude rows and keeps a caller-owned bounded cache',async()=>{
 const native=output('tampering.resampling',{geometry:{outputSide:8},minimumMagnitude:0,maximumMagnitude:1},8,8);native.tableSurfaces={magnitude:{id:'magnitudes',revision:1}};const cache=new Map();let calls=0;
 const readTable=async(_table,offset,length)=>{calls++;assert.ok(length<=32768);const data=new Float64Array(length*3);for(let i=0;i<length;i++)data[i*3+2]=(offset+i)/63;return{columns:['fy','fx','magnitude'],data};};
 const a=await preview({output:native,params:{fourier:{gamma:1,rescale:true}},maxSide:4,cache,readTable}),b=await preview({output:native,params:{fourier:{gamma:4,rescale:true}},maxSide:4,cache,readTable});assert.equal(calls,4);assert.equal(cache.size,1);assert.equal(a.pixels.width,4);assert.notDeepEqual(a.pixels.data,b.pixels.data);assert.equal(native.data.values,undefined);assert.equal(a.metrics.inferenceCalls,0);
});
test('retained preview cancellation rejects late reads without publishing or mutating output',async()=>{
 const controller=new AbortController(),native=output('colors.pca',{mean:new Float64Array(3),eigenvectors:Float64Array.of(1,0,0,0,1,0,0,0,1)});await assert.rejects(preview({output:native,source:rgb(8,4),signal:controller.signal,readSource:async()=>{controller.abort();return rgb(8,4);}}),{code:'CANCELLED'});assert.equal(native.pixels,undefined);await assert.rejects(preview({output:native,maxSide:2049}),{code:'INVALID_INPUT'});assert.ok(retainedPreviewWorkingBytes()<5*1024**2);assert.throws(()=>retainedPreviewWorkingBytes({maxSide:2049}),{code:'INVALID_INPUT'});
});
function clones(){return output('tampering.copyMove.sparse',{points:Float32Array.of(0,0,2,0,0,0,0,3,0,2,0,0,0,0,0,2,2,0,0,0,0,3,2,2,0,0,0,0),pairs:Float64Array.of(0,1,0,10,2,3,0,20),groups:[[0,1]],bases:[[0,0,255]]},4,3);}
test('clone draft preserves native group eligibility and bounds geometry allocations',async()=>{
 const native=clones();native.selectedGroups=[{index:0,rows:[0,1]}];let received;const a=await preview({output:native,source:rgb(4,3),view:{low:0,high:100,minimum:2,areas:true,circles:false,lines:false,points:false},composeBiomes:(base,groups)=>{received=groups;return base;}});assert.equal(received.length,1);assert.deepEqual(received[0].pairIndexIds,[0,1]);assert.equal(a.metrics.inferenceCalls,0);const b=await preview({output:native,source:rgb(4,3),view:{low:15,high:100,minimum:2,areas:true},composeBiomes:(base,groups)=>{assert.equal(groups.length,0);return base;}});assert.ok(b);native.data.pairs=new Float64Array(2049*4);assert.equal(await preview({output:native,source:rgb(4,3)}),null);
});
test('clone circles/links draft uses retained point coordinates and never invokes detection',async()=>{
 const native=clones();native.selectedGroups=[{index:0,rows:[0,1]}];const a=await preview({output:native,source:rgb(4,3,0),view:{low:0,high:100,minimum:2,areas:false,lines:true,points:true,circles:true}});assert.ok(a.pixels.data.some(v=>v===255));assert.equal(a.pixels.logicalWidth,4);assert.equal(native.data.points[0],0);
});

const crop=(source,tile)=>{const {x=0,y=0,w=source.width,h=source.height,step=1}=tile,width=Math.ceil(w/step),height=Math.ceil(h/step),data=new Uint8Array(width*height*3);for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){const at=((y+yy*step)*source.width+x+xx*step)*3;data.set(source.data.subarray(at,at+3),(yy*width+xx)*3);}return{width,height,format:'rgb8',data};};
test('research native virtual windows exactly match the original renderer at every source coordinate',async()=>{
 const source=rgb(37,23);for(let i=0;i<source.data.length;i++)source.data[i]=(i*17+31)%256;
 for(const method of ['focal','adaifl','safire'])for(const mode of ['map','overlay',...(method==='adaifl'?['mask']:[]),...(method==='safire'?['confidence']:[])]){
  const d={metadata:{method,binary:false,native_shape:[3,5],sources:3},map:Float32Array.from({length:15},(_,i)=>i/14),mask:Uint8Array.from({length:15},(_,i)=>i%2),source_labels:Uint8Array.from({length:15},(_,i)=>i%3)},native=output('ai.'+(method==='safire'?'sources.':'localization.')+method,d,37,23);native.provenance.params={groups:3};
  const next=updateRetainedParameters({output:native,params:{groups:3},view:{mode}});assert.ok(next,method+'/'+mode);assert.equal(next.surface,native.surface);assert.equal(next.parameterViews[0].retainedParameterView.nativeData,d);assert.equal(native.parameterViews,undefined);
  const expected=await renderResearch(source,d,{mode},{reserveMemory:()=>{},includeLegend:false});for(const tile of [{x:0,y:0,w:37,h:23,step:1},{x:3,y:2,w:29,h:19,step:3},{x:35,y:22,w:2,h:1,step:2}]){let reads=0;const actual=await renderRetainedWindow({display:next.parameterViews[0],tile,readSource:async requested=>{reads++;return crop(source,requested);}});assert.deepEqual(actual,crop(expected.pixels,tile),method+'/'+mode);assert.equal(reads,mode==='overlay'?1:0);}
  assert.equal(updateRetainedParameters({output:native,params:{groups:4},view:{mode}}),null);
 }
});
test('JPEG virtual quality layers preserve the exact native gray and viridis lookups',async()=>{
 for(const grayscale of [true,false]){const d={cols:7,rows:3,qualities:Uint8Array.of(50,60,70),maps:Float64Array.from({length:63},(_,i)=>(i*19%63)/62)},native=output('jpeg.ghosts',d,7,3),params={grayscale,includeOriginal:false};native.provenance.params={low:50};const next=updateRetainedParameters({output:native,params});assert.equal(next.parameterViews.length,3);const ref={data:{...d}};await ghostView(ref,params,{});for(let index=0;index<3;index++){const tile={x:1,y:1,w:6,h:2,step:2},actual=await renderRetainedWindow({display:next.parameterViews[index],tile});assert.deepEqual(actual,crop(ref.data.views[index].pixels,tile));}assert.equal(next.data.maps,native.data.maps);}
});
test('illuminant native virtual presentation uses the original cell color function exactly',async()=>{
 const d={rows:2,cols:2,block:32,rgb:Float64Array.of(1,.3,.2,.2,.5,1,0,0,0,.3,.2,.8),globalRGB:Float64Array.of(.5,.5,.5),counts:Uint32Array.of(1024,27,0,500),areas:Uint32Array.of(1024,1024,1024,1024),valid:Uint8Array.of(1,1,0,1)},native=output('various.illuminant',d,64,64);native.provenance.params={block:32,method:1,linear:true,exclude:true};for(const mode of[0,1,2]){const params={...native.provenance.params,mode},next=updateRetainedParameters({output:native,params}),expected=rgb(64,64);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=Math.floor(y/32)*2+Math.floor(x/32),color=illuminantCellDisplay(d.rgb.subarray(i*3,i*3+3),d.counts[i],d.areas[i],d.valid[i],d.globalRGB,params).color;expected.data.set(color,(y*64+x)*3);}const tile={x:7,y:9,w:51,h:49,step:3},actual=await renderRetainedWindow({display:next.parameterViews[0],tile});assert.deepEqual(actual,crop(expected,tile));}assert.equal(updateRetainedParameters({output:native,params:{...native.provenance.params,method:2,mode:1}}),null);
});
test('native virtual windows reject cancellation, bad source geometry and unknown renderers',async()=>{
 const native=output('ai.localization.focal',{metadata:{method:'focal',native_shape:[1,1]},map:Float32Array.of(.5)}),display=updateRetainedParameters({output:native,view:{mode:'overlay'}}).parameterViews[0],controller=new AbortController();await assert.rejects(renderRetainedWindow({display,signal:controller.signal,readSource:async()=>{controller.abort();return rgb(8,4);}}),{code:'CANCELLED'});await assert.rejects(renderRetainedWindow({display,readSource:async()=>rgb(7,4)}),{code:'INVALID_INPUT'});await assert.rejects(renderRetainedWindow({display,tile:{x:9}}),{code:'INVALID_INPUT'});await assert.rejects(renderRetainedWindow({display:{...display,retainedParameterView:{...display.retainedParameterView,kind:'invented'}}}),{code:'INVALID_INPUT'});
});
test('classical BRISK/ORB/AKAZE display drafts use retained grouped matches and keypoints only',async()=>{
 const data={points:Float64Array.of(6,6,2,0,0,0,0,25,6,2,0,0,0,0,16,25,2,0,0,0,0),matches:Int32Array.of(0,1,20),groupLengths:Uint32Array.of(1),groupIndices:Uint32Array.of(0),minimum:1},saved=data.points.slice();
 for(const operation of['tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze']){const native=output(operation,data,32,32),source=rgb(32,32),base={output:native,source},lines=await preview({...base,params:{matching:20,showPoints:false,hideLines:false}}),hidden=await preview({...base,params:{matching:20,showPoints:false,hideLines:true}}),points=await preview({...base,params:{matching:20,showPoints:true,hideLines:true}});const mid=(6*32+16)*3,point=(25*32+18)*3;assert.notDeepEqual(lines.pixels.data.subarray(mid,mid+3),source.data.subarray(mid,mid+3));assert.deepEqual(hidden.pixels.data.subarray(mid,mid+3),source.data.subarray(mid,mid+3));assert.deepEqual(Array.from(points.pixels.data.subarray(point,point+3)),[72,227,250]);assert.equal(lines.metrics.inferenceCalls,0);}
 assert.deepEqual(data.points,saved);assert.equal(policy('tampering.copyMove.brisk','showPoints').kind,'retained');assert.equal(policy('tampering.copyMove.brisk','hideLines').strategy,'clones-classical');assert.equal(policy('tampering.contrast','block').kind,'pixel-proxy');data.matches=new Int32Array(2049*3);assert.equal(await preview({output:output('tampering.copyMove.brisk',data,32,32),source:rgb(32,32)}),null);
});

test('retained raster plans grow beyond the former256 bound and fit the admitted pixel workspace',async()=>{
 const d={metadata:{method:'focal',native_shape:[2,2]},map:Float32Array.of(0,.3,.7,1)},native=output('ai.localization.focal',d,1024,512),before=d.map.slice();
 const feedback={schema:'adaptive-preview-feedback/1',key:'retained/ai.localization.focal/map',calibration:{costModel:2,side:1024,cost:.0001,samples:10}};
 const plan=planRetainedPreview({output:native,view:{mode:'map'},maxPixels:512*256,adaptiveFeedback:feedback});assert.ok(plan.side>256);assert.ok(plan.pixels<=512*256);const answer=await preview({output:native,view:{mode:'map'},adaptivePlan:plan});assert.equal(answer.pixels.width*answer.pixels.height,plan.pixels);assert.ok(retainedPreviewWorkingBytes({plan})>=answer.pixels.data.byteLength);assert.equal(answer.metrics.adaptivePreview.token,plan.token);assert.equal(answer.metrics.nativeAnalysisCalls,0);assert.deepEqual(d.map,before);assert.equal(native.parameterViews,undefined);
 const next=planRetainedPreview({output:native,view:{mode:'map'},maxPixels:512*256});assert.ok(next.calibrated,'calibration persists across independent gestures');assert.equal(planRetainedPreview({output:output('inspection.histogram',{})}),null);
 await assert.rejects(preview({output:native,view:{mode:'map'},adaptivePlan:{...plan,width:1025}}),{code:'INVALID_INPUT'});
});
test('native exact virtual windows do not inherit proxy dimensions or plan state',async()=>{
 const native=output('ai.localization.focal',{metadata:{method:'focal',native_shape:[1,1]},map:Float32Array.of(.5)},37,23),view=updateRetainedParameters({output:native,view:{mode:'map'}}).parameterViews[0],plan=planRetainedPreview({output:native,view:{mode:'map'},maxPixels:16});await preview({output:native,view:{mode:'map'},adaptivePlan:plan});const exact=await renderRetainedWindow({display:view});assert.equal(exact.width,37);assert.equal(exact.height,23);assert.equal(exact.preview,undefined);assert.equal(exact.data.length,37*23*3);
});
