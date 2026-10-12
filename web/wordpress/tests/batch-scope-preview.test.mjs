import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {appendScientificScopePreview} from '../sherloq-browser/assets/batch-scope-preview.js';
import {rectangleComplement,rectanglePolygon} from '../sherloq-browser/assets/batch-scope-geometry.js';

const render=scope=>{const {document}=parseHTML('<!doctype html><body></body>'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');appendScientificScopePreview(svg,scope,{width:200,height:100,id:'figure-1'});return svg;};
const region={x0:20,y0:20,x1:180,y1:80};
test('A microscopy panel has a green boundary; unclassified margins cannot draw a red frame',()=>{
 const excluded=rectangleComplement([region],200,100),scope={status:'ready',regions:[region],excluded},before=structuredClone(scope),svg=render(scope);
 assert.equal(svg.querySelectorAll('.batch-exclusion-zone').length,0);assert.equal(svg.querySelectorAll('.batch-scope-remainder-zone').length,excluded.length);
 assert.equal(svg.querySelector('.batch-acquisition-outline').getAttribute('points'),'20,20 180,20 180,80 20,80');
 assert.equal(svg.lastElementChild.getAttribute('class'),'batch-acquisition-outline');assert.deepEqual(scope,before);
});
test('Text inside microscopy remains excluded from the green fill using the exact scientific polygons',()=>{
 const text=[[40,30],[80,30],[80,40],[40,40]],excluded=[text,...rectangleComplement([region],200,100)],scope={status:'ready',regions:[region],excluded,text:{polygons:[text]}},svg=render(scope);
 assert.equal(svg.querySelector('.batch-exclusion-zone').getAttribute('points'),'40,30 80,30 80,40 40,40');
 const mask=svg.querySelector('mask'),black=[...mask.querySelectorAll('polygon[fill="black"]')];assert.equal(black.length,excluded.length);assert.deepEqual(black.map(p=>p.getAttribute('points')),excluded.map(p=>p.map(x=>x.join(',')).join(' ')));
 assert.equal(svg.querySelector('g').getAttribute('mask'),'url(#batch-admitted-figure-1)');
});
test('A classified chart stays red even if its rectangle also matches an unclassified complement strip',()=>{
 const r={x0:0,y0:0,x1:100,y1:100},excluded=rectangleComplement([r],200,100),scope={status:'ready',regions:[r],excluded,panels:{panels:[{label:'Graphs',rectangle:[100,0,200,100]}]}},svg=render(scope);
 assert.equal(svg.querySelector('.batch-exclusion-zone').getAttribute('points'),rectanglePolygon({x0:100,y0:0,x1:200,y1:100}).map(p=>p.join(',')).join(' '));
});
test('A blocked ambiguous blot is never painted as an accepted green acquisition',()=>{
 const svg=render({status:'needs-review',regions:[region],excluded:[rectanglePolygon(region)]});
 assert.equal(svg.querySelectorAll('.batch-acquisition-zone,.batch-acquisition-outline,.batch-exclusion-zone').length,0);assert.ok(svg.querySelector('.batch-pending-acquisition-outline'));assert.ok(svg.querySelector('.batch-pending-exclusion-zone'));
});
