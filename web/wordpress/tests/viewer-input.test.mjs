import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWheelIntent,bindViewerNavigation,doubleClickCamera} from '../sherloq-browser/assets/viewer-input.js';
function viewHarness(mode='auto'){
 const listeners={},calls=[];let enabled=true;
 const view={clientHeight:600,getBoundingClientRect:()=>({left:10,top:20,width:800,height:600}),setPointerCapture(){},addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);}};
 bindViewerNavigation(view,{enabled:()=>enabled,getMode:()=>mode,panBy:(...values)=>calls.push(['pan',...values]),zoomBy:(...values)=>calls.push(['zoom',...values]),pointers:true});
 return{calls,disable(){enabled=false;},emit(name,data={}){const e={deltaMode:0,deltaX:0,deltaY:0,timeStamp:1000,button:0,clientX:110,clientY:220,preventDefault(){this.prevented=true;},...data};for(const f of listeners[name]||[])f(e);return e;}};
}
test('auto distinguishes precise scrolling, notched wheel and pinch; preserves trackpad momentum',()=>{
 const classify=createWheelIntent();assert.equal(classify({deltaMode:1,deltaY:3}),'zoom');
 assert.equal(classify({deltaY:100,wheelDeltaY:-120,timeStamp:1}),'zoom');
 assert.equal(classify({deltaY:2,timeStamp:1000}),'pan');assert.equal(classify({deltaY:120,timeStamp:1010}),'pan');
 assert.equal(classify({deltaY:80,wheelDeltaY:-240,timeStamp:2000}),'pan');
 assert.equal(classify({deltaX:35,deltaY:60,timeStamp:3000}),'pan');
 assert.equal(classify({deltaY:-2,ctrlKey:true}),'pinch');
 assert.equal(classify({deltaY:120,timeStamp:4000},'trackpad'),'pan');assert.equal(classify({deltaY:1},'mouse'),'zoom');
});
test('two-axis trackpad scroll pans in CSS pixels; pinch zooms around local pointer',()=>{
 const h=viewHarness();assert.equal(h.emit('wheel',{deltaX:8.5,deltaY:12.25}).prevented,true);assert.deepEqual(h.calls[0],['pan',-8.5,-12.25]);
 h.emit('wheel',{deltaY:-10,ctrlKey:true});assert.deepEqual(h.calls[1][1],{x:100,y:200});assert.ok(h.calls[1][2]>1);
});
test('mouse wheel units normalized, explicit mode resolves ambiguous devices, empty view never captures scroll',()=>{
 const h=viewHarness('mouse');h.emit('wheel',{deltaMode:1,deltaY:3});assert.equal(h.calls[0][2],Math.exp(-48*.0015));
 h.disable();assert.equal(h.emit('wheel',{deltaY:100}).prevented,undefined);assert.equal(h.calls.length,1);
 const t=viewHarness('trackpad');t.emit('wheel',{deltaY:120});assert.deepEqual(t.calls[0],['pan',-0,-120]);
});
test('Safari scale is incremental and duplicate wheel pinch is suppressed until gesture ends',()=>{
 const h=viewHarness();h.emit('gesturestart',{scale:1});h.emit('gesturechange',{scale:1.2});h.emit('gesturechange',{scale:1.5});h.emit('wheel',{deltaY:-5,ctrlKey:true});assert.equal(h.calls.length,2);assert.equal(h.calls[0][2],1.2);assert.equal(h.calls[1][2],1.25);h.emit('gestureend');h.emit('wheel',{deltaY:1,ctrlKey:true});assert.equal(h.calls.length,3);
});
test('primary drag and two pointers pan/pinch in original view; right button does nothing',()=>{
 const h=viewHarness();h.emit('pointerdown',{button:2,pointerId:1});h.emit('pointermove',{pointerId:1,clientX:200});assert.equal(h.calls.length,0);
 h.emit('pointerdown',{pointerId:1});h.emit('pointermove',{pointerId:1,clientX:130,clientY:240});assert.deepEqual(h.calls.pop(),['pan',20,20]);
 h.emit('pointerdown',{pointerId:2,clientX:230,clientY:240});h.emit('pointermove',{pointerId:2,clientX:250,clientY:240});assert.equal(h.calls[0][0],'zoom');assert.equal(h.calls[0][2],1.2);assert.deepEqual(h.calls[1],['pan',10,0]);h.emit('pointercancel',{pointerId:1});h.emit('pointerup',{pointerId:2});h.calls.length=0;h.emit('pointermove',{pointerId:2});assert.equal(h.calls.length,0);
});

test('double click fits oversized, undersized and panned images; only an already fitted image zooms',()=>{
 const image={width:2000,height:1000},viewport={width:800,height:600},point={x:200,y:200};
 const fit={scale:.38,x:20,y:110};
 for(const camera of [{scale:1,x:0,y:0},{scale:.1,x:300,y:250},{...fit,x:80},{...fit,y:-20}])assert.deepEqual(doubleClickCamera(camera,image,viewport,point),fit);
 const close=doubleClickCamera(fit,image,viewport,point);assert.equal(close.scale,1);assert.ok(Math.abs((point.x-close.x)/close.scale-(point.x-fit.x)/fit.scale)<1e-10);
 assert.deepEqual(doubleClickCamera(close,image,viewport,point),fit);
 const small={width:100,height:100},smallFit={scale:5.7,x:115,y:15};assert.ok(Math.abs(doubleClickCamera(smallFit,small,viewport,point).scale-11.4)<1e-10);
});
