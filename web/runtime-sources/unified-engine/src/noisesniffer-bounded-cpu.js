import "../../runtime-context.js?v=0.30.0";
import {cvNoisesnifferStatistics} from './opencv.js';
import {allocateTypedArray} from './allocation.js';
import {checkAbort,controlCheckpoint,requireValue} from './errors.js';
import {noisesnifferStreamMath} from './noisesniffer-stream-math.js';
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};
// The byte extrema belong to the whole source. For block 8, OpenCV's DFT
// dimensions and correlation tile origin also belong to the whole source.
// Only independent native calls are bounded; no local extrema or local FFT
// geometry is substituted. The positive native FMA is the exact binary64 FMA
// used by both reference and fast means for these byte/coefficient operands.
export async function boundedNoisesnifferCpuBase(image,w,{signal,onProgress}={}){
 checkAbort(signal);const math=await noisesnifferStreamMath(),{width,height,data}=image,cols=width-w+1,rows=height-w+1,N=cols*rows;
 requireValue([3,5,7,8].includes(w)&&cols>0&&rows>0,'Invalid bounded native Noisesniffer base geometry.');
 const extrema=[255,255,255,0,0,0];
 for(let at=0;at<width*height;at+=65536){const end=Math.min(width*height,at+65536);for(let i=at;i<end;i++)for(let c=0;c<3;c++){const v=data[i*3+c];extrema[c]=Math.min(extrema[c],v);extrema[c+3]=Math.max(extrema[c+3],v);}onProgress?.({phase:'extrema',completed:end,total:width*height});await controlCheckpoint(signal);}
 const flags=allocateTypedArray(Uint8Array,N,{label:'noisesniffer-bounded-valid-flags'}),means=allocateTypedArray(Float64Array,N*3,{label:'noisesniffer-bounded-native-means'}),tileWidth=Math.min(cols,256),tileHeight=Math.max(1,Math.floor(8192/tileWidth));let done=0;
 for(let y=0;y<rows;y+=tileHeight)for(let x=0;x<cols;x+=tileWidth){
  checkAbort(signal);const tw=Math.min(tileWidth,cols-x),th=Math.min(tileHeight,rows-y),cw=tw+w-1,ch=th+w-1,rgb=allocateTypedArray(Uint8Array,cw*ch*3,{label:'noisesniffer-native-base-context'});
  for(let yy=0;yy<ch;yy++){const at=((y+yy)*width+x)*3;rgb.set(data.subarray(at,at+cw*3),yy*cw*3);}
  const result=math.base(rgb,cw,ch,w,extrema);for(let yy=0;yy<th;yy++){flags.set(result.valid.subarray(yy*tw,(yy+1)*tw),(y+yy)*cols+x);if(w!==8)means.set(result.means.subarray(yy*tw*3,(yy+1)*tw*3),((y+yy)*cols+x)*3);}
  done+=tw*th;onProgress?.({phase:'means',completed:done,total:N});await controlCheckpoint(signal);
 }
 if(w===8){
  const dw=math.optimal(Math.min(249,width)+7),dh=math.optimal(Math.min(249,height)+7),bw=Math.min(dw-7,width),bh=Math.min(dh-7,height),nx=Math.ceil(width/bw),ny=Math.ceil(height/bh);done=0;
  for(let gy=0;gy<ny;gy++)for(let gx=0;gx<nx;gx++){
   checkAbort(signal);const x=gx*bw,y=gy*bh,tw=Math.min(bw,width-x),th=Math.min(bh,height-y),rgb=allocateTypedArray(Uint8Array,(tw+7)*(th+7)*3,{label:'noisesniffer-global-FFT-context'});
   for(let yy=0;yy<th+7;yy++)for(let xx=0;xx<tw+7;xx++){const at=(reflect(y+yy-4,height)*width+reflect(x+xx-4,width))*3;rgb.set(data.subarray(at,at+3),(yy*(tw+7)+xx)*3);}
   const result=math.mean8(rgb,tw,th,dw,dh,bh),left=Math.max(x,4),top=Math.max(y,4),right=Math.min(x+tw,cols+4),bottom=Math.min(y+th,rows+4);
   for(let yy=top;yy<bottom;yy++)if(left<right)means.set(result.means.subarray(((yy-y)*tw+left-x)*3,((yy-y)*tw+right-x)*3),((yy-4)*cols+left-4)*3);
   onProgress?.({phase:'means-fft',completed:++done,total:nx*ny});await controlCheckpoint(signal);
  }
 }
 const valid=allocateTypedArray(Uint32Array,N,{label:'noisesniffer-bounded-valid-ids'});let count=0;
 for(let at=0;at<N;at+=65536){for(let i=at,end=Math.min(N,at+65536);i<end;i++)if(flags[i])valid[count++]=i;await controlCheckpoint(signal);}
 return{width:cols,height:rows,means,valid:valid.slice(0,count)};
}
// Same native entry and fast/reference flag, same independent DCT blocks.
// The global mean/valid stage retains the original full-image FFT context.
export async function boundedNoisesnifferCpuStatistics(image,w,{signal,onProgress,fast=true,base}={}){
 checkAbort(signal);const started=performance.now(),cols=image.width-w+1,rows=image.height-w+1,N=cols*rows;
 requireValue([3,5,7,8].includes(w)&&cols>0&&rows>0,'Invalid bounded native Noisesniffer geometry.');
 const global=base?await base():await boundedNoisesnifferCpuBase(image,w,{signal,onProgress:e=>{const ratio=e.completed/e.total;onProgress?.(e.phase==='extrema'?.02*ratio:e.phase==='means-fft'?.03+.07*ratio:.02+(w===8?.01:.08)*ratio);}});checkAbort(signal);onProgress?.(.1);await controlCheckpoint(signal);
 const variance=allocateTypedArray(Float32Array,N*3,{label:'noisesniffer-bounded-native-DCT'}),tileWidth=Math.min(cols,256),tileHeight=Math.max(1,Math.floor(8192/tileWidth));let jobs=0,done=0;
 for(let y=0;y<rows;y+=tileHeight)for(let x=0;x<cols;x+=tileWidth){
  checkAbort(signal);const tw=Math.min(tileWidth,cols-x),th=Math.min(tileHeight,rows-y),width=tw+w-1,height=th+w-1,rgb=allocateTypedArray(Uint8Array,width*height*3,{label:'noisesniffer-native-DCT-context'});
  for(let row=0;row<height;row++){const at=((y+row)*image.width+x)*3;rgb.set(image.data.subarray(at,at+width*3),row*width*3);}
  const result=await cvNoisesnifferStatistics({width,height,format:'rgb8',data:rgb},w,{signal,part:'dct',fast});
  for(let c=0;c<3;c++)for(let row=0;row<th;row++)variance.set(result.variance.subarray(c*tw*th+row*tw,c*tw*th+(row+1)*tw),c*N+(y+row)*cols+x);
  jobs++;done+=tw*th;onProgress?.(.1+.5*done/N);await controlCheckpoint(signal);
 }
 checkAbort(signal);return{...global,variance,runtime:{...global.gpuRuntime,workers:1,kernelMs:performance.now()-started,cpuDctTiles:jobs,maximumDctBlocksPerCall:8192,scheduling:{policy:'same-native-DCT-bounded-contexts',taskExecutions:jobs+1,preflightExecutions:0}}};
}
