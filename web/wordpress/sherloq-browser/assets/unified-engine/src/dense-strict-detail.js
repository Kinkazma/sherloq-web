import "../../runtime-context.js?v=0.25.0";
import {createDenseRegions} from './dense-regions.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const TILE=64,HEAP=48*1024**2;
let ownerId=0;
const even=x=>{const lo=Math.floor(x),p=x-lo;return p===.5?lo+(lo%2!==0):Math.round(x);};
const fixed=x=>even(Math.fround(Math.fround(x)*32))/32;
// Native highpass is finite (11 taps). Tiles keep five native context pixels
// around their cores and six on the bilinear side. Neither RGB nor highpass
// observations are borrowed across an excluded boundary.
export async function createStrictDenseDetailSampler({view,domain},{budget,signal}={}){
 requireValue(view?.domain?.fingerprint===domain?.fingerprint&&budget?.reserve,'Strict detail source identity differs.');domain=view.domain;checkAbort(signal);
 const contexts=Array.from(view.admittedRectangles(),r=>({...r})),prefix='dense-strict-detail/'+(++ownerId)+'/',working=budget.reserve(HEAP+76*76*64+2592*24+contexts.length*256);let math,closed=false,busy=false;
 try{math=await createDenseRegions();checkAbort(signal);}catch(error){working();throw error;}
 const locate=(x,y)=>{x=fixed(x);y=fixed(y);const ix=Math.floor(x),iy=Math.floor(y);return contexts.findIndex(r=>ix>=r.x&&iy>=r.y&&ix+1<r.x+r.width&&iy+1<r.y+r.height);};
 const same=coordinates=>{let owner=-1;for(const[x,y]of coordinates){const current=locate(x,y);if(current<0||owner>=0&&owner!==current)return false;owner=current;}return owner>=0;};
 const metrics={nativeTiles:0,cacheHits:0,rejectedPatches:0,sourceRegionFingerprint:domain.fingerprint};
 return{detail:{width:domain.width,height:domain.height},metrics,
  // Keep the native 9x9 patch, every ±1 alignment and minimum six-sample gate.
  // A patch that would cross independent native contexts is unavailable before
  // NCC; no zero-filled or reflected neighbour from a hole can confirm a model.
  admitsPatch(source,target){requireValue(!closed,'Strict detail sampler disposed.');const ok=same(source)&&same(target.flatMap(([x,y])=>[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]]));if(!ok)metrics.rejectedPatches++;return ok;},
  async sample(x,y,rows,cols,{signal:requestSignal}={}){
   const stop=requestSignal??signal;requireValue(!closed&&!busy&&x instanceof Float32Array&&y instanceof Float32Array&&x.length===rows*cols&&y.length===x.length&&x.length<=2592&&x.every(Number.isFinite)&&y.every(Number.isFinite),'Invalid strict detail samples.');checkAbort(stop);busy=true;
   try{const out=new Float32Array(x.length),groups=new Map();
    for(let i=0;i<x.length;i++){const id=locate(x[i],y[i]);requireValue(id>=0,'A strict detail sample has unobserved bilinear support.');const r=contexts[id],xx=fixed(x[i])-r.x,yy=fixed(y[i])-r.y,tx=Math.floor(xx/TILE),ty=Math.floor(yy/TILE),key=id+':'+tx+','+ty;let group=groups.get(key);if(!group){group={r,tx,ty,ids:[]};groups.set(key,group);}group.ids.push(i);}
    for(const[key,{r,tx,ty,ids}]of groups){await controlCheckpoint(stop);if(closed)throw new EngineError('DISPOSED','Strict detail sampler disposed.');const name=prefix+key;let tile=budget.get(name);
     if(tile)metrics.cacheHits++;
     else{const x0=Math.max(0,tx*TILE-5),y0=Math.max(0,ty*TILE-5),width=Math.min(r.width,(tx+1)*TILE+6)-x0,height=Math.min(r.height,(ty+1)*TILE+6)-y0,part=await view.readWindow({x:r.x+x0,y:r.y+y0,width,height},{signal:stop});
      try{checkAbort(stop);if(closed)throw new EngineError('DISPOSED','Strict detail sampler disposed.');tile={...math.detail(part.pixels),x0:r.x+x0,y0:r.y+y0};tile.byteLength=tile.values.byteLength+256;budget.put(name,tile);metrics.nativeTiles++;}finally{part.release();}
     }
     const xx=Float32Array.from(ids,i=>fixed(x[i])-tile.x0),yy=Float32Array.from(ids,i=>fixed(y[i])-tile.y0),sampler=math.sampler(tile);try{const values=sampler.sample(xx,yy,1,ids.length);for(let j=0;j<ids.length;j++)out[ids[j]]=values[j];}finally{sampler.dispose();}
    }checkAbort(stop);return out;
   }finally{busy=false;}
  },
  dispose(){if(closed)return;closed=true;budget.clearPrefix(prefix);math=null;working();}
 };
}
