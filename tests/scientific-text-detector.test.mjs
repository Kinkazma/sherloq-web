import test from 'node:test';
import assert from 'node:assert/strict';
import {SCIENTIFIC_TEXT_MODEL,ScientificTextDetector,scientificTextTiles,scientificTextBoxes,prepareScientificTextInput,minimumTextRectangle} from '../web/engine-source/src/scientific-text-detector.js';

test('Text preprocessing uses the qualified BGR/ImageNet model and leaves the scientific source intact',async()=>{
 const data=new Uint8Array(736*736*3);for(let i=0;i<data.length;i+=3){data[i]=24;data[i+1]=127;data[i+2]=243;}
 let reserved=0;const budget={reserve(n){reserved+=n;return()=>reserved-=n;}};
 const prepared=await prepareScientificTextInput({format:'rgb8',width:736,height:736,data},[0,0,736,736],{budget});
 try{assert.deepEqual(prepared.tensor.dims,[1,3,736,736]);assert.ok(Math.abs(prepared.tensor.data[0]-(243/255-.485)/.229)<1e-6);assert.ok(Math.abs(prepared.tensor.data[736*736]-(127/255-.456)/.224)<1e-6);assert.ok(Math.abs(prepared.tensor.data[2*736*736]-(24/255-.406)/.225)<1e-6);assert.deepEqual([...data.subarray(0,3)],[24,127,243]);assert.ok(reserved>0);}finally{prepared.release();}assert.equal(reserved,0);
});

test('Large and slender source windows cover all original pixels without whole-image downscaling',()=>{
 for(const [w,h] of [[5400,3500],[135,1600],[13,60]]){
  const tiles=scientificTextTiles(w,h);assert.ok(tiles.length>0);assert.equal(Math.min(...tiles.map(t=>t[0])),0);assert.equal(Math.min(...tiles.map(t=>t[1])),0);assert.equal(Math.max(...tiles.map(t=>t[2])),w);assert.equal(Math.max(...tiles.map(t=>t[3])),h);
  for(let y=0;y<h;y+=71)for(let x=0;x<w;x+=89)assert.ok(tiles.some(t=>x>=t[0]&&x<t[2]&&y>=t[1]&&y<t[3]));
  assert.ok(tiles.every(t=>t[2]>t[0]&&t[3]>t[1]));
 }
});

test('Rotated numeric or letter-shaped model components become oriented exclusions in original coordinates',async()=>{
 const w=110,h=90,p=new Float32Array(w*h);for(let y=10;y<70;y++)for(let x=10;x<95;x++){const u=(x-45)*Math.cos(.5)+(y-40)*Math.sin(.5),v=-(x-45)*Math.sin(.5)+(y-40)*Math.cos(.5);if(Math.abs(u)<=29&&Math.abs(v)<=5)p[y*w+x]=.9;}
 const original=p.slice(),boxes=await scientificTextBoxes(p,w,h,{tile:[100,200,320,380],sourceWidth:500,sourceHeight:500});assert.equal(boxes.detections.length,1);const q=boxes.detections[0].polygon;assert.equal(q.length,4);assert.ok(q.every(([x,y])=>x>=100&&x<320&&y>=200&&y<380));assert.ok(Math.abs(q[1][1]-q[0][1])>10);assert.ok(boxes.detections[0].confidence>.45);assert.deepEqual(p,original);
});

test('A model probability threshold does not turn uncertain visual texture into an exclusion',async()=>{
 const map=new Float32Array(64*64).fill(.1);for(let y=4;y<20;y++)for(let x=3;x<43;x++)map[y*64+x]=.3;
 assert.equal((await scientificTextBoxes(map,64,64)).detections.length,0);
});

test('An exhausted published candidate limit and invalid model outputs are explicit',async()=>{
 const map=new Float32Array(80*80);for(const [x0,y0] of [[5,5],[42,42]])for(let y=y0;y<y0+8;y++)for(let x=x0;x<x0+23;x++)map[y*80+x]=.95;
 const result=await scientificTextBoxes(map,80,80,{maxCandidates:1});assert.equal(result.truncated,true);assert.equal(result.candidates,2);assert.equal(result.detections.length,1);
 map[0]=NaN;await assert.rejects(()=>scientificTextBoxes(map,80,80),{code:'MODEL_OUTPUT_INVALID'});assert.throws(()=>new ScientificTextDetector(),{code:'MODEL_UNAVAILABLE'});
});

test('Detector releases both source/tensor and model leases on failure and cancellation',async()=>{
 let charged=0,modelReleased=0;const budget={reserve(n){charged+=n;return()=>charged-=n;}};
 const source={format:'rgb8',width:736,height:736,data:new Uint8Array(736*736*3)};
 const detector=new ScientificTextDetector({budget,run:async()=>({result:{fetch_name_0:{dims:[1,1,1,1],data:new Float32Array(1)}},release(){modelReleased++;}})});
 await assert.rejects(()=>detector.detect(source),{code:'INVALID_INPUT'});assert.equal(charged,0);assert.equal(modelReleased,1);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>detector.detect(source,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(charged,0);
});

test('An acquisition-sized OCR false positive is routed to review before a semantic exclusion can erase blot data',async()=>{
 const source={format:'rgb8',width:736,height:736,data:new Uint8Array(736*736*3)};
 const detector=new ScientificTextDetector({run:async feeds=>{const [,,h,w]=feeds.x.dims,p=new Float32Array(w*h);for(let y=100;y<635;y++)for(let x=100;x<635;x++)p[y*w+x]=.9;return {fetch_name_0:{data:p,dims:[1,1,h,w]}};}});
 const result=await detector.detect(source);assert.equal(result.status,'needs-review');assert.equal(result.warnings[0].code,'large-text-region');assert.ok(result.warnings[0].coverage>.2);assert.equal(result.detections.length,1);assert.equal(result.metadata.postprocess.boxThreshold,.45);assert.equal(source.data[0],0);
});

test('Minimum rectangles preserve a vertical or diagonal text orientation',()=>{
 const r=minimumTextRectangle([[1,2],[7,8],[9,6],[3,0]]);assert.ok(r);assert.ok(Math.abs(r.area-24)<1e-8);assert.equal(r.polygon.length,4);assert.equal(SCIENTIFIC_TEXT_MODEL.input,'x');assert.equal(SCIENTIFIC_TEXT_MODEL.output,'fetch_name_0');
});
