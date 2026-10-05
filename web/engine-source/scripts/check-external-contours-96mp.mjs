import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {externalMaskContours} from '../src/external-mask-contours.js';
const budget=new Budget(256*1024**2),width=12000,height=8000,owned=budget.reserve(width*height),mask=new Uint8Array(width*height),start=performance.now();
// Two distant rectangles, one hollow with an island inside: RETR_EXTERNAL
// excludes the nested island and hole, preserves reverse scan contour order.
for(let y=40;y<7900;y++)mask.fill(1,y*width+50,y*width+5700);
for(let y=100;y<7800;y++)mask.fill(0,y*width+100,y*width+5600);
for(let y=300;y<7600;y++)mask.fill(1,y*width+300,y*width+5400);
for(let y=50;y<7950;y++)mask.fill(1,y*width+6500,y*width+11900);
const out=await externalMaskContours({width,height,mask},{budget});assert.deepEqual(out.polygons,[[[6500,50],[6500,7949],[11899,7949],[11899,50]],[[50,40],[50,7899],[5699,7899],[5699,40]]]);out.release();owned();assert.equal(budget.total(),0);console.log(JSON.stringify({passed:true,scope:'contour-only generated mask; not full ELA inference',dimensions:[width,height],totalMs:performance.now()-start,memory:budget.snapshot()}));
