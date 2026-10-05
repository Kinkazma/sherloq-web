import test from 'node:test';import assert from 'node:assert/strict';
import {plotStyle,plotCamera,plotMatrix,projectPlot} from '../src/plot-camera.js';
import {plotsParams,plotView} from '../src/plots.js';
test('camera preserves normalized axes and projected center',()=>{
 for(const kind of ['2d','classic','3d']){const matrix=plotMatrix(plotStyle({kind}),plotCamera(),4/3),center=projectPlot(matrix,.5,.5,.5,640,480);assert.ok(Math.abs(center[0]-320)<1e-4);assert.ok(Math.abs(center[1]-240)<1e-4);}
 assert.deepEqual(projectPlot(plotMatrix(plotStyle(),plotCamera()),0,1,0,640,480),[0,0]);
 assert.throws(()=>plotCamera({limits:[0,0,0,1]}));assert.throws(()=>plotStyle({x:6}));
});
test('values-only layout bypasses redundant CPU geometry without changing data',async()=>{
 const result={data:{values:new Float32Array(24),count:4}},p=plotsParams({layout:'values'});
 assert.equal(await plotView(result,p),result);assert.equal(result.data.positions,undefined);assert.equal(result.data.colors,undefined);
 assert.equal(plotsParams().layout,'legacy');assert.throws(()=>plotsParams({layout:'arbitrary'}));
});
