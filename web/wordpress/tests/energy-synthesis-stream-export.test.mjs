import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {energyExportChunks} from '../sherloq-browser/assets/streaming-export.js';
import {ENERGY_CONTEXT_LAYOUT,energyContextFieldNames} from '../sherloq-browser/assets/energy-context-selection.js';

const decode=new TextDecoder(),MiB=1024**2;
function fixture({synthesis=false,width=2,height=2}={}){
 const n=width*height,count=synthesis?1:3;
 return{operation:'ela.energy',status:'ok',id:'energy',provenance:{originalSha256:'a'.repeat(64),params:{quality:synthesis?0:75}},...(synthesis?{synthesis:{key:'neutral'}}:{}),data:{width,height,energy_planes:Float32Array.from({length:count*n},(_,i)=>(i+1)/10),energy_low_score:Float32Array.from({length:n},(_,i)=>i/4),energy_high_score:Float32Array.from({length:n},(_,i)=>(n-i)/4),energy_scope:new Int32Array(n).fill(1),energy_labels:Int32Array.from({length:n},(_,i)=>i%2),...(synthesis?{energyPlaneCount:1}:{}),metadata:{quality:synthesis?null:75,...(synthesis?{method:'ela_energy_synthesis'}:{}),energy:{quantiles:[.01,.99],thresholds:[5,5],...(synthesis?{planeCount:1,quality_confirmation:'median-already-aggregated'}:{})}}}};
}
async function collect(result,format='npz',hooks){const chunks=[];for await(const chunk of energyExportChunks(result,format,hooks))chunks.push(chunk.slice());return{chunks,bytes:new Uint8Array(Buffer.concat(chunks))};}
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;}return(value^0xffffffff)>>>0;}
// Independent ZIP64/NPY reader. Verify each local payload CRC and descriptor,
// and compare the declared array size with its actual typed bytes.
function unpack(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=new Map();let at=0;
 while(v.getUint32(at,true)===0x04034b50){assert.equal(v.getUint16(at+6,true),8);const nameLength=v.getUint16(at+26,true),extraLength=v.getUint16(at+28,true),name=decode.decode(bytes.subarray(at+30,at+30+nameLength)),extra=at+30+nameLength;assert.equal(v.getUint16(extra,true),1);const size=Number(v.getBigUint64(extra+4,true));assert.equal(v.getBigUint64(extra+12,true),BigInt(size));const start=extra+extraLength,payload=bytes.subarray(start,start+size),descriptor=start+size;assert.equal(v.getUint32(descriptor,true),0x08074b50);assert.equal(v.getUint32(descriptor+4,true),crc(payload));assert.equal(v.getBigUint64(descriptor+8,true),BigInt(size));assert.equal(v.getBigUint64(descriptor+16,true),BigInt(size));assert(!entries.has(name));const headerLength=new DataView(payload.buffer,payload.byteOffset,payload.byteLength).getUint16(8,true),header=decode.decode(payload.subarray(10,10+headerLength)),data=payload.slice(10+headerLength);assert.deepEqual([...payload.subarray(0,8)],[147,78,85,77,80,89,1,0]);entries.set(name,{header,data});at=descriptor+24;
 }
 assert.equal(v.getUint32(at,true),0x02014b50);return entries;
}
const jsonEntry=entry=>JSON.parse(String.fromCodePoint(...new Uint32Array(entry.data.buffer,entry.data.byteOffset,entry.data.byteLength/4)));

for(const synthesis of[false,true])test(`${synthesis?'Synthèse one':'normal three'} native planes export with exact NPZ shape, bytes, metadata and namespace`,async()=>{
 const result=fixture({synthesis}),before=structuredClone(result),archive=await collect(result),entries=unpack(archive.bytes),count=synthesis?1:3;
 assert.deepEqual([...entries.keys()],['energy_planes.npy','energy_low_score.npy','energy_high_score.npy','energy_scope.npy','energy_labels.npy','metadata_json.npy','browser_provenance_json.npy']);
 for(const key of['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']){const entry=entries.get(key+'.npy');assert(entry.header.includes("'shape': ("+(key==='energy_planes'?[count,2,2]:[2,2]).join(', ')+')'));assert.deepEqual(entry.data,new Uint8Array(result.data[key].buffer));}
 assert.deepEqual(jsonEntry(entries.get('metadata_json.npy')),result.data.metadata);assert.deepEqual(jsonEntry(entries.get('browser_provenance_json.npy')),result.provenance);assert.deepEqual(result,before);
 if(!synthesis)assert.equal(createHash('sha256').update(archive.bytes).digest('hex'),'7c34f25f523871d5afc6334b7bb2230ee071a715cd6ce96c7f6578a958d76625');
});

test('single-plane metadata alone is sufficient; conflicting, undeclared or padded planes never invent qualities',async()=>{
 const valid=fixture({synthesis:true});delete valid.data.energyPlaneCount;assert(unpack((await collect(valid)).bytes).get('energy_planes.npy').header.includes('(1, 2, 2)'));
 for(const change of[result=>{result.data.metadata.energy.planeCount=3;},result=>{delete result.synthesis;delete result.data.energyPlaneCount;result.data.metadata={};},result=>{result.data.energy_planes=new Float32Array(12);}]){const result=fixture({synthesis:true});change(result);let emitted=0;await assert.rejects(async()=>{for await(const _ of energyExportChunks(result,'npz'))emitted++;});assert.equal(emitted,0,'Refuse inconsistent declarations before the first partial archive chunk');}
});

test('large one-plane NPZ retains bounded chunks and its exact scientific payload',async()=>{
 const result=fixture({synthesis:true,width:513,height:513}),archive=await collect(result);assert(Math.max(...archive.chunks.map(c=>c.byteLength))<=MiB);const planes=unpack(archive.bytes).get('energy_planes.npy');assert(planes.header.includes('(1, 513, 513)'));assert.equal(planes.data.byteLength,513*513*4);assert.deepEqual(planes.data,new Uint8Array(result.data.energy_planes.buffer));
});

function contextFixture(synthesis){
 const result=fixture({synthesis}),meta=result.data.metadata,fingerprint='b'.repeat(64),names=energyContextFieldNames(result);Object.assign(result.provenance,{contextPlanFingerprint:fingerprint});Object.assign(result.data,{contextLayout:ENERGY_CONTEXT_LAYOUT,metadata:{...meta,contextLayout:ENERGY_CONTEXT_LAYOUT,contextPlanFingerprint:fingerprint},contexts:[{id:'context-A',bounds:[0,0,2,2],originalBounds:[0,0,2,2],width:2,height:2,jpegPhase:[0,0],evaluable:true,status:'analysed',nativeMetadata:meta,energy_summary:[],regions:[],regionColors:[],fieldKeys:Object.fromEntries(names.map(n=>[n,'context-A/'+n]))}]});result.planeSurfaces=Object.fromEntries(names.map(n=>['context-A/'+n,{id:'context-A/'+n,revision:2,width:2,height:2,format:['energy_scope','energy_labels'].includes(n)?'int32':'float32'}]));const reads=[],engine={async readPlane({surfaceId,revision,rect}){reads.push(surfaceId);assert.equal(revision,2);const name=surfaceId.split('/').at(-1),Type=['energy_scope','energy_labels'].includes(name)?Int32Array:Float32Array;return{plane:{width:rect.width,height:rect.height,data:new Type(rect.width*rect.height).fill(2)}};}};return{result,engine,reads,names};
}
for(const synthesis of[false,true])test(`${synthesis?'Synthèse':'normal'} native context JSON exports only its declared fields and unchanged context identity`,async()=>{
 const {result,engine,reads,names}=contextFixture(synthesis),archive=await collect(result,'json',{engine}),json=JSON.parse(decode.decode(archive.bytes));assert.equal(json.contextLayout,ENERGY_CONTEXT_LAYOUT);assert.equal(json.contexts[0].id,'context-A');assert.deepEqual(Object.keys(json.contexts[0].fields),names);for(const name of names)assert.deepEqual(json.contexts[0].fields[name],[2,2,2,2]);assert.equal(new Set(reads).size,synthesis?5:7);assert.throws(()=>energyExportChunks(result,'npz'),/retained Core scientific export/,'Context NPZ remains routed to the retained native Core exporter');
});
