import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createFloatPlane} from './segmented-float-plane.js';
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};
export async function segmentedNoisesnifferStatistics(image,w,{budget,signal,onProgress,storage='auto',profile={},blockPixels=32768,reserveAfter=0}={}){
 const {width,height}=image.surface.descriptor,cols=width-w+1,rows=height-w+1;
 requireValue([3,5,7,8].includes(w)&&cols>0&&rows>0&&Number.isSafeInteger(cols*rows)&&cols*rows<=0xffffffff,'Invalid Noisesniffer dimensions.');
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=32768,'Invalid Noisesniffer strip size.');
 const room=budget.limit-budget.retained-budget.active,heap=Math.max(12*1024**2,noisesnifferStreamHeapBytes()),perPixel=96+8*w*w;
 const stripRows=Math.min(rows,Math.max(1,Math.floor(Math.min(blockPixels,(room-heap-8*1024**2)/perPixel)/width))),pixels=cols*stripRows,haloBytes=width*((w-1)*6+4),workspace=heap+haloBytes+pixels*perPixel;
 const fftWorkspace=w===8?heap+256*256*112:0;
 if(workspace>room||fftWorkspace>room)throw new EngineError('MEMORY_LIMIT','One complete Noisesniffer strip and its DCT footprint must fit.');
 const allowance=budget.reserve(Math.max(workspace,fftWorkspace,reserveAfter)),owned=[];
 const options={budget,signal,chunkBytes:Math.max(8192,blockPixels*8),temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,storage:storage==='auto'&&(image.session||image.ensureTemporarySession)&&37*cols*rows>room-Math.max(workspace,fftWorkspace,reserveAfter)?'temporary':storage};
 let pool,math,valid,means,variance,validCount=0;
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 try{
  valid=await createSegmentedBytes(cols*rows,options);owned.push(valid);means=await createFloatPlane(cols*3,rows,options);owned.push(means);variance=await createFloatPlane(cols,rows*3,{...options,ArrayType:Float32Array});owned.push(variance);
  math=await noisesnifferStreamMath();const extrema=[255,255,255,0,0,0];
  for(let y=0;y<height;y+=stripRows){await controlCheckpoint(signal);const part=await image.surface.readWindow({x:0,y,width,height:Math.min(stripRows,height-y)},{signal});try{for(let i=0;i<part.pixels.data.length;i++){const c=i%3,v=part.pixels.data[i];extrema[c]=Math.min(extrema[c],v);extrema[c+3]=Math.max(extrema[c+3],v);}}finally{part.release();}progress('noisesniffer-extrema',Math.min(height,y+stripRows),height);}
  pool=new WaveletStripPool(budget,{...profile,workerHeapBytes:12*1024**2+haloBytes,workerPixelBytes:perPixel,workerFactory:globalThis.Worker?()=>new Worker(new URL('./noisesniffer-strip-worker.js',import.meta.url),{type:'module'}):null});let done=0;
  await pool.run({count:Math.ceil(rows/stripRows),pixels,key:`noisesniffer/${w}/${width}/${stripRows}`,signal,prepareBytes:width*(stripRows+w)*3,
   prepare:async i=>{const y=i*stripRows,h=Math.min(stripRows,rows-y)+w-1,part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{return {op:'blocks',rgb:part.pixels.data,width,height:h,w,extrema};}finally{part.release();}},
   local:j=>math.blocks(j.rgb,j.width,j.height,j.w,j.extrema),
   consume:async(r,i)=>{checkAbort(signal);const y=i*stripRows,h=Math.min(stripRows,rows-y);await valid.write(r.valid,y*cols);for(const v of r.valid)validCount+=v;if(r.means)await means.write(r.means,0,y,cols*3,h,{signal});for(let c=0;c<3;c++)await variance.write(r.variance.subarray(c*h*cols,(c+1)*h*cols),0,c*rows+y,cols,h,{signal});done+=h;progress('noisesniffer-dct',done,rows);}
  });
  if(w===8){
   pool.workerHeapBytes=12*1024**2;pool.workerPixelBytes=112;
   const dw=math.optimal(Math.min(249,width)+7),dh=math.optimal(Math.min(249,height)+7),bw=Math.min(dw-7,width),bh=Math.min(dh-7,height),nx=Math.ceil(width/bw),ny=Math.ceil(height/bh);done=0;
   // Tile grid and FFT dimensions belong to the FULL image, including borders
   // outside the cropped valid means. Independent strip filter2D is not equal.
   await pool.run({count:nx*ny,pixels:256*256,key:`noisesniffer/mean8/${dw}/${dh}`,signal,prepareBytes:(256*256+256)*3,
    prepare:async i=>{const x=i%nx*bw,y=Math.floor(i/nx)*bh,tw=Math.min(bw,width-x),th=Math.min(bh,height-y),xs=Array.from({length:tw+7},(_,k)=>reflect(x+k-4,width)),ys=Array.from({length:th+7},(_,k)=>reflect(y+k-4,height)),left=Math.min(...xs),top=Math.min(...ys),rw=Math.max(...xs)-left+1,rh=Math.max(...ys)-top+1,part=await image.surface.readWindow({x:left,y:top,width:rw,height:rh},{signal});try{const rgb=new Uint8Array((tw+7)*(th+7)*3);for(let yy=0;yy<th+7;yy++)for(let xx=0;xx<tw+7;xx++){const at=((ys[yy]-top)*rw+xs[xx]-left)*3;rgb.set(part.pixels.data.subarray(at,at+3),(yy*(tw+7)+xx)*3);}return {op:'mean8',rgb,width:tw,height:th,dftWidth:dw,dftHeight:dh,blockHeight:bh};}finally{part.release();}},
    local:j=>math.mean8(j.rgb,j.width,j.height,j.dftWidth,j.dftHeight,j.blockHeight),
    consume:async(r,i)=>{checkAbort(signal);const x=i%nx*bw,y=Math.floor(i/nx)*bh,tw=Math.min(bw,width-x),th=Math.min(bh,height-y),left=Math.max(x,4),top=Math.max(y,4),right=Math.min(x+tw,cols+4),bottom=Math.min(y+th,rows+4);if(left<right&&top<bottom){const values=new Float64Array((right-left)*(bottom-top)*3);for(let yy=top;yy<bottom;yy++)values.set(r.means.subarray(((yy-y)*tw+left-x)*3,((yy-y)*tw+right-x)*3),(yy-top)*(right-left)*3);await means.write(values,(left-4)*3,top-4,(right-left)*3,bottom-top,{signal});}progress('noisesniffer-means-fft',++done,nx*ny);}
   });
  }
  let disposed=false;return {width:cols,height:rows,blockSize:w,validCount,valid,means,variance,extrema,metrics:{...pool.metrics(),stripRows},async dispose(){if(disposed)return;disposed=true;await Promise.all(owned.map(x=>x.dispose()));}};
 }catch(error){await Promise.allSettled(owned.map(x=>x.dispose()));throw error;}finally{pool?.clear();allowance();}
}
