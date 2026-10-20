import test from 'node:test';import assert from 'node:assert/strict';
import {createOriginalSourceRegionsState} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionHistogram} from '../src/source-region-histogram.js';

test('histogram and unique-colour normalization omit excluded pixels instead of counting a fill colour',async()=>{
 const state=await createOriginalSourceRegionsState({width:4,height:3,sourceSha256:'c'.repeat(64)});await state.add('exclusion',{x0:1,y0:0,x1:3,y1:3});
 let active=0,reads=0,held=0;const budget={reserve(bytes){active+=bytes;return()=>active-=bytes;}};
 const view=await createSourceRegionView({width:4,height:3,readWindow:async rect=>{reads++;held++;const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){assert([0,3].includes(x+rect.x));const value=10+(y+rect.y)*4+x+rect.x;data.fill(value,(y*rect.width+x)*3,(y*rect.width+x+1)*3);}return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){held--;}};}},state.snapshot(),{budget});
 const output=await sourceRegionHistogram(view,{channel:0,start:0,end:255},{budget});
 for(let channel=0;channel<4;channel++){const bins=output.data.bins.subarray(channel*256,(channel+1)*256);assert.equal(bins.reduce((a,b)=>a+b),6);assert.equal(bins[0],0);for(const value of[10,13,14,17,18,21])assert.equal(bins[value],1);}
 assert.equal(output.data.uniqueColors,6);assert.equal(output.data.uniqueRatio,100);assert.equal(output.data.summary.count,6);assert.equal(output.data.summary.mean,15.5);assert.equal(output.data.summary.percent,100);assert.equal(reads,2);assert.equal(held,0);assert.equal(active,0);view.dispose();
});
