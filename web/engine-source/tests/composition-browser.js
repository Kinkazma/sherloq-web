import {Budget} from '../src/cache.js';
import {createCloneCorroboration} from '../src/clone-corroboration.js';
export async function compositionBrowserTest(){
 const r=await(await fetch('/tests/data/composition-native.json')).json();r.entries=r.entries.map(e=>e.pixel_mask?{...e,pixel_mask:{width:e.pixel_mask[0].length,height:e.pixel_mask.length,data:Uint8Array.from(e.pixel_mask.flat())}}:e);
 const budget=new Budget(128*1024**2),kernel=createCloneCorroboration({budget});let result;
 try{result=await kernel.counts(r);const expected=r.counts.flat(),different=result.values.reduce((n,v,i)=>n+Number(v!==expected[i]),0);if(different)throw Error(`${different} count pixels differ`);return {status:'passed',pixels:expected.length,different,peakAccountedBytes:budget.peak};}
 finally{result?.release();kernel.dispose();if(budget.total())throw Error('Budget leaked');}
}
