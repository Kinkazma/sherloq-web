import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticParameterMode,configureAutomaticSlider} from '../sherloq-browser/assets/source-parameter-constraints.js';
class Input extends EventTarget{
 constructor(value=''){super();this.value=value;this.attrs=new Map();this.ownerDocument={documentElement:{lang:'fr'}};this.validationMessage='';}
 setAttribute(name,value){this.attrs.set(name,String(value));}
 getAttribute(name){return this.attrs.get(name)??null;}
 removeAttribute(name){this.attrs.delete(name);}
 setCustomValidity(message){this.validationMessage=message;}
 edit(value){this.value=String(value);this.dispatchEvent(new Event('input'));}
}
test('RGB automatic remains nullable and its numeric rail follows actual source dimensions including one pixel',()=>{
 for(const [width,height,max]of[[1537,1153,10],[257,193,7],[1,1,0]]){const input=new Input('');configureAutomaticSlider(input,'colors.plots','scale',{width,height});assert.equal(input.getAttribute('min'),'0');assert.equal(input.getAttribute('max'),String(max));assert.equal(input.required,false);assert.deepEqual(JSON.parse(input.getAttribute('data-hover-slider-automatic')),{value:null,boundary:0});assert.equal(input.value,'');}
});
test('zero Otsu and zero native JPEG remain valid sentinels, while manual rails start at one',()=>{
 for(const [operation,key,max]of[['inspection.adjust','threshold',255],['ela.energy','quality',100],['ela.biomes','quality',100]]){const input=new Input('0');configureAutomaticSlider(input,operation,key);assert.equal(input.getAttribute('min'),'0');assert.equal(input.getAttribute('max'),String(max));assert.equal(input.getAttribute('step'),'1');assert.deepEqual(JSON.parse(input.getAttribute('data-hover-slider-automatic')),{value:0,boundary:1});assert.equal(input.value,'0');}
});
test('Composite batch exposes only Auto0 or manual51..101, including no-JPEG101, and validates the forbidden gap',()=>{
 const input=new Input('0');configureAutomaticSlider(input,'composite','quality');assert.deepEqual(JSON.parse(input.getAttribute('data-hover-slider-automatic')),{value:0,boundary:51});assert.equal(input.getAttribute('max'),'101');for(const value of[0,51,75,100,101]){input.edit(value);assert.equal(input.validationMessage,'');}for(const value of[1,25,50]){input.edit(value);assert.match(input.validationMessage,/51/);}input.edit(0);assert.equal(input.validationMessage,'');
});
test('manual zeros, disabled processing, native-size and separate estimation actions are never relabeled Auto',()=>{
 for(const [operation,key]of[['detail.wavelets','threshold'],['m2.cfa','tile'],['noise.separation','levels'],['inspection.adjust','brightness'],['colors.plots','alpha'],['ela.classic','quality'],['tampering.copyMove.sparse','normalizationLongEdge'],['ela.energy','shadow'],['ela.energy','histogramLow']])assert.equal(automaticParameterMode(operation,key),null,operation+'/'+key);
 const input=new Input('0');input.setAttribute('min','-255');input.setAttribute('max','255');configureAutomaticSlider(input,'inspection.adjust','brightness');assert.equal(input.getAttribute('min'),'-255');assert.equal(input.getAttribute('max'),'255');assert.equal(input.getAttribute('data-hover-slider-automatic'),null);
});
