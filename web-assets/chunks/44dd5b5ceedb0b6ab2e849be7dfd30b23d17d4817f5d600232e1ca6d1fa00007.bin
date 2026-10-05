import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
// ISO/IEC 23008-12 image grid. Each hvc1 cell is encoded independently so the
// x265 workspace can be reused, while the primary image retains its exact size.
const utf8=new TextEncoder(),text=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
const join=parts=>{const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;};
const number=(v,n)=>{requireValue(Number.isSafeInteger(v)&&v>=0&&v<2**(8*n),'HEIF integer overflow.');const b=new Uint8Array(n);for(let i=n-1;i>=0;i--){b[i]=v%256;v=Math.floor(v/256);}return b;};
const u16=v=>number(v,2),u32=v=>number(v,4),box=(type,...parts)=>{const payload=join(parts);return join([u32(payload.length+8),utf8.encode(type),payload]);};
const full=(type,version,flags,...parts)=>box(type,new Uint8Array([version,flags>>16&255,flags>>8&255,flags&255]),...parts);
function read(b,at,n){requireValue(at>=0&&at+n<=b.length&&n<=8,'Truncated HEIF integer.');let value=0;for(let i=0;i<n;i++)value=value*256+b[at+i];requireValue(Number.isSafeInteger(value),'HEIF offset exceeds safe integer range.');return value;}
function boxes(b,start=0,end=b.length){const out=[];for(let at=start;at<end;){requireValue(at+8<=end,'Truncated HEIF box.');let size=read(b,at,4),header=8;if(size===1){size=read(b,at+8,8);header=16;}if(!size)size=end-at;requireValue(size>=header&&at+size<=end,'Invalid HEIF box size.');out.push({type:text(b,at+4,4),at,body:at+header,end:at+size});at+=size;}return out;}
export function heicCell(encoded){
 const find=(items,type)=>{const item=items.find(x=>x.type===type);requireValue(item,'Missing HEIF '+type);return item;},top=boxes(encoded),meta=find(top,'meta'),children=boxes(encoded,meta.body+4,meta.end),pitm=find(children,'pitm'),primary=read(encoded,pitm.body+4,encoded[pitm.body]?4:2),iloc=find(children,'iloc');
 let p=iloc.body,version=encoded[p];p+=4;const sizes=encoded[p++],offsetBytes=sizes>>4,lengthBytes=sizes&15,second=encoded[p++],baseBytes=second>>4,indexBytes=version?second&15:0,count=read(encoded,p,version<2?2:4);p+=version<2?2:4;let payload;
 for(let i=0;i<count;i++){
  const id=read(encoded,p,version<2?2:4);p+=version<2?2:4;const method=version?read(encoded,p,2)&15:0;if(version)p+=2;const reference=read(encoded,p,2);p+=2;const base=read(encoded,p,baseBytes);p+=baseBytes;const extents=read(encoded,p,2);p+=2;const parts=[];
  for(let j=0;j<extents;j++){p+=indexBytes;const offset=read(encoded,p,offsetBytes);p+=offsetBytes;const length=read(encoded,p,lengthBytes);p+=lengthBytes;if(id===primary){requireValue(method===0&&reference===0&&base+offset+length<=encoded.length,'Unsupported HEIC cell extent.');parts.push(encoded.subarray(base+offset,base+offset+length));}}
  if(id===primary)payload=join(parts);
 }
 requireValue(payload?.length,'Missing primary HEVC cell payload.');
 const iprp=find(children,'iprp'),properties=boxes(encoded,iprp.body,iprp.end),ipco=find(properties,'ipco'),all=boxes(encoded,ipco.body,ipco.end),ipma=find(properties,'ipma');p=ipma.body;const v=encoded[p],flags=read(encoded,p+1,3);p+=4;const entries=read(encoded,p,4);p+=4;const selected=[];
 for(let i=0;i<entries;i++){const id=read(encoded,p,v?4:2);p+=v?4:2;const n=encoded[p++];for(let j=0;j<n;j++){const association=read(encoded,p,flags&1?2:1);p+=flags&1?2:1;const prop=all[(association&(flags&1?32767:127))-1];if(id===primary&&prop&&['hvcC','ispe','clap','pixi','colr'].includes(prop.type))selected.push({type:prop.type,essential:!!(association&(flags&1?32768:128)),bytes:encoded.slice(prop.at,prop.end)});}}
 requireValue(selected.some(x=>x.type==='hvcC'),'Missing HEVC configuration.');return{payload,properties:selected};
}
export function heicGrid(cells,{width,height,columns,rows}){
 requireValue(cells.length===columns*rows&&columns<=256&&rows<=256&&cells.length<65534,'Invalid HEIC grid.');
 const gridId=cells.length+1,wide=width>65535||height>65535,grid=new Uint8Array([0,wide?1:0,rows-1,columns-1]),gridPayload=join([grid,number(width,wide?4:2),number(height,wide?4:2)]),properties=[],associations=[];
 function property(value){let index=properties.findIndex(x=>x.length===value.length&&x.every((v,i)=>v===value[i]));if(index<0){index=properties.length;properties.push(value);}return index+1;}
 for(const cell of cells)associations.push(cell.properties.map(p=>(p.essential?32768:0)|property(p.bytes)));
 const display=[property(full('ispe',0,0,u32(width),u32(height)))];for(const p of cells[0].properties)if(['pixi','colr'].includes(p.type))display.push((p.essential?32768:0)|property(p.bytes));associations.push(display);
 const ftyp=box('ftyp',utf8.encode('heic'),u32(0),utf8.encode('mif1heic')),
 hdlr=full('hdlr',0,0,u32(0),utf8.encode('pict'),new Uint8Array(12),new Uint8Array([0])),
 pitm=full('pitm',0,0,u16(gridId)),
 iinf=full('iinf',0,0,u16(gridId),...associations.map((_,i)=>full('infe',2,i===cells.length?0:1,u16(i+1),u16(0),utf8.encode(i===cells.length?'grid':'hvc1'),new Uint8Array([0])))),
 iprp=box('iprp',box('ipco',...properties),full('ipma',0,1,u32(gridId),...associations.map((p,i)=>join([u16(i+1),new Uint8Array([p.length]),...p.map(u16)])))),
 iref=full('iref',0,0,box('dimg',u16(gridId),u16(cells.length),...cells.map((_,i)=>u16(i+1))));
 const payloads=[...cells.map(c=>c.payload),gridPayload];
 const metadata=offset=>{let at=offset;const extents=payloads.map((p,i)=>{const entry=join([u16(i+1),u16(0),u16(1),u32(at),u32(p.length)]);at+=p.length;return entry;});return full('meta',0,0,hdlr,pitm,full('iloc',0,0,new Uint8Array([0x44,0]),u16(gridId),...extents),iinf,iprp,iref);};
 const meta=metadata(ftyp.length+metadata(0).length+8),length=payloads.reduce((n,p)=>n+p.length,0),parts=[ftyp,meta,u32(length+8),utf8.encode('mdat'),...payloads];return{parts,byteLength:parts.reduce((n,p)=>n+p.length,0)};
}
