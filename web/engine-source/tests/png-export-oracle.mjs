// Independent PNG framing, CRC, deflate and row-filter oracle for lossless exports.
import assert from 'node:assert/strict';import {inflateSync,crc32} from 'node:zlib';
export function decodeExportPng(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[],idat=[];let at=8,width,height,channels;
 while(at<bytes.length){const n=view.getUint32(at),type=new TextDecoder().decode(bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,at+8+n);assert.equal(view.getUint32(at+8+n),crc32(bytes.subarray(at+4,at+8+n)));chunks.push(type);if(type==='IHDR'){width=view.getUint32(at+8);height=view.getUint32(at+12);assert.equal(data[8],8);channels=data[9]===2?3:data[9]===0?1:0;assert.ok(channels);assert.equal(data[12],0);}if(type==='IDAT')idat.push(data);at+=12+n;if(type==='IEND')break;}
 assert.equal(at,bytes.length);assert.ok(chunks.every(t=>['IHDR','IDAT','IEND'].includes(t)),'Unexpected metadata');const filtered=inflateSync(Buffer.concat(idat)),stride=width*channels,data=new Uint8Array(height*stride);assert.equal(filtered.length,(stride+1)*height);let p=0;
 const paeth=(a,b,c)=>{const v=a+b-c,aa=Math.abs(v-a),bb=Math.abs(v-b),cc=Math.abs(v-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<height;y++){const filter=filtered[p++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const index=y*stride+x,a=x>=channels?data[index-channels]:0,b=y?data[index-stride]:0,c=y&&x>=channels?data[index-stride-channels]:0;data[index]=(filtered[p++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])%256;}}
 return {width,height,channels,data};
}
