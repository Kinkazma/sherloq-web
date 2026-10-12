import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfTextPolygons,projectPdfExclusions,rectangleComplement,clipPolygon} from '../web/wordpress/sherloq-browser/assets/batch-scope-geometry.js';
test('PDF text is located without depending on recognized words or retaining text',()=>{
 const p=pdfTextPolygons({items:[{str:'7',transform:[10,0,0,10,20,30],width:6,fontName:'f'},{str:' ',transform:[10,0,0,10,20,30],width:6}],styles:{f:{ascent:.8,descent:-.2}}});
 assert.deepEqual(p,[[[20,28],[26,28],[26,38],[20,38]]]);
});
test('Rotated PDF images receive exact source pixel exclusions, including clipping',()=>{
 const matrix=[0,200,-100,0,350,50],source=[[10,20],[30,20],[30,40],[10,40]],pdf=source.map(([x,y])=>[350-100*(1-y/100),50+200*x/200]);
 assert.deepEqual(projectPdfExclusions([pdf],matrix,200,100)[0].map(p=>p.map(Math.round)),source);
 assert.equal(projectPdfExclusions([[[0,0],[1,0],[1,1],[0,1]]],matrix,200,100).length,0);
 assert.throws(()=>projectPdfExclusions([pdf],[1,2,2,4,0,0],200,100),/Singular/);
 const ordered=p=>p.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 assert.deepEqual(ordered(clipPolygon([[-1,-1],[2,-1],[2,2],[-1,2]],1,1)),ordered([[0,0],[1,0],[1,1],[0,1]]));
});
test('Cross-image selection excludes every gap and graph rather than including an envelope',()=>{
 const gaps=rectangleComplement([{x0:0,y0:0,x1:20,y1:50},{x0:80,y0:0,x1:100,y1:50}],100,100);
 assert.deepEqual(gaps,[[[20,0],[80,0],[80,50],[20,50]],[[0,50],[100,50],[100,100],[0,100]]]);
 assert.deepEqual(rectangleComplement([{x0:-10,y0:-10,x1:110,y1:110}],100,100),[]);
 assert.equal(rectangleComplement([],100,100).length,1);
});
