import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {estimateElaClassicAuto,matchJpegQuantizationTables,quantizationLogNfa,calibrateElaClassicDisplay} from '../sherloq-browser/assets/ela-auto-estimate.js';
import {jpegHeader} from '../../engine-source/src/image-headers.js';
import {initJpegWasm,jpegCodec} from '../../engine-source/src/jpeg.js';
import {elaRender} from '../../engine-source/src/ela.js';

// Generated8×8RGBJPEG with an actual encoder at Q75, no external image data.
const JPEG75=Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDh9P0rp8tFFFepBKxpg8RU9ktT/9k=','base64'));
const sha=data=>createHash('sha256').update(data).digest('hex');
function noise(width=512,height=512,seed=7813){const data=new Uint8Array(width*height*3);for(let i=0;i<data.length;i+=3){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const v=seed&255;data[i]=data[i+1]=data[i+2]=v;}return{width,height,format:'rgb8',data};}
function caller(pixels,{scope,header,onRead}={}){
 const audit={live:0,peak:0,reads:[],releases:0},sourceSha256=sha(pixels.data);
 const input={width:pixels.width,height:pixels.height,sourceSha256,header,scope,readRect:async(rect,{signal}={})=>{signal?.throwIfAborted();audit.reads.push(rect);onRead?.(rect);const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(pixels.data.subarray(((y+rect.y)*pixels.width+rect.x)*3,((y+rect.y)*pixels.width+rect.x+rect.width)*3),y*rect.width*3);return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){audit.releases++;}};}};
 const options={reserveMemory(bytes){assert.ok(bytes<=16*1024**2);audit.live+=bytes;audit.peak=Math.max(audit.peak,audit.live);let released=false;return()=>{assert.equal(released,false);released=true;audit.live-=bytes;};}};
 return{input,options,audit};
}

test('current-file DQT75 resolves exactly without pixels, preserves all component tables, and never labels custom tables a known quality',async()=>{
 const header={format:'jpeg',...jpegHeader(JPEG75)},before=structuredClone(header),result=await estimateElaClassicAuto({width:8,height:8,sourceSha256:sha(JPEG75),header,readRect(){throw Error('DQT must not read pixels');}});
 assert.equal(result.quality,75);assert.equal(result.evidence.status,'exact-IJG-table');assert.deepEqual(result.evidence.candidateQualities,[75]);assert.equal(result.evidence.deviation,0);assert.deepEqual(header,before);
 const custom=structuredClone(header);custom.quantization[0][1]+=1;const c=matchJpegQuantizationTables(custom);assert.equal(c.quality,null);assert.equal(c.status,'nonstandard-table');assert.equal(c.referenceQuality,75);assert.ok(c.deviation>0);assert.match(c.referenceMeaning,/not a recovered/);
 const multi=structuredClone(header);multi.quantization[1][0]+=3;assert.equal(matchJpegQuantizationTables(multi).quality,null);const invalid=structuredClone(header);delete invalid.quantization[0];assert.throws(()=>matchJpegQuantizationTables(invalid),{code:'INVALID_INPUT'});
});
test('a-contrario tail bounds obey analytic Uniform sums, the published multiplicity term, lack of support and exact limiting cases',()=>{
 const tests=64*63*255;let factorial=1;for(let n=1;n<=12;n++){factorial*=n;for(const sum of [.05,.1,.2]){const exact=sum**n/factorial,upper=10**(quantizationLogNfa(n,sum,{tests})-Math.log10(tests));assert.ok(upper>=exact*(1-1e-12));assert.ok(upper<=1);}}
 assert.equal(quantizationLogNfa(0,0),Infinity);assert.equal(quantizationLogNfa(100,0),-Infinity);assert.equal(quantizationLogNfa(100,50),Math.log10(tests));assert.ok(Math.abs(quantizationLogNfa(100,25)-(-12.163580172778715))<1e-12);assert.equal(quantizationLogNfa(100,50,{tests:tests*2}),Math.log10(tests*2));assert.throws(()=>quantizationLogNfa(10,11),{code:'INVALID_INPUT'});
});
await initJpegWasm({wasmBinary:await readFile(new URL('../../engine-source/vendor/libjpeg/jpeg.wasm',import.meta.url))});
const original=noise(),decoded75=await jpegCodec.recompress(original,75);
test('real native JPEG75 decoded pixels without file metadata yield a qualified IJG-compatible candidate, native phase and bounded workspace',async()=>{
 const before=sha(decoded75.data),h=caller(decoded75),r=await estimateElaClassicAuto(h.input,h.options);assert.equal(r.quality,75);assert.equal(r.evidence.status,'IJG-compatible-statistical-trace');assert.deepEqual(r.evidence.gridPhase,{x:0,y:0});assert.equal(r.evidence.sampledBlocks,1024);assert.equal(r.evidence.meaningfulCoefficients,63);assert.deepEqual(r.evidence.candidateQualities,[75]);assert.ok(r.evidence.records.every(e=>e.samples>=32&&e.logNfa<0));assert.equal(r.evidence.policy.phasesTested,64);assert.equal(r.evidence.policy.sampleDomainsTested,2);assert.equal(h.audit.live,0);assert.equal(h.audit.reads.length,h.audit.releases);assert.ok(h.audit.reads.every(r=>r.width<=71&&r.height<=71));assert.equal(sha(decoded75.data),before);assert.equal(r.probability,false);assert.equal(r.forgeryVerdict,null);
});
test('cropping native JPEG pixels changes the discovered phase while preserving the compatible quality instead of resetting to a false aligned grid',async()=>{
 const left=3,top=5,width=decoded75.width-left,height=decoded75.height-top,data=new Uint8Array(width*height*3);for(let y=0;y<height;y++)data.set(decoded75.data.subarray(((y+top)*decoded75.width+left)*3,((y+top)*decoded75.width+left+width)*3),y*width*3);
 const h=caller({width,height,format:'rgb8',data}),r=await estimateElaClassicAuto(h.input,h.options);assert.equal(r.quality,75);assert.deepEqual(r.evidence.gridPhase,{x:5,y:3});assert.equal(h.audit.live,0);for(const [x,y]of r.evidence.nativeBlockCoordinates){assert.equal(x%8,5);assert.equal(y%8,3);assert.ok(x+8<=width&&y+8<=height);}
});
test('different JPEG histories and double compression cannot be converted into a falsely exact source quality',async()=>{
 const decoded90=await jpegCodec.recompress(original,90),twice=await jpegCodec.recompress(decoded75,90),mixed={...decoded75,data:decoded75.data.slice()};for(let y=0;y<mixed.height;y++)mixed.data.set(decoded90.data.subarray((y*mixed.width+mixed.width/2)*3,(y*mixed.width+mixed.width)*3),(y*mixed.width+mixed.width/2)*3);
 for(const pixels of [twice,mixed]){const h=caller(pixels),r=await estimateElaClassicAuto(h.input,h.options);assert.equal(r.quality,null);assert.equal(r.evidence.status,'non-IJG-or-inconsistent-trace');assert.ok(r.evidence.meaningfulCoefficients>0);assert.deepEqual(r.evidence.candidateQualities,[]);assert.match(r.evidence.qualityMeaning,/not proof/);assert.equal(h.audit.live,0);}
});
test('flat and never-JPEG random native pixels abstain instead of returning a conventional quality or a fabricated confidence',async()=>{
 for(const pixels of [{width:160,height:160,format:'rgb8',data:new Uint8Array(160*160*3).fill(100)},original]){const h=caller(pixels),r=await estimateElaClassicAuto(h.input,h.options);assert.equal(r.quality,null);assert.equal(r.calibrationRequired,false);assert.equal(r.evidence.status,'no-meaningful-quantization-trace');assert.equal(h.audit.live,0);}
 const tiny=await estimateElaClassicAuto({width:7,height:5,sourceSha256:'a'.repeat(64)});assert.equal(tiny.quality,null);assert.equal(tiny.evidence.status,'insufficient-native-blocks');
});
test('source-bound scopes exclude entire native blocks, including thin polygons; an empty acquisition scope abstains without falling back to the image',async()=>{
 const sha256=sha(decoded75.data),rect={x0:0,y0:0,x1:512,y1:512},hole=[[180.1,0],[180.2,0],[180.2,512],[180.1,512]],scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width:512,height:512,sourceSha256:sha256,fingerprint:'thin-hole',regions:[rect],excluded:[hole]},h=caller(decoded75,{scope}),r=await estimateElaClassicAuto(h.input,h.options);assert.equal(r.quality,75);assert.equal(r.evidence.policy.scopeFingerprint,'thin-hole');assert.ok(r.evidence.excludedBlocks>0);assert.ok(r.evidence.nativeBlockCoordinates.every(([x])=>x+8<180.1||x>180.2));assert.equal(h.audit.live,0);
 const empty=caller(decoded75,{scope:{...scope,fingerprint:'empty',regions:[],excluded:[]}}),e=await estimateElaClassicAuto(empty.input,empty.options);assert.equal(e.quality,null);assert.equal(e.evidence.status,'no-meaningful-quantization-trace');assert.equal(empty.audit.live,0);await assert.rejects(estimateElaClassicAuto({...h.input,sourceSha256:'b'.repeat(64)},h.options),{code:'INVALID_INPUT'});
});
test('cancellation, invalid windows and rejected admission restore all resource owners and cannot become successful estimates',async()=>{
 const c=new AbortController(),h=caller(decoded75,{onRead(){c.abort();}});await assert.rejects(estimateElaClassicAuto(h.input,{...h.options,signal:c.signal}),{code:'CANCELLED'});assert.equal(h.audit.live,0);assert.equal(h.audit.releases,1);
 const bad=caller(decoded75);bad.input.readRect=async r=>({width:r.width-1,height:r.height,format:'rgb8',data:new Uint8Array(1)});await assert.rejects(estimateElaClassicAuto(bad.input,bad.options),{code:'INVALID_INPUT'});assert.equal(bad.audit.live,0);const denied=caller(decoded75);await assert.rejects(estimateElaClassicAuto(denied.input,{reserveMemory(){throw new Error('admission refused');}}),/admission refused/);assert.equal(denied.audit.reads.length,0);
});
test('visibility calibration preserves selected Q/linear/grayscale, changes only display controls and agrees with exact native linear residual rendering',async()=>{
 const residual={width:100,height:1,format:'rgb8',data:new Uint8Array(300)};for(let i=0;i<300;i++)residual.data[i]=i<297?3:12;const before=residual.data.slice(),p={quality:75,linear:true,grayscale:false,scale:50,contrast:20},r=calibrateElaClassicDisplay(residual,p);assert.equal(r.params.quality,75);assert.equal(r.params.scale,18);assert.equal(r.params.contrast,0);assert.equal(r.rawQuantile,12);assert.equal(r.qualityEstimated,false);assert.deepEqual(residual.data,before);const rendered=await elaRender(residual.data,r.params);assert.equal(rendered.at(-1),216);assert.equal(r.estimatedSaturationFraction,0);
 const gray=calibrateElaClassicDisplay(residual,{...p,linear:false,grayscale:true});assert.equal(gray.params.linear,false);assert.equal(gray.params.grayscale,true);assert.match(gray.nonlinearQualification,/estimate/);assert.match(gray.grayscaleQualification,/Channel-based/);const flat=calibrateElaClassicDisplay({...residual,data:new Uint8Array(300)},p);assert.equal(flat.status,'no-calibratable-residual');assert.deepEqual(flat.params,{quality:75,linear:true,grayscale:false,scale:50,contrast:20});assert.throws(()=>calibrateElaClassicDisplay({...residual,width:321},p),{code:'INVALID_INPUT'});
});
