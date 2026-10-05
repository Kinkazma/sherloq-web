import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createDenseRegions} from './dense-regions.js';
const prefix=image=>'dense-detail/'+image.surface.descriptor.id+'/';
const even=x=>{const lo=Math.floor(x),part=x-lo;return part===.5?lo+(lo%2!==0):Math.round(x);};
export function clearPagedDetailCache(image,budget){if(image.surface)budget.clearPrefix(prefix(image));}
// Exact finite-support high pass, computed only where the native supplemental
// test actually samples. All point coordinates and 1/32 remap weights are global.
export async function createPagedDetailSampler(image,{budget,signal}={}){
 const {width,height}=image.surface.descriptor,release=budget.reserve(48*1024**2),cachePrefix=prefix(image);let math,disposed=false,busy=false;
 try{math=await createDenseRegions();checkAbort(signal);}catch(e){release();throw e;}
 return {
  detail:{width,height},
  async sample(x,y,rows,cols){
   requireValue(!disposed&&!busy&&x instanceof Float32Array&&y instanceof Float32Array&&x.length===rows*cols&&y.length===x.length&&x.length<=2592&&x.every(Number.isFinite)&&y.every(Number.isFinite),'Invalid stored detail samples.');busy=true;
   try{
    checkAbort(signal);const out=new Float32Array(x.length),groups=new Map();
    for(let i=0;i<x.length;i++){
     const ix=even(Math.fround(x[i]*32))>>5,iy=even(Math.fround(y[i]*32))>>5;if(ix< -1||iy< -1||ix>=width||iy>=height)continue;
     const tx=Math.floor(Math.max(0,ix)/64),ty=Math.floor(Math.max(0,iy)/64),key=tx+','+ty;let group=groups.get(key);if(!group){group={tx,ty,ids:[]};groups.set(key,group);}group.ids.push(i);
    }
    for(const [key,{tx,ty,ids}] of groups){
     await controlCheckpoint(signal);if(disposed)throw new EngineError('DISPOSED','Detail sampler disposed.');
     const name=cachePrefix+key;let tile=budget.get(name);
     if(!tile){
      const x0=Math.max(0,tx*64-5),y0=Math.max(0,ty*64-5),w=Math.min(width,(tx+1)*64+6)-x0,h=Math.min(height,(ty+1)*64+6)-y0;
      const part=await image.surface.readWindow({x:x0,y:y0,width:w,height:h},{signal});
      try{checkAbort(signal);if(disposed)throw new EngineError('DISPOSED','Detail sampler disposed.');const detail=math.detail(part.pixels);tile={...detail,x0,y0,byteLength:detail.values.byteLength};budget.put(name,tile);}finally{part.release();}
     }
     const xx=Float32Array.from(ids,i=>even(Math.fround(x[i]*32))/32-tile.x0),yy=Float32Array.from(ids,i=>even(Math.fround(y[i]*32))/32-tile.y0),sampler=math.sampler(tile);
     try{const values=sampler.sample(xx,yy,1,ids.length);for(let j=0;j<ids.length;j++)out[ids[j]]=values[j];}finally{sampler.dispose();}
    }
    checkAbort(signal);return out;
   }finally{busy=false;}
  },
  dispose(){if(disposed)return;disposed=true;math=null;release();}
 };
}
