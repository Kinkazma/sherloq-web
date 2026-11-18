// Encode RGB8 in bounded scanline batches; never allocate a full RGBA canvas.
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}
function crc(parts){let c=0xffffffff;for(const data of parts)for(const b of data)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function u32(value){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,value);return b;}
function chunk(type,data){const name=new TextEncoder().encode(type);return new Blob([u32(data.byteLength),name,data,u32(crc([name,data]))]);}
export async function exportRGBPNG(pixels,{signal,maxBytes=128*1024**2,onProgress=()=>{}}={}){
 if(typeof CompressionStream==='undefined')throw new Error('Streaming PNG export unavailable in this browser');
 const {width,height,data}=pixels;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>0x7fffffff||height>0x7fffffff||(data?data.byteLength!==width*height*3:typeof pixels.readPixels!=='function'))throw new Error('Invalid PNG dimensions');
 const header=new Uint8Array(13),dv=new DataView(header.buffer);dv.setUint32(0,width);dv.setUint32(4,height);header[8]=8;header[9]=2;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header)],stream=new CompressionStream('deflate'),writer=stream.writable.getWriter(),reader=stream.readable.getReader();let size=45,failure;
 const abortError=()=>Object.assign(new Error('PNG export cancelled'),{code:'CANCELLED'});
 const fail=error=>{failure??=error;void writer.abort(failure).catch(()=>{});void reader.cancel(failure).catch(()=>{});};
 const abort=()=>fail(abortError());signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const read=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength+12;if(size>maxBytes)throw Object.assign(new Error('PNG export exceeds its encoded-byte budget'),{code:'EXPORT_BUDGET'});parts.push(chunk('IDAT',value));}}catch(e){fail(e);}})();
 try{
  const rowBytes=width*3,batchLimit=262143,rowsPerBatch=Math.max(1,Math.floor(batchLimit/(rowBytes+1)));
  if(rowBytes+1>batchLimit){
   for(let y=0;y<height;y++){
    if(failure)throw failure;await writer.write(new Uint8Array([0]));
    for(let x=0;x<rowBytes;x+=batchLimit){if(failure)throw failure;if(signal?.aborted)throw abortError();const end=Math.min(rowBytes,x+batchLimit);const part=data?data.subarray(y*rowBytes+x,y*rowBytes+end):(await pixels.readPixels({x:x/3,y,width:(end-x)/3,height:1})).data;await writer.write(part);await new Promise(resolve=>setTimeout(resolve,0));}
    onProgress((y+1)/height);
   }
  }else for(let y=0;y<height;y+=rowsPerBatch){if(failure)throw failure;if(signal?.aborted)throw abortError();const rows=Math.min(rowsPerBatch,height-y),batch=new Uint8Array(rows*(rowBytes+1));const source=data?data.subarray(y*rowBytes,(y+rows)*rowBytes):(await pixels.readPixels({x:0,y,width,height:rows})).data;for(let r=0;r<rows;r++)batch.set(source.subarray(r*rowBytes,(r+1)*rowBytes),r*(rowBytes+1)+1);await writer.write(batch);onProgress((y+rows)/height);await new Promise(resolve=>setTimeout(resolve,0));}
  await writer.close();await read;if(failure)throw failure;parts.push(chunk('IEND',new Uint8Array()));return new Blob(parts,{type:'image/png'});
 }catch(e){fail(e);await read;throw failure;}finally{signal?.removeEventListener('abort',abort);}
}
