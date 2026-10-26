import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {planAdmittedNativeContexts} from '../src/admitted-native-context-cover.js';
const key=(x,y)=>x+':'+y;
function fixture(width,height,selected){
 const mask=Uint8Array.from({length:width*height},(_,i)=>+selected(i%width,Math.floor(i/width))),budget=new Budget(32*1024**2);
 const includesRectangle=r=>{for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)if(!mask[y*width+x])return false;return true;};
 const view={descriptor:{width,height},*admittedRectangles(){for(let y=0;y<height;y++){let start=-1;for(let x=0;x<=width;x++){if(x<width&&mask[y*width+x]){if(start<0)start=x;}else if(start>=0){yield{x:start,y,width:x-start,height:1};start=-1;}}}},includesRectangle};return{view,budget,mask,width,height};
}
function oracle(h,mw,mh){const covered=new Set();for(let y=0;y<=h.height-mh;y++)for(let x=0;x<=h.width-mw;x++)if(h.view.includesRectangle({x,y,width:mw,height:mh}))for(let yy=y;yy<y+mh;yy++)for(let xx=x;xx<x+mw;xx++)covered.add(key(xx,yy));return covered;}
function assertCover(h,p,mw,mh){
 const expected=oracle(h,mw,mh),actual=new Set(),owned=new Set();let area=0;
 for(const r of p.contexts){assert(h.view.includesRectangle(r));assert(r.width>=mw&&r.height>=mh);for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){actual.add(key(x,y));assert.equal(p.ownsPoint(r.index,x,y),r.ownedRectangles.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height));}for(const o of r.ownedRectangles)for(let y=o.y;y<o.y+o.height;y++)for(let x=o.x;x<o.x+o.width;x++){assert(!owned.has(key(x,y)));owned.add(key(x,y));area++;}}
 assert.deepEqual([...actual].sort(),[...expected].sort());assert.deepEqual([...owned].sort(),[...expected].sort());assert.equal(p.uniqueObservedPixels,area);assert.equal(p.sourceAdmittedPixels,h.mask.reduce((a,b)=>a+b,0));assert.equal(p.noNativeSupportPixels,p.sourceAdmittedPixels-area);
 const unsupported=new Set();for(const r of p.unsupportedRectangles)for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){assert(h.mask[y*h.width+x]);assert(!actual.has(key(x,y)));assert(!unsupported.has(key(x,y)));unsupported.add(key(x,y));}assert.equal(unsupported.size,p.noNativeSupportPixels);
}
test('minimum-window sweep equals a dense independent oracle including concave/hole/border geometry',async()=>{
 let random=123456;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 for(let i=0;i<120;i++){const h=fixture(5+i%7,5+(i*3)%6,()=>next()>.16),mw=1+i%3,mh=1+(i*5)%3;let p;try{p=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:mw,minimumHeight:mh});assertCover(h,p,mw,mh);}finally{p?.dispose();assert.equal(h.budget.total(),0);}}
});
test('isolated true thin arms remain explicit, while a partition stripe inside a larger valid rectangle is covered',async()=>{
 const h=fixture(70,62,(x,y)=>(x<12||x>=20||y<12||y>=20)&&!(x>=65&&y>=58)),p=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:32,minimumHeight:32,alignmentX:32,alignmentY:32});try{assertCover(h,p,32,32);assert(p.contexts.length>1);assert(p.contexts.every(r=>r.width%32===0&&r.height%32===0));assert(p.contexts.some(r=>r.x<=40&&r.x+r.width>40&&r.y===0));assert(p.contextObservedPixels>p.uniqueObservedPixels);}finally{p.dispose();assert.equal(h.budget.total(),0);}
 const thin=fixture(20,20,(x,y)=>x<2||y<2),q=await planAdmittedNativeContexts(thin.view,{budget:thin.budget,minimumWidth:3,minimumHeight:3});try{assert.equal(q.contexts.length,0);assert.equal(q.noNativeSupportPixels,76);}finally{q.dispose();assert.equal(thin.budget.total(),0);}
});
test('single full rectangle retains exact native extent even when dimensions are not aligned',async()=>{
 const h=fixture(67,45,()=>true),p=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:32,minimumHeight:32,alignmentX:32,alignmentY:32});try{assert.equal(p.preservedRectangle,true);assert.equal(p.contexts.length,1);assert.deepEqual(p.contexts[0].ownedRectangles,[{x:0,y:0,width:67,height:45}]);assert.equal(p.uniqueObservedPixels,67*45);}finally{p.dispose();p.dispose();assert.equal(h.budget.total(),0);assert.throws(()=>p.ownedRowSpans(0,0),{code:'INVALID_INPUT'});}
});
test('maximum-size and dimensional alignment use overlapping literal rectangles without dropping last starts',async()=>{
 const h=fixture(79,71,()=>true),p=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:16,minimumHeight:16,alignmentX:16,alignmentY:16,maximumWidth:32,maximumHeight:48});try{assertCover(h,p,16,16);assert(p.contexts.every(r=>r.width===32&&r.height===48));assert(p.contexts.some(r=>r.x+r.width===79&&r.y+r.height===71));}finally{p.dispose();assert.equal(h.budget.total(),0);}
});
test('same geometry produces deterministic context/ownership plans and metadata retires after cancellation/admission failure',async()=>{
 const h=fixture(57,49,(x,y)=>!(x>=19&&x<24&&y>=16&&y<23)),a=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:8,minimumHeight:8}),b=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:8,minimumHeight:8});assert.deepEqual(a.contexts,b.contexts);a.dispose();b.dispose();assert.equal(h.budget.total(),0);
 const cancelled=new AbortController();let requests=0;const original=h.budget.reserve.bind(h.budget);h.budget.reserve=n=>{const free=original(n);if(++requests===4)cancelled.abort();return free;};await assert.rejects(planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:8,minimumHeight:8,signal:cancelled.signal}),{code:'CANCELLED'});assert.equal(h.budget.total(),0);
 const small=new Budget(4200);await assert.rejects(planAdmittedNativeContexts(h.view,{budget:small,minimumWidth:8,minimumHeight:8}),{code:'MEMORY_LIMIT'});assert.equal(small.total(),0);
});
test('context view membership is authoritative, not the separate candidate domain or an L bounding box',async()=>{
 const h=fixture(12,10,(x,y)=>x<4||y>=6);h.view.domain={rowIntervals(){throw Error('candidate membership is not RGB context');}};const p=await planAdmittedNativeContexts(h.view,{budget:h.budget,minimumWidth:3,minimumHeight:3});try{assertCover(h,p,3,3);assert(!p.contexts.some(r=>r.x===0&&r.y===0&&r.width===12&&r.height===10));}finally{p.dispose();assert.equal(h.budget.total(),0);}
});
