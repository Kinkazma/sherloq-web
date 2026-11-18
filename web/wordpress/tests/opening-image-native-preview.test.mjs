import test from 'node:test';
import assert from 'node:assert/strict';
import {openingImageDimensions,canReadNativeOpeningPreview,createOpeningImagePreview} from '../sherloq-browser/assets/opening-image-preview.js';
import {openingPreviewShape,decodeBrowserOpeningPreview} from '../sherloq-browser/assets/opening-image-decode.js';

const text=value=>Uint8Array.from(value,c=>c.charCodeAt(0));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function png(width=200,height=120,{depth=8,transfer=null}={}){
 const b=new Uint8Array(transfer===null?49:65),v=new DataView(b.buffer);b.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);b.set(text('IHDR'),12);v.setUint32(16,width);v.setUint32(20,height);b[24]=depth;b[25]=2;let at=33;
 if(transfer!==null){v.setUint32(at,4);b.set(text('cICP'),at+4);b.set([12,transfer,0,1],at+8);at+=16;}
 v.setUint32(at,4);b.set(text('IDAT'),at+4);return b;
}
function jpeg(width=200,height=120,{channels=3,gainmap=false,orientation=1}={}){
 const parts=[Uint8Array.of(255,216)];
 if(orientation!==1){const exif=new Uint8Array(32),v=new DataView(exif.buffer);exif.set(text('Exif\0\0II'));v.setUint16(8,42,true);v.setUint32(10,8,true);v.setUint16(14,1,true);v.setUint16(16,0x112,true);v.setUint16(18,3,true);v.setUint32(20,1,true);v.setUint16(24,orientation,true);const app=new Uint8Array(exif.length+4);app.set([255,225]);new DataView(app.buffer).setUint16(2,exif.length+2);app.set(exif,4);parts.push(app);}
 if(gainmap){const xmp=text('http://ns.adobe.com/hdr-gain-map/1.0/ hdrgm:Version="1.0" MPF\0'),app=new Uint8Array(xmp.length+4);app.set([255,225]);new DataView(app.buffer).setUint16(2,xmp.length+2);app.set(xmp,4);parts.push(app);}
 const n=8+channels*3,sof=new Uint8Array(n+2),v=new DataView(sof.buffer);sof.set([255,192]);v.setUint16(2,n);sof[4]=8;v.setUint16(5,height);v.setUint16(7,width);sof[9]=channels;parts.push(sof,Uint8Array.of(255,218));const b=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return b;
}
function file(bytes,{size=bytes.length,name='input.bin'}={}){const reads=[];return{size,name,reads,slice(start,end){reads.push({start,end});return new Blob([bytes.subarray(start,Math.min(bytes.length,end))]);},stream(){return new Blob([bytes]).stream();}};}
function dom(){
 const elements=[];return{elements,createElement(tag){const value={tagName:tag.toUpperCase(),style:{},dataset:{},width:0,height:0,removed:false,draws:[],removeAttribute(){},remove(){this.removed=true;},getContext(){return this.context??=(this.context={drawImage:(...args)=>this.draws.push(args),createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4),width,height}),putImageData:(image)=>this.put=image});}};elements.push(value);return value;}};
}
function bitmap(width,height){return{width,height,closes:0,close(){this.closes++;}};}

test('one bounded shape handles tiny, 31MP and 100MP sources without a 16MP threshold',()=>{
 assert.deepEqual(openingPreviewShape({width:200,height:200,orientation:1}),{width:200,height:200,sourceWidth:200,sourceHeight:200});
 for(const dimensions of [{width:6861,height:4574,orientation:1},{width:10000,height:10000,orientation:1}]){const shape=openingPreviewShape(dimensions);assert.ok(shape.width*shape.height<=4*1024**2);assert.ok(shape.width<=4096&&shape.height<=4096);assert.ok(shape.width>1000);}
 assert.deepEqual(openingPreviewShape({width:400,height:200,orientation:6}),{width:200,height:400,sourceWidth:200,sourceHeight:400});
 assert.equal(openingPreviewShape({width:0,height:20}),null);
});
test('BMP and GIF dimensions join the ordinary browser preview inventory',()=>{
 const b=new Uint8Array(54),v=new DataView(b.buffer);b.set(text('BM'));v.setUint32(14,40,true);v.setInt32(18,10000,true);v.setInt32(22,-10000,true);assert.deepEqual(openingImageDimensions(b),{format:'bmp',width:10000,height:10000,orientation:1,bytesPerPixel:4});
 const g=new Uint8Array(13);g.set(text('GIF89a'));new DataView(g.buffer).setUint16(6,512,true);new DataView(g.buffer).setUint16(8,320,true);assert.equal(openingImageDimensions(g).format,'gif');
});
test('HDR PNG, 16-bit PNG, CMYK JPEG and gain maps defer to the managed source renderer',()=>{
 for(const b of [png(200,120,{depth:16}),png(200,120,{transfer:16}),png(200,120,{transfer:18}),jpeg(200,120,{channels:4}),jpeg(200,120,{gainmap:true})])assert.equal(canReadNativeOpeningPreview(b,openingImageDimensions(b)),false);
 assert.equal(canReadNativeOpeningPreview(png(),openingImageDimensions(png())),true);assert.equal(canReadNativeOpeningPreview(jpeg(),openingImageDimensions(jpeg())),true);
 const b=png();new DataView(b.buffer).setUint32(33,200000);const dimensions=openingImageDimensions(b,300000);assert.equal(canReadNativeOpeningPreview(b,dimensions),true,'A large IDAT payload is not required in the header probe');
});
test('a 100MP source larger than 8MiB requests one resized decode and reuses its preview for attachments',async()=>{
 const input=file(png(10000,10000),{size:20*1024**2}),document=dom(),calls=[],decoded=bitmap(1024,1024),owner=createOpeningImagePreview({file:input,document,imageDecoderClass:null,imageBitmapFactory:async(...args)=>{calls.push(args);return decoded;},maximumPreviewPixels:1024**2});
 const rows=[],a=owner.attach({append(value){rows.push(value);}}),b=owner.attach({append(value){rows.push(value);}});try{assert.equal(await owner.ready,true);assert.equal(calls.length,1);assert.equal(calls[0][0],input);assert.deepEqual(calls[0][1],{resizeWidth:1024,resizeHeight:1024,resizeQuality:'high',imageOrientation:'from-image',colorSpaceConversion:'default',premultiplyAlpha:'default'});assert.deepEqual(input.reads,[{start:0,end:128*1024}]);assert.equal(decoded.closes,1);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.width===1024&&row.height===1024&&row.draws.length===1));assert.equal(owner.snapshot().ownedRasterBytes,2*1024**2*4);a.dispose();assert.equal(owner.snapshot().ownedRasterBytes,1024**2*4);const c=owner.attach({append(value){rows.push(value);}});assert.equal(calls.length,1);assert.equal(rows.at(-1).draws.length,1);c.dispose();b.dispose();}finally{await owner.dispose();}assert.equal(owner.snapshot().ownedRasterBytes,0);assert.ok(rows.every(row=>row.removed));
});
test('managed AVIF and extended codecs share the same bounded SDR callback',async()=>{
 for(const name of ['image.AVIF','image.TIF','image.ARW','image.JXL']){
  const input=file(text('managed-input'),{size:7*1024**2,name}),document=dom(),calls=[],released=[],pixels={width:4,height:3,format:'rgb8',data:Uint8Array.from({length:36},(_,i)=>i)},owner=createOpeningImagePreview({file:input,document,imageDecoderClass:null,imageBitmapFactory:()=>{throw Error('HDR must not use an unmanaged browser bitmap');},decodePreview:async(...args)=>{calls.push(args);return{pixels,sourceWidth:6861,sourceHeight:4574,decoder:'shared-sdr-source',dispose(){released.push(true);}};}});owner.attach({append(){}});try{assert.equal(await owner.ready,true);await tick();assert.equal(calls.length,1);assert.equal(calls[0][0],input);assert.equal(calls[0][1].maxPixels,4*1024**2);assert.equal(calls[0][1].reason,'managed-format');assert.ok(calls[0][1].signal instanceof AbortSignal);assert.equal(released.length,1);const frame=document.elements.find(value=>value.put);assert.deepEqual(Array.from(frame.put.data.subarray(0,8)),[0,1,2,255,3,4,5,255]);assert.equal(owner.snapshot().decoder,'shared-sdr-source');assert.equal(owner.snapshot().sourceWidth,6861);}finally{await owner.dispose();}
 }
});
test('native decoder failure can use the same managed callback without an original-image URL',async()=>{
 let called=0,urls=0;const owner=createOpeningImagePreview({file:file(png()),document:dom(),imageDecoderClass:null,imageBitmapFactory:async()=>{throw Error('Unsupported native image');},urlAPI:{createObjectURL(){urls++;},revokeObjectURL(){}},decodePreview:async()=>{called++;return{pixels:{width:2,height:2,format:'rgba8',data:new Uint8Array(16)}};}});try{assert.equal(await owner.ready,true);assert.equal(called,1);assert.equal(urls,0);}finally{await owner.dispose();}
});
test('an opaque browser decode above its memory admission defers to the shared renderer',async()=>{
 let native=0,reason=null;const owner=createOpeningImagePreview({file:file(png(100000,100000)),document:dom(),imageDecoderClass:null,imageBitmapFactory:async()=>{native++;throw Error('Unfunded native raster must not be allocated');},decodePreview:async(_file,options)=>{reason=options.reason;return{pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)}};}});try{assert.equal(await owner.ready,true);assert.equal(native,0);assert.equal(reason,'native-memory-admission');assert.equal(owner.snapshot().nativeDecodedBytesEstimate,40_000_000_000);}finally{await owner.dispose();}
});
test('stale or cancelled browser decodes close their late bitmap before retirement completes',async()=>{
 for(const stale of [false,true]){const input=file(png()),document=dom(),late=bitmap(200,120);let resolve,current=true;const owner=createOpeningImagePreview({file:input,document,isCurrent:()=>current,imageDecoderClass:null,imageBitmapFactory:()=>new Promise(done=>resolve=done)});owner.attach({append(){}});await tick();let ended=false;if(stale)current=false;const retirement=stale?null:owner.dispose().then(()=>ended=true);assert.equal(ended,false);resolve(late);assert.equal(await owner.ready,false);await(retirement??owner.dispose());assert.equal(late.closes,1);assert.equal(owner.snapshot().ownedRasterBytes,0);assert.ok(document.elements.every(value=>value.draws.length===0));}
});
test('invalid or oversized managed pixel outputs release their owner without painting',async()=>{
 for(const pixels of [{width:5,height:5,format:'rgb8',data:new Uint8Array(75)},{width:2,height:2,format:'rgb16',data:new Uint16Array(12)}]){let freed=0;const document=dom(),owner=createOpeningImagePreview({file:file(text('managed')),document,maximumPreviewPixels:16,imageDecoderClass:null,imageBitmapFactory:null,decodePreview:async()=>({pixels,dispose(){freed++;}})});owner.attach({append(){}});assert.equal(await owner.ready,false);await owner.dispose();assert.equal(freed,1);assert.equal(owner.snapshot().ownedRasterBytes,0);assert.ok(document.elements.every(value=>value.draws.length===0));}
});
test('WebCodecs receives resized stream settings and closes its frame and decoder exactly once',async()=>{
 const frame={displayWidth:1024,displayHeight:1024,closes:0,close(){this.closes++;}},calls=[];class Decoder{static async isTypeSupported(type){return type==='image/png';}constructor(options){calls.push(options);this.closes=0;calls.push(this);}async decode(options){calls.push(options);return{image:frame};}close(){this.closes++;}}
 const input=file(png(10000,10000)),owner=createOpeningImagePreview({file:input,document:dom(),maximumPreviewPixels:1024**2,imageDecoderClass:Decoder,imageBitmapFactory:null});try{assert.equal(await owner.ready,true);await tick();assert.equal(calls[0].desiredWidth,1024);assert.equal(calls[0].desiredHeight,1024);assert.equal(calls[0].colorSpaceConversion,'default');assert.equal(calls[0].preferAnimation,false);assert.deepEqual(calls[2],{frameIndex:0,completeFramesOnly:true});assert.equal(calls[1].closes,1);assert.equal(frame.closes,1);}finally{await owner.dispose();}
});
test('EXIF rotation stays with the orientation-aware bitmap API',async()=>{
 const b=jpeg(200,120,{orientation:6}),dimensions=openingImageDimensions(b),shape=openingPreviewShape(dimensions),calls=[];let imageDecoders=0;class Decoder{constructor(){imageDecoders++;}static async isTypeSupported(){return true;}}
 const result=await decodeBrowserOpeningPreview(file(b),{dimensions,shape,imageDecoderClass:Decoder,imageBitmapFactory:async(_file,options)=>{calls.push(options);return bitmap(120,200);}});try{assert.equal(imageDecoders,0);assert.equal(calls[0].resizeWidth,120);assert.equal(calls[0].resizeHeight,200);assert.equal(calls[0].imageOrientation,'from-image');}finally{result.dispose();}
});
test('provider cleanup errors remain observable and repeat retirement does not run cleanup twice',async()=>{
 const failure=Error('native cleanup refused');let releases=0;const owner=createOpeningImagePreview({file:file(text('managed')),document:dom(),imageDecoderClass:null,imageBitmapFactory:null,decodePreview:async()=>({pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)},async dispose(){releases++;throw failure;}})});assert.equal(await owner.ready,true);await tick();await assert.rejects(owner.dispose(),error=>error===failure);await assert.rejects(owner.dispose(),error=>error===failure);assert.equal(releases,1);
});

test('ICO reaches the ordinary bounded decoder only for its one admitted image',async()=>{
 const b=new Uint8Array(26),v=new DataView(b.buffer);v.setUint16(2,1,true);v.setUint16(4,1,true);b[6]=32;b[7]=16;v.setUint32(14,4,true);v.setUint32(18,22,true);
 const dimensions=openingImageDimensions(b);assert.deepEqual(dimensions,{format:'ico',width:32,height:16,orientation:1,bytesPerPixel:4});assert.equal(canReadNativeOpeningPreview(b,dimensions),true);
 let calls=0;const owner=createOpeningImagePreview({file:file(b),document:dom(),imageDecoderClass:null,imageBitmapFactory:async(_file,options)=>{calls++;assert.equal(options.resizeWidth,32);assert.equal(options.resizeHeight,16);return bitmap(32,16);}});assert.equal(await owner.ready,true);assert.equal(calls,1);await owner.dispose();
 b[6]=b[7]=0;assert.equal(openingImageDimensions(b).width,256);v.setUint32(18,23,true);assert.equal(openingImageDimensions(b),null,'An icon payload outside the original is not admitted');
 const multi=new Uint8Array(42),m=new DataView(multi.buffer);m.setUint16(2,1,true);m.setUint16(4,2,true);multi[6]=32;multi[7]=16;m.setUint32(14,4,true);m.setUint32(18,38,true);assert.equal(canReadNativeOpeningPreview(multi,openingImageDimensions(multi)),false,'Multi-image icons keep Original first-image semantics');
});

test('opening metrics keep EXIF-oriented source bounds aligned with the presentation',async()=>{
 const owner=createOpeningImagePreview({file:file(jpeg(200,120,{orientation:6})),document:dom(),imageDecoderClass:null,imageBitmapFactory:async()=>bitmap(120,200)});assert.equal(await owner.ready,true);assert.equal(owner.snapshot().width,120);assert.equal(owner.snapshot().height,200);assert.equal(owner.snapshot().sourceWidth,120);assert.equal(owner.snapshot().sourceHeight,200);await owner.dispose();
});

test('an opening raster stays owned until display and loupe borrowers acknowledge retirement',async()=>{
 const document=dom(),owner=createOpeningImagePreview({file:file(text('managed')),document,imageDecoderClass:null,imageBitmapFactory:null,decodePreview:async()=>({pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)},sourceWidth:10000,sourceHeight:8000})});owner.attach({append(){}});assert.equal(await owner.ready,true);const surface=owner.presentation(),loupe=surface.fork(),frame=document.elements.find(e=>e.put);assert.equal(surface.width,10000);assert.equal(surface.height,8000);await assert.rejects(surface.readPixels(),{code:'PREVIEW_NOT_EXPORTABLE'});let done=false;const retiring=owner.dispose().then(()=>done=true);assert.equal(owner.snapshot().disposed,true);assert.equal(owner.presentation(),null);assert.equal(frame.width,2);surface.close();await Promise.resolve();assert.equal(done,false);loupe.close();await retiring;assert.equal(frame.width,0);assert.equal(owner.snapshot().ownedRasterBytes,0);
});
