import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as geometry from '../sherloq-browser/assets/comparison-presentation-geometry.js';
const code=await readFile(new URL(process.env.SHERLOQ_TEST_APP_FILE??'../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const draw=code.slice(code.indexOf('function drawRegionOverlay('),code.indexOf('const imageInteraction=')),point=code.slice(code.indexOf('function imagePoint('),code.indexOf('function zoomAt('));
function fixture({original={width:1448,height:1086},frame={width:512,height:384},origin=[0,0],presentation={sherloqOutput:true,sourceDimensions:{width:1448,height:1086}},zone,reference=null}={}){
 const vertices=[],zones=zone?[zone]:[{polygon:[[0,0],[original.width,0],[original.width,original.height],[0,original.height]]}],spaces=new WeakMap([[frame,presentation]]);
 const ctx={beginPath(){},moveTo(x,y){vertices.push([x,y]);},lineTo(x,y){vertices.push([x,y]);},closePath(){},stroke(){},fill(){},save(){},restore(){},rect(){},clip(){}};
 const scope={host:{sourceOnly:false},source:original,presentedSurface:frame,sourceRegionPresentationSpaces:spaces,sourceRegionPresentationOrigin:()=>origin,sourceRegionPresentationGeometry:geometry.sourceRegionPresentationGeometry,selectedSurface:()=>frame,comparisonReference:()=>reference,zoom:2,offset:{x:0,y:0},regionController:{scope:{manual:{zones}},active:()=>true},regions:[],draft:null,$:()=>({checked:true})};
 vm.createContext(scope);vm.runInContext(draw+point,scope);return{vertices,draw(){scope.drawRegionOverlay(ctx,frame);return vertices;},point(p){return JSON.parse(JSON.stringify(scope.imagePoint(p)));},zones};
}
test('Original boundary is projected exactly onto the reduced SHERLOQ border',()=>{const f=fixture(),before=JSON.stringify(f.zones);assert.deepEqual(f.draw(),[[0,0],[512,0],[512,384],[0,384]]);assert.equal(JSON.stringify(f.zones),before);});
test('Cropped shared equalization keeps its original origin and independent axis rounding',()=>{const f=fixture({original:{width:2048,height:1536},frame:{width:512,height:383},origin:[100,50],presentation:{sherloqOutput:true,sourceDimensions:{width:800,height:600},clip:true},zone:{polygon:[[100,50],[900,50],[900,650],[100,650]]}});assert.deepEqual(f.draw(),[[0,0],[512,0],[512,383],[0,383]]);});
test('Clicks on reduced SHERLOQ stay in Original pixel coordinates and clamp to its bounds',()=>{const f=fixture();assert.deepEqual(f.point({x:512,y:384}),{x:724,y:543});assert.deepEqual(f.point({x:99999,y:99999}),{x:1448,y:1086});});
test('Native tools and the aligned O Original keep their existing coordinate space',()=>{const original={width:1448,height:1086};const native=fixture({frame:original,presentation:{coordinateSpace:'source'}});assert.deepEqual(native.draw(),[[0,0],[1448,0],[1448,1086],[0,1086]]);const compared=fixture({frame:original,presentation:{},reference:{width:512,height:384}});assert.deepEqual(compared.point({x:512,y:384}),{x:724,y:543});});
test('Independent frequency grids still suppress Original contours',()=>{assert.deepEqual(fixture({presentation:{coordinateSpace:'frequency'}}).draw(),[]);assert.deepEqual(fixture({presentation:{sourceContours:false}}).draw(),[]);});
