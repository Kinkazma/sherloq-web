import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
const LIMIT=0xffffffff;
// ZIP64 only where required (or requested for qualification). Small archives
// retain the existing ZIP32 byte layout, including timestamps and UTF-8 flags.
export function scientificZipPlan(entries,{zip64=false}={}){
 requireValue(typeof zip64==='boolean','ZIP64 override must be boolean.');let at=0;
 for(const e of entries){requireValue(e.name instanceof Uint8Array&&e.name.length<=65535&&Number.isSafeInteger(e.size)&&e.size>=0,'Invalid ZIP entry.');e.offset=at;e.zipSize=zip64||e.size>=LIMIT;e.zipOffset=zip64||at>=LIMIT;e.localExtra=e.zipSize?20:0;e.centralExtra=e.zipSize||e.zipOffset?4+(e.zipSize?16:0)+(e.zipOffset?8:0):0;at+=30+e.name.length+e.localExtra+e.size;requireValue(Number.isSafeInteger(at),'ZIP offset exceeds safe integer range.');}
 const central=at;for(const e of entries)at+=46+e.name.length+e.centralExtra;
 const centralBytes=at-central,use64=zip64||entries.length>=65535||central>=LIMIT||centralBytes>=LIMIT||entries.some(e=>e.zipSize||e.zipOffset),endOffset=at,capacity=at+22+(use64?76:0);
 requireValue(Number.isSafeInteger(capacity),'ZIP capacity exceeds safe integer range.');return {central,centralBytes,endOffset,capacity,zip64:use64,count:entries.length};
}
export function scientificZipLocal(e){
 const bytes=new Uint8Array(30+e.name.length+e.localExtra),v=new DataView(bytes.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,e.zipSize?45:20,true);if(e.name.some(b=>b>=128))v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(18,e.zipSize?LIMIT:e.size,true);v.setUint32(22,e.zipSize?LIMIT:e.size,true);v.setUint16(26,e.name.length,true);v.setUint16(28,e.localExtra,true);bytes.set(e.name,30);
 if(e.zipSize){const at=30+e.name.length;v.setUint16(at,1,true);v.setUint16(at+2,16,true);v.setBigUint64(at+4,BigInt(e.size),true);v.setBigUint64(at+12,BigInt(e.size),true);}return bytes;
}
export function scientificZipCentral(e){
 const bytes=new Uint8Array(46+e.name.length+e.centralExtra),v=new DataView(bytes.buffer),version=e.zipSize||e.zipOffset?45:20;v.setUint32(0,0x02014b50,true);v.setUint16(4,version,true);v.setUint16(6,version,true);if(e.name.some(b=>b>=128))v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.zipSize?LIMIT:e.size,true);v.setUint32(24,e.zipSize?LIMIT:e.size,true);v.setUint16(28,e.name.length,true);v.setUint16(30,e.centralExtra,true);v.setUint32(42,e.zipOffset?LIMIT:e.offset,true);bytes.set(e.name,46);
 if(e.centralExtra){let at=46+e.name.length;v.setUint16(at,1,true);v.setUint16(at+2,e.centralExtra-4,true);at+=4;if(e.zipSize){v.setBigUint64(at,BigInt(e.size),true);v.setBigUint64(at+8,BigInt(e.size),true);at+=16;}if(e.zipOffset)v.setBigUint64(at,BigInt(e.offset),true);}return bytes;
}
export function scientificZipEnd(plan){
 const bytes=new Uint8Array(plan.zip64?98:22),v=new DataView(bytes.buffer);let at=0;
 if(plan.zip64){v.setUint32(0,0x06064b50,true);v.setBigUint64(4,44n,true);v.setUint16(12,45,true);v.setUint16(14,45,true);v.setBigUint64(24,BigInt(plan.count),true);v.setBigUint64(32,BigInt(plan.count),true);v.setBigUint64(40,BigInt(plan.centralBytes),true);v.setBigUint64(48,BigInt(plan.central),true);v.setUint32(56,0x07064b50,true);v.setBigUint64(64,BigInt(plan.endOffset),true);v.setUint32(72,1,true);at=76;}
 v.setUint32(at,0x06054b50,true);v.setUint16(at+8,plan.zip64?65535:plan.count,true);v.setUint16(at+10,plan.zip64?65535:plan.count,true);v.setUint32(at+12,plan.zip64?LIMIT:plan.centralBytes,true);v.setUint32(at+16,plan.zip64?LIMIT:plan.central,true);return bytes;
}
