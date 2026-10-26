import test from 'node:test';
import assert from 'node:assert/strict';
import {neuralDisplays} from '../../wordpress/sherloq-browser/assets/neural-clone-ui.js';
import {renderCloneAnalysisWindow} from '../../wordpress/sherloq-browser/assets/neural-window-presentation.js';

const source={id:'Original',revision:1,width:20,height:12,format:'rgb8'};
const support={status:'insufficient-support',requiredCandidates:40,availableCandidates:12,contextCells:15,calculationPerformed:false,negativeModelObservation:false};
function native(mode='independent',id='native'){
 return {operation:'ai.clones.segmentation',cloneWindowMode:mode,status:'ok',analysisWindow:{id,kind:'acquisition',bounds:[3,2,11,8],fingerprint:id},sourceRegionOrigin:[3,2],surface:{id:id+'-map',revision:1,width:8,height:6,type:'Float32Array',format:'float32'},maskSurfaces:{mask:{id:id+'-mask',revision:1,width:8,height:6,type:'Uint8Array'}},provenance:{cloneWindowMode:mode,originalSha256:'a'.repeat(64)}};
}
function insufficient(mode='independent'){
 return {operation:'ai.clones.segmentation',cloneWindowMode:mode,status:'insufficient-support',analysisWindow:{id:'small',fingerprint:'small'},sourceRegionOrigin:[3,2],data:{metadata:{nativeSupport:support}},layers:[],provenance:{cloneWindowMode:mode}};
}
function parent(mode,records){return {operation:'ai.clones.segmentation',cloneWindowMode:mode,status:'ok',sourceRegionSourceSurface:source,windowResults:mode==='independent'?records:[],...(mode==='global'?{globalResult:records[0].output}:{}),provenance:{cloneWindowMode:mode}};}
const record=output=>({id:output.analysisWindow.id,kind:'acquisition',fingerprint:output.analysisWindow.fingerprint,origin:[3,2],status:output.status==='insufficient-support'?'insufficient-support':'complete',output});

test('Explicit global result exposes its native views on Original, with one actual union placement',()=>{
 const output=parent('global',[record(native('global'))]),views=neuralDisplays(output,'fr');
 assert.ok(views.length>=3,'the real global result cannot disappear from the view selector');
 for(const {display} of views){assert.equal(display.width,20);assert.equal(display.height,12);assert.equal(display.cloneWindowMode,'global');assert.equal(display.cloneWindowPlacement.mode,'global');assert.deepEqual(display.cloneWindowPlacement.origin,[3,2]);assert.equal(display.cloneWindowPlacement.width,8);assert.equal(display.cloneFields.map.id,'native-map');}
 assert.equal(output.windowResults.length,0,'presentation does not fabricate autonomous scientific jobs');
});
test('A no-calculation window publishes no fabricated image and leaves completed neighbours intact',()=>{
 const successful=record(native()),missing=record(insufficient()),output=parent('independent',[successful,missing]);output.status='partial';
 const views=neuralDisplays(output,'en');assert.ok(views.length>=3);assert.ok(views.every(v=>v.display.cloneWindowPlacement.id==='native'));assert.equal(missing.output.surface,undefined);
 assert.deepEqual(neuralDisplays(parent('independent',[missing]),'fr'),[]);
 assert.deepEqual(neuralDisplays(parent('global',[record(insufficient('global'))]),'fr'),[]);
});
test('Global placement reads the real local field once and Original outside its exact half-open extent',async()=>{
 const views=neuralDisplays(parent('global',[record(native('global'))]),'fr');assert.ok(views.length);
 const display=views.find(v=>v.display.cloneView==='map').display,calls=[];
 const value=await renderCloneAnalysisWindow(display,{x:0,y:0,w:20,h:12,step:1},{readField:async(key,tile)=>{calls.push({key,tile});return {width:8,height:6,format:'rgb8',data:new Uint8Array(8*6*3).fill(255)};},readOriginal:async()=>({width:20,height:12,format:'rgb8',data:new Uint8Array(20*12*3).fill(17)}),compose:parts=>parts});
 assert.deepEqual(calls,[{key:'map',tile:{x:0,y:0,w:8,h:6,step:1}}]);
 assert.equal(value.values[2*20+3],1);assert.equal(value.support[2*20+3],1);assert.equal(value.support[8*20+3],0);assert.equal(value.support[2*20+11],0);assert.equal(value.base[0],17);
});
