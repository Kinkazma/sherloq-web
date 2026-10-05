import test from 'node:test';import assert from 'node:assert/strict';
import {createEnergyUI} from '../sherloq-browser/assets/energy-ui.js';
test('each manual energy edit synchronizes only its paired input and label',()=>{
 globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',min:0,max:1000,addEventListener(){},replaceChildren(){},reportValidity:()=>true});return nodes.get(id);};
 const ui=createEnergyUI({$,t:x=>x,changed(){},persist(){},viewChanged(){}});
 for(const k of ['histogramLow','histogramHigh','shadow','highlight'])for(const suffix of ['','-number']){
  const before=ui.bundle().values,n=before[k]+(k==='histogramHigh'?-1:1);$('energy-'+k+suffix).value=String(n);$('energy-'+k+suffix).oninput();
  assert.deepEqual(ui.bundle().values,{...before,[k]:n});assert.equal(Number($('energy-'+k+(suffix?'':'-number')).value),n);assert.ok($('energy-'+k+'-value').textContent.startsWith((n/10).toFixed(1)));
 }
});
