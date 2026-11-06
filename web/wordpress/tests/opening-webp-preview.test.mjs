import test from 'node:test';
import assert from 'node:assert/strict';
import {openingImageDimensions,createOpeningImagePreview} from '../sherloq-browser/assets/opening-image-preview.js';

const text=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
function chunk(tag,data){const b=new Uint8Array(8+data.length+(data.length&1));b.set(text(tag));new DataView(b.buffer).setUint32(4,data.length,true);b.set(data,8);return b;}
function still({width=2255,height=1511,flags=32,frameWidth=width,frameHeight=height,lossless=false,extra=[],reserved=0}={}){
 const header=new Uint8Array(10);header[0]=flags;header[1]=reserved;
 for(const [at,value]of[[4,width-1],[7,height-1]]){header[at]=value&255;header[at+1]=(value>>>8)&255;header[at+2]=(value>>>16)&255;}
 const frame=new Uint8Array(lossless?5:10);
 if(lossless){frame[0]=47;new DataView(frame.buffer).setUint32(1,(frameWidth-1)|((frameHeight-1)<<14),true);}
 else{frame.set([0,0,0,157,1,42]);new DataView(frame.buffer).setUint16(6,frameWidth,true);new DataView(frame.buffer).setUint16(8,frameHeight,true);}
 const chunks=[chunk('VP8X',header),...(flags&32?[chunk('ICCP',new Uint8Array(4))]:[]),...extra,...(!lossless&&flags&16?[chunk('ALPH',new Uint8Array(4))]:[]),chunk(lossless?'VP8L':'VP8 ',frame)];
 const bytes=new Uint8Array(12+chunks.reduce((n,b)=>n+b.length,0));bytes.set(text('RIFF'));bytes.set(text('WEBP'),8);new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);let p=12;for(const b of chunks){bytes.set(b,p);p+=b.length;}return bytes;
}
for(const lossless of[false,true])test(`static extended WebP ${lossless?'VP8L':'VP8'} admits its verified canvas`,()=>{
 const b=still({lossless});assert.deepEqual(openingImageDimensions(b),{format:'webp',width:2255,height:1511,orientation:1,bytesPerPixel:4});
});
test('static extended alpha and odd padded ancillary chunks remain eligible',()=>{
 const b=still({flags:48,extra:[chunk('JUNK',new Uint8Array(3))]});assert.equal(openingImageDimensions(b)?.width,2255);
});
test('animation, EXIF orientation, reserved flags and mismatched canvas defer to native decoding',()=>{
 for(const options of[{flags:2},{flags:8},{flags:1},{reserved:1},{frameWidth:2254},{extra:[chunk('ANIM',new Uint8Array(6))]},{extra:[chunk('EXIF',new Uint8Array(6))]}])assert.equal(openingImageDimensions(still(options)),null,JSON.stringify(options));
});
test('truncated extended headers or reconstruction metadata never start a browser decode',()=>{
 const b=still();for(const length of[29,32,40,b.length-1])assert.equal(openingImageDimensions(b.subarray(0,length),b.length),null);
 const bad=still();new DataView(bad.buffer).setUint32(34,0xffffffff,true);assert.equal(openingImageDimensions(bad),null);
});
function dom(){const images=[];return{images,createElement(){const value={style:{},dataset:{},removeAttribute(){},remove(){},naturalWidth:2255,naturalHeight:1511};images.push(value);return value;}};}
test('extended preview starts early and releases its object URL on cancellation',async()=>{
 const document=dom(),file=new Blob([still()]),created=[],revoked=[],controller=new AbortController(),owner=createOpeningImagePreview({file,document,signal:controller.signal,urlAPI:{createObjectURL(v){created.push(v);return'blob:owned';},revokeObjectURL(v){revoked.push(v);}}});
 const attached=[];owner.attach({append(v){attached.push(v);}});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(created.length,1);assert.equal(attached[0].src,'blob:owned');attached[0].onload();assert.equal(await owner.ready,true);controller.abort();assert.deepEqual(revoked,['blob:owned']);owner.dispose();assert.equal(revoked.length,1);
});
test('extended preview preserves bounded memory and stale-source guards',async()=>{
 for(const options of[{maxPixels:100},{isCurrent:()=>false}]){let created=0;const owner=createOpeningImagePreview({file:new Blob([still()]),document:dom(),...options,urlAPI:{createObjectURL(){created++;return'blob:wrong';},revokeObjectURL(){}}});assert.equal(await owner.ready,false);assert.equal(created,0);owner.dispose();}
});
