import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {gray} from '../src/pixel-utils.js';
import {textTilePgm,visitTextPixels} from '../src/text-pixels.js';
import {supportedTextBoxes} from '../src/text-regions.js';
const native=JSON.parse(await readFile(new URL('./m3-data/text-regions-reference.json',import.meta.url)));
const pixels={format:'rgb8',width:native.width,height:native.height,data:Uint8Array.from(native.rgb)};
function source(budget,{windows=false,fail=false}={}){
 let reads=0,maxRows=0,released=0;
 const own=(rect,signal)=>{reads++;maxRows=Math.max(maxRows,rect.height);const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let yy=0;yy<rect.height;yy++)data.set(pixels.data.subarray(((rect.y+yy)*pixels.width+rect.x)*3,((rect.y+yy)*pixels.width+rect.x+rect.width)*3),yy*rect.width*3);return {pixels:{format:'rgb8',width:fail?rect.width+1:rect.width,height:rect.height,data},release(){released++;free();}};};
 return {format:'rgb8',width:pixels.width,height:pixels.height,...(windows?{readWindow:async(rect,{signal}={})=>own(rect,signal)}:{readRows:async(y,count,{signal}={})=>own({x:0,y,width:pixels.width,height:count},signal)}),stats:()=>({reads,maxRows,released})};
}
test('bounded rows and windows preserve native OCR support and exact PGM grayscale bytes',async()=>{
 const rectangle=[3,4,pixels.width-2,pixels.height-3],w=rectangle[2]-rectangle[0],h=rectangle[3]-rectangle[1],head=new TextEncoder().encode(`P5\n${w} ${h}\n255\n`),expected=new Uint8Array(head.length+w*h);expected.set(head);
 for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const at=((rectangle[1]+yy)*pixels.width+rectangle[0]+xx)*3;expected[head.length+yy*w+xx]=gray(pixels.data[at],pixels.data[at+1],pixels.data[at+2]);}
 assert.deepEqual(await textTilePgm(pixels,rectangle),expected);
 for(const windows of [false,true]){const budget=new Budget(1024**2),image=source(budget,{windows});assert.deepEqual(await textTilePgm(image,rectangle),expected);assert.deepEqual(await supportedTextBoxes(image,native.parsed,{reserveMemory(){}}),native.supported);assert.equal(budget.total(),0);assert.equal(image.stats().reads,image.stats().released);assert.ok(image.stats().maxRows<=32);assert.ok(image.stats().reads>1);}
});
test('invalid windows, visitor failures and cancellation release every borrowed source strip',async()=>{
 const budget=new Budget(1024**2),bad=source(budget,{fail:true});await assert.rejects(textTilePgm(bad,[0,0,8,8]),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);assert.equal(bad.stats().released,1);
 const image=source(budget,{windows:true});await assert.rejects(visitTextPixels(image,[0,0,8,8],()=>{throw Error('consumer');}),/consumer/);assert.equal(budget.total(),0);
 const controller=new AbortController();await assert.rejects(visitTextPixels(image,[0,0,8,pixels.height],()=>controller.abort(),{signal:controller.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);assert.equal(image.stats().reads,image.stats().released);
});
