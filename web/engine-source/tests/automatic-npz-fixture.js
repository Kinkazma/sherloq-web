import {automaticSnapshotArray as array} from '../src/automatic-npz-stream.js';
export function automaticNpzFixture(reference) {
 const types={bool:Uint8Array,uint8:Uint8Array,int8:Int8Array,uint16:Uint16Array,int16:Int16Array,uint32:Uint32Array,int32:Int32Array,uint64:BigUint64Array,int64:BigInt64Array,float32:Float32Array,float64:Float64Array},results={},raw={};
 for(const [name,shape]of Object.entries(reference.shapes)){const Type=types[name],data=Type.from({length:shape.reduce((a,b)=>a*b,1)},(_,i)=>name==='bool'?Number(i%3===0):name==='uint64'?BigInt(i)+(1n<<63n):name==='int64'?BigInt(i)-(1n<<62n):name.startsWith('float')?(i%101-50)/8:name.startsWith('uint')?i%127:i%127-63);raw[name]=data;results[name]=array(data,{shape,descr:name==='bool'?'|b1':undefined});}
 const snapshot={version:1,method:'complete_automatic_analysis',configuration:{regions:[[[0,0],[11,0],[11,7],[0,7]]],d2_minimum:500},results,ela_profile:{empty:array(new Float32Array(0),{shape:[0,3]}),scalar:array(new Float64Array([2.5]),{shape:[]})},states:{ELA:'done'},errors:{},biomes:[],display:{source:null,maximum_length_px:Infinity,negative_zero:-0,large_integer:9007199254740997n,nan:NaN,negative_infinity:-Infinity},image_shape:[257,257,3],decoded_bgr8_sha256:'fixture','énergie 🧪':array(new Int16Array([1,2,3]),{shape:[3]})};
 return {snapshot,raw};
}
export function unpackScientificNpz(bytes) {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),arrays={};let at=0;
 while(v.getUint32(at,true)===0x04034b50){const size=v.getUint32(at+18,true),nameSize=v.getUint16(at+26,true),name=decoder.decode(bytes.subarray(at+30,at+30+nameSize)).slice(0,-4),start=at+30+nameSize,headerSize=v.getUint16(start+8,true),header=decoder.decode(bytes.subarray(start+10,start+10+headerSize)),dtype=/'descr': '([^']+)'/.exec(header)[1],shape=/\'shape\': \(([^)]*)\)/.exec(header)[1].split(',').filter(x=>x.trim()).map(Number),data=bytes.slice(start+10+headerSize,start+size);
  let text;if(dtype.startsWith('<U')){text='';const dv=new DataView(data.buffer);for(let i=0;i<data.length;i+=4)text+=String.fromCodePoint(dv.getUint32(i,true));}
  arrays[name]={dtype,shape,data,text};at=start+size;
 }
 return arrays;
}
