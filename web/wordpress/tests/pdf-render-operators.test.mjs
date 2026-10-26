import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/pdf-node-environment.mjs';
// Use the actual bundled PDF.js API, without experimental Node module mocks.
const {OPS,version}=await import('../sherloq-browser/assets/batch-vendor/pdf.mjs');
assert.equal(version,'5.6.205');
const {createPdfRenderOperatorBridge,preparePdfRenderOperators}=await import('../sherloq-browser/assets/pdf-render-operators.js');
const {pdfPagePaintCapabilities}=await import('../sherloq-browser/assets/batch-import.js');
const list=(length,index,{width=1382,height=2590,kind=85,id='extracted-image',lastChunk=true}={})=>({fnArray:Array.from({length},(_,i)=>i===index?kind:OPS.setFillGray),argsArray:Array.from({length},(_,i)=>i===index?kind===85?[id,width,height]:[{width,height}]:[0]),lastChunk});
function source(extracted){let reads=0;return{getOperatorList:async()=>{reads++;return extracted;},get reads(){return reads;}};}
function task(display){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});let paints=0,cancels=0;const result={promise,_internalRenderTask:{operatorList:display},cancel(){cancels++;reject(new DOMException('Stopped','AbortError'));},get paints(){return paints;},get cancels(){return cancels;},run(){result.onContinue(()=>{paints++;resolve();});}};promise.catch(()=>{});return result;}
const turn=()=>new Promise(resolve=>setTimeout(resolve,12));

test('display image indices are resolved from a complete certified stream, independently of text offset and object ID',async()=>{
 const extracted=list(1160,1158),page=source(extracted),caps=pdfPagePaintCapabilities(extracted,OPS),bridge=await createPdfRenderOperatorBridge(page,caps),render=task(list(1154,1152,{id:'display-image'}));
 bridge.bind(render);render.run();await bridge.ready;assert.equal(bridge.logicalImage(1152),1158);assert.equal(bridge.logicalImage(1153),undefined);assert.equal(render.paints,1);bridge.dispose();assert.equal(render.onContinue,null);
});

test('all chunks and the complete graphics context are validated before the first paint',async()=>{
 const extracted=list(9,8),page=source(extracted),caps=pdfPagePaintCapabilities(extracted,OPS),display=list(7,6,{lastChunk:false}),bridge=await createPdfRenderOperatorBridge(page,caps),render=task(display);
 bridge.bind(render);render.run();await turn();assert.equal(render.paints,0);display.lastChunk=true;await bridge.ready;assert.equal(render.paints,1);assert.equal(bridge.logicalImage(6),8);bridge.dispose();
});

test('forged logical offsets, mutated certificates and certificates from another page fail explicitly',async()=>{
 const extracted=list(9,8),page=source(extracted),wrong={schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[99999]};
 await assert.rejects(createPdfRenderOperatorBridge(page,wrong),/logical PDF image occurrences/);
 const caps=pdfPagePaintCapabilities(extracted,OPS);await preparePdfRenderOperators(page,caps);await assert.rejects(createPdfRenderOperatorBridge(source(extracted),caps),/different source/);caps.imageOperators[0]=7;await assert.rejects(createPdfRenderOperatorBridge(page,caps),/different source/);
});

test('source cleanup does not replace the logical image extraction identity',async()=>{
 const extracted=list(1160,1158),page=source(extracted),caps=pdfPagePaintCapabilities(extracted,OPS);await preparePdfRenderOperators(page,caps);
 page.getOperatorList=async()=>{throw Error('A cached certificate must not parse the page again.');};
 const bridge=await createPdfRenderOperatorBridge(page,caps),render=task(list(1154,1152));bridge.bind(render);render.run();await bridge.ready;assert.equal(bridge.logicalImage(1152),1158);bridge.dispose();assert.equal(page.reads,1);
});

test('shape changes, additional image paints and unsafe display states cancel without painting',async()=>{
 for(const change of ['shape','kind','count','state']){
  const extracted=list(9,8),page=source(extracted),caps=pdfPagePaintCapabilities(extracted,OPS),display=list(7,6,change==='shape'?{width:1381}:change==='kind'?{kind:86}:{});
  if(change==='count'){display.fnArray[2]=OPS.paintImageXObject;display.argsArray[2]=['extra',1382,2590];}
  if(change==='state'){display.fnArray[2]=OPS.beginGroup;display.argsArray[2]=[];}
  const bridge=await createPdfRenderOperatorBridge(page,caps),render=task(display);bridge.bind(render);render.run();await assert.rejects(bridge.ready,{code:'PDF_RENDER_OPERATORS_UNSUPPORTED'});assert.equal(render.paints,0,change);assert.equal(render.cancels,1,change);bridge.dispose();assert.equal(render.onContinue,null);
 }
});

test('consumer cancellation settles a pending plan without cancelling another consumer of that plan',async()=>{
 const extracted=list(9,8),caps=pdfPagePaintCapabilities(extracted,OPS);let complete,reads=0;const page={getOperatorList:()=>{reads++;return new Promise(resolve=>{complete=resolve;});}},cancel=new AbortController();
 const first=preparePdfRenderOperators(page,caps,{signal:cancel.signal}),second=preparePdfRenderOperators(page,caps);await turn();cancel.abort(new DOMException('Cancelled','AbortError'));await assert.rejects(first,{name:'AbortError'});assert.equal(reads,1);complete(extracted);await second;assert.equal(reads,1);
});

test('a failed/cancelled display settles the gate and does not leave a resume callback',async()=>{
 const extracted=list(9,8),page=source(extracted),caps=pdfPagePaintCapabilities(extracted,OPS),bridge=await createPdfRenderOperatorBridge(page,caps),render=task(list(7,6,{lastChunk:false}));
 bridge.bind(render);render.run();render.cancel();await assert.rejects(bridge.ready,{name:'AbortError'});bridge.dispose();assert.equal(render.onContinue,null);assert.equal(render.paints,0);
});
