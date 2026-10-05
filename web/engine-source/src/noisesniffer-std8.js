import {createFloatPlane} from './segmented-float-plane.js';
import {controlCheckpoint,checkAbort} from './errors.js';
// For byte-valued8×8 blocks, means are integer/64 and every squared deviation
// is an exact multiple of1/4096. All sums fit binary64 exactly. Thus this integer
// box recurrence gives the same variance and sqrt as native np.std, including
// tied values used by its unstable argsort. Other block sizes keep native sums.
export async function noisesnifferStd8(image,options){
 const {width,height}=image.surface.descriptor,cols=width-7,rows=height-7,step=32,release=options.budget.reserve(width*3*(8+8+step*8)+65536),started=performance.now();let plane;
 try{plane=await createFloatPlane(cols*3,rows,options);const ring=new Uint8Array(width*3*8),sums=new Uint32Array(width*3),squares=new Uint32Array(width*3);let written=0;
  for(let top=0;top<height;top+=step){await controlCheckpoint(options.signal);const count=Math.min(step,height-top),part=await image.surface.readWindow({x:0,y:top,width,height:count},{signal:options.signal});
   try{const first=Math.max(0,7-top),values=new Float64Array(cols*3*Math.max(0,count-first));let at=0;
    for(let dy=0;dy<count;dy++){const y=top+dy,slot=y%8*width*3,source=dy*width*3;for(let x=0;x<width*3;x++){const v=part.pixels.data[source+x],old=ring[slot+x];sums[x]+=v-old;squares[x]+=v*v-old*old;ring[slot+x]=v;}
     if(y<7)continue;let s0=0,s1=0,s2=0,q0=0,q1=0,q2=0;for(let x=0;x<width;x++){const k=x*3;s0+=sums[k];s1+=sums[k+1];s2+=sums[k+2];q0+=squares[k];q1+=squares[k+1];q2+=squares[k+2];if(x>=8){s0-=sums[k-24];s1-=sums[k-23];s2-=sums[k-22];q0-=squares[k-24];q1-=squares[k-23];q2-=squares[k-22];}if(x>=7){values[at++]=Math.sqrt(q0/64-(s0/64)**2);values[at++]=Math.sqrt(q1/64-(s1/64)**2);values[at++]=Math.sqrt(q2/64-(s2/64)**2);}}
    }
    const outRows=Math.max(0,count-first);if(outRows){await plane.write(values,0,written,cols*3,outRows,{signal:options.signal});written+=outRows;}
   }finally{part.release();}options.onProgress?.({phase:'noisesniffer-std8',completed:Math.min(height,top+count),total:height});
  }
  await plane.store.flush();checkAbort(options.signal);plane.metrics={milliseconds:performance.now()-started,method:'exact-byte-8x8-integer-box',storedBytes:cols*rows*24};return plane;
 }catch(e){await plane?.dispose();throw e;}finally{release();}
}
