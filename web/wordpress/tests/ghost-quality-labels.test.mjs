import test from 'node:test';import assert from 'node:assert/strict';
import {resultDisplays} from '../sherloq-browser/assets/tool-displays.js';
const surface=id=>({id,revision:1,width:8,height:6,format:'rgb8'});
test('native Ghost views display their quality without replacing their owned surface handles',()=>{
 const views=[50,55,90].map((quality,index)=>({quality,pixels:surface('native-'+index)})),output={operation:'jpeg.ghosts',data:{views}};
 const found=resultDisplays(output);assert.deepEqual(found.map(value=>value.label),['Qualité 50','Qualité 55','Qualité 90']);assert.deepEqual(found.map(value=>value.display),views.map(value=>value.pixels));assert.equal(found[2].ghost.quality,90);assert.equal(found[2].ghost.index,2);assert.equal(views[0].pixels.ghost,undefined);
});
test('the independent native block atlas retains its quality values and original identity',()=>{
 const pixels=[surface('q50'),surface('q90')],originalSurface=surface('original'),output={operation:'jpeg.ghosts',data:{qualities:Uint8Array.of(50,90),views:pixels.map((value,index)=>({quality:[50,90][index],pixels:value})),originalSurface},parameterViews:[...pixels,{originalSurface}]};
 for(const language of ['fr','en']){const found=resultDisplays(output,{language});assert.deepEqual(found.map(value=>value.label),language==='fr'?['Qualité 50','Qualité 90','Image originale']:['Quality 50','Quality 90','Original image']);assert.equal(found[2].display,originalSurface);assert.equal(found[2].ghost.original,true);assert.equal(found[2].ghost.quality,undefined);assert.equal(found[2].ghost.index,2);}
});
test('retained Ghost draft qualities override a shifted native array without changing its owner',()=>{
 const pixels={...surface('retained'),retainedParameterView:{kind:'ghosts',view:{index:2,quality:60}}},output={operation:'jpeg.ghosts',data:{qualities:Uint8Array.of(55,60,65)},parameterViews:[pixels]};
 const [found]=resultDisplays(output);assert.equal(found.label,'Qualité 60');assert.equal(found.display,pixels);assert.deepEqual(found.ghost,{index:2,original:false,quality:60});
});
test('native Ghost quality layer metadata supplies a quality when no array is retained',()=>{
 const pixels=surface('only'),output={operation:'jpeg.ghosts',parameterViews:[pixels],layers:[{id:'quality-83',surfaceId:pixels.id}]};assert.equal(resultDisplays(output)[0].label,'Qualité 83');
});
test('unknown Ghost views and other operations retain their existing result naming',()=>{
 const pixels=surface('unknown');assert.equal(resultDisplays({operation:'jpeg.ghosts',parameterViews:[pixels]})[0].label,'views.0');assert.equal(resultDisplays({operation:'colors.space',surface:pixels})[0].label,'surface');
});
