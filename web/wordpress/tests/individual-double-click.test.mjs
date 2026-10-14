import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {doubleClickCamera as actualDoubleClickCamera} from '../sherloq-browser/assets/viewer-input.js';
const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const begin=source.indexOf("view.addEventListener('dblclick'");
const end=source.indexOf('\n',begin);
assert.ok(begin>=0&&end>begin);
const handler=source.slice(begin,end);
function setup({scope=null,hit=false,active=true,display=null,realCamera=false}={}){
 let listener,fits=0,legacy=0,draws=0;const hits=[];
 const sandbox={view:{clientWidth:500,clientHeight:400,addEventListener(_event,fn){listener=fn;}},pointerLoupe:null,energyMode:false,elaMode:'classic',imageInteraction:()=>true,drawing:false,source:{width:100,height:80},layouts:{mode:'tabs'},result:display,selectedSurface:()=>sandbox.result??sandbox.source,regionController:{active:()=>active,scope,mode:'zones',async resetAt(p){hits.push(p);return hit;}},point:e=>e.local,offset:{x:50,y:40},zoom:2,fit(){fits++;},doubleClickCamera(...args){legacy++;return realCamera?actualDoubleClickCamera(...args):{scale:4,x:0,y:0};},draw(){draws++;},status(){},t:x=>x};
 vm.runInNewContext(handler,sandbox);
 return {sandbox,async click(local){listener({button:0,local,preventDefault(){}});await Promise.resolve();await Promise.resolve();},hits,get fits(){return fits;},get legacy(){return legacy;},get draws(){return draws;}};
}
test('individual background always fits, including repeated clicks before detection',async()=>{const h=setup();await h.click({x:2,y:3});await h.click({x:2,y:3});assert.equal(h.fits,2);assert.equal(h.legacy,0);assert.equal(h.hits[0].x,-24);assert.equal(h.hits[0].y,-18.5);});
test('individual actual zone hit restores geometry without fitting',async()=>{const h=setup({scope:{},hit:true});await h.click({x:100,y:100});assert.equal(h.fits,0);assert.equal(h.legacy,0);assert.equal(h.hits[0].x,25);assert.equal(h.hits[0].y,30);});
test('unsupported tools retain their established double-click navigation',async()=>{const h=setup({active:false});await h.click({x:100,y:100});assert.equal(h.legacy,1);assert.equal(h.fits,0);assert.equal(h.draws,1);});
test('Both ELA double-click frames the selected double-width result, while Original retains its own framing',async()=>{
 const h=setup({active:false,display:{width:200,height:80},realCamera:true});h.sandbox.zoom=1;await h.click({x:250,y:200});
 assert.equal(h.sandbox.zoom,2.375);assert.equal(h.sandbox.offset.x,12.5);assert.equal(h.sandbox.offset.y,105);assert.equal(h.draws,1);
 h.sandbox.result=null;h.sandbox.zoom=1;await h.click({x:250,y:200});assert.equal(h.sandbox.zoom,4.75);assert.equal(h.sandbox.offset.x,12.5);assert.equal(h.sandbox.offset.y,10);assert.equal(h.hits.length,0);
});
