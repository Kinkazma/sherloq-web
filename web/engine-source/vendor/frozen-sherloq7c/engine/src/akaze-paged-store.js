import {createSegmentedBytes} from './segmented-bytes.js';
import {requireValue,checkAbort} from './errors.js';
// Global logical raster, tile-major physical storage. Native windows keep their
// global coordinates; storing a useful core costs one I/O, not one per scanline.
export async function createAkazeField(width,height,Type,{coreSize,signal,...options}){
 const b=Type.BYTES_PER_ELEMENT;let raw=await createSegmentedBytes(width*height*b,{...options,signal});const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
 const visit=async(x,y,w,h,fn)=>{for(let ty=Math.floor(y/coreSize)*coreSize;ty<y+h;ty+=coreSize){const bh=Math.min(coreSize,height-ty),yy=Math.max(y,ty),hh=Math.min(y+h,ty+bh)-yy;for(let tx=Math.floor(x/coreSize)*coreSize;tx<x+w;tx+=coreSize){checkAbort(signal);const tw=Math.min(coreSize,width-tx),xx=Math.max(x,tx),ww=Math.min(x+w,tx+tw)-xx,at=(ty*width+tx*bh+(yy-ty)*tw)*b;await fn({tx,tw,xx,yy,ww,hh,at});}}};
 return {get storage(){return raw.storage;},byteLength:raw.byteLength,
  async spill(){if(raw.storage!=='memory')return false;const target=await createSegmentedBytes(raw.byteLength,{...options,storage:'temporary',signal});try{const block=new Uint8Array(Math.min(4*1024**2,raw.byteLength));for(let offset=0;offset<raw.byteLength;offset+=block.length){checkAbort(signal);const part=block.subarray(0,Math.min(block.length,raw.byteLength-offset));await raw.readInto(part,offset);await target.write(part,offset);}await raw.dispose();raw=target;return true;}catch(error){await target.dispose();throw error;}},
  async readWindow(x,y,w,h){const output=new Type(w*h);await visit(x,y,w,h,async t=>{const buffer=new Type(t.tw*t.hh);try{await raw.readInto(bytes(buffer),t.at);}catch(error){error.message+=' AKAZE field '+width+'x'+height+'x'+b+' bytes, physical offset '+t.at+', read '+buffer.byteLength;throw error;}for(let i=0;i<t.hh;i++)output.set(buffer.subarray(i*t.tw+t.xx-t.tx,i*t.tw+t.xx-t.tx+t.ww),(t.yy-y+i)*w+t.xx-x);});return output;},
  async writeWindow(x,y,w,h,data){requireValue(data instanceof Type&&data.length===w*h,'AKAZE field type/shape');await visit(x,y,w,h,async t=>{const buffer=new Type(t.tw*t.hh);if(t.ww!==t.tw)await raw.readInto(bytes(buffer),t.at);for(let i=0;i<t.hh;i++)buffer.set(data.subarray((t.yy-y+i)*w+t.xx-x,(t.yy-y+i)*w+t.xx-x+t.ww),i*t.tw+t.xx-t.tx);await raw.write(bytes(buffer),t.at);});},
  async write(data,offset=0){requireValue(data instanceof Uint8Array&&offset%(width*b)===0&&data.length%(width*b)===0&&data.byteOffset%b===0,'AKAZE whole-row field write');return this.writeWindow(0,offset/(width*b),width,data.length/(width*b),new Type(data.buffer,data.byteOffset,data.length/b));},
  flush:()=>raw.flush(),dispose:()=>raw.dispose()
 };
}
