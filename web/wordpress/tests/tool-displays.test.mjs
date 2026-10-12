import test from 'node:test';import assert from 'node:assert/strict';
import {resultDisplays} from '../sherloq-browser/assets/tool-displays.js';
const source={id:'source-in-another-worker',revision:1,width:1600,height:1100,format:'rgb8'};
for(const method of ['trufor','catnet','cfa','composite'])test(method+' selects published result views without treating source metadata as an owned surface',()=>{
 const views=(method==='trufor'?['map','confidence','noiseprint_pp']:[0,1,2]).map(view=>({...source,id:'m2-1-'+view,m2Result:1,view}));
 const output={operation:'m2.'+method,m2Result:{id:1},data:{source:{dimensions:source}},views};
 const found=resultDisplays(output);assert.deepEqual(found.map(x=>x.display),views);assert.equal(found.some(x=>x.display.id===source.id),false);
});
test('an explicit empty M2 view list does not select a foreign source descriptor',()=>{assert.deepEqual(resultDisplays({m2Result:{id:1},views:[],data:{source:{dimensions:source}}}),[]);});
test('ordinary engine surfaces and explicit neural presentations retain their handlers',()=>{
 assert.equal(resultDisplays({surface:source})[0].display,source);const owned=[{label:'Neural overlay',display:{...source,cloneView:'overlay'}}];assert.equal(resultDisplays({surface:source},{neuralDisplays:()=>owned}),owned);
});
