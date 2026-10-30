import {createLoupeImageCache} from './native-effects.js';

// Gesture-only surfaces. Original files, histogram domains and native caches
// stay owned by the normal memory. Each PDF domain is sampled independently.
export function createPreviewMemory(base,{maxPixels=256000,changed=()=>{}}={}){
 const records=new Map();let closed=false;
 function mapped(lease,entry,sx,sy){
  const bounds=b=>b&&({...b,left:b.left*sx,top:b.top*sy,right:b.right*sx,bottom:b.bottom*sy,...(b.circle?{circle:{x:b.circle.x*sx,y:b.circle.y*sy,radius:b.circle.radius*Math.max(sx,sy)}}:{})});
  return {width:entry.raw.width,height:entry.raw.height,id:'preview-'+lease.id,provisional:true,prepare:(b,scale=1)=>lease.prepare(bounds(b),scale/Math.min(sx,sy)),
   draw(ctx,b,scale=1){ctx.save();ctx.scale(1/sx,1/sy);lease.draw(ctx,bounds(b),scale/Math.min(sx,sy));ctx.restore();},
   ready:(b,scale=1)=>lease.ready(bounds(b),scale/Math.min(sx,sy)),readPixels(){throw Error('Preview pixels are not a native export.');},fork:()=>mapped(lease.fork(),entry,sx,sy),close:()=>lease.close()};
 }
 function record(entry){
  if(records.has(entry.id))return records.get(entry.id);const raw=entry.raw,ratio=Math.min(1,Math.sqrt(Math.max(1,maxPixels)/(raw.width*raw.height))),width=Math.max(1,Math.floor(raw.width*ratio)),height=Math.max(1,Math.floor(raw.height*ratio)),sx=width/raw.width,sy=height/raw.height;
  let input,canvas;raw.retain?.();
  if(width===raw.width&&height===raw.height)input={...raw,background:false};
  else{canvas=new OffscreenCanvas(width,height);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.scale(sx,sy);raw.draw(ctx);ctx.resetTransform();input={width,height,background:false,async readPixels(r){const rgba=ctx.getImageData(r.x,r.y,r.width,r.height).data,data=new Uint8Array(r.width*r.height*3);for(let i=0,j=0;i<rgba.length;i+=4,j+=3)data.set(rgba.subarray(i,i+3),j);return {width:r.width,height:r.height,format:'rgb8',data};}};}
  const value={raw,input,canvas,sx,sy,cache:createLoupeImageCache({changed,lane:'preview'}),key:null,lease:null,building:null};records.set(entry.id,value);return value;
 }
 const api={get:(id,options)=>base.get(id,options),retainPDFItems:ids=>base.retainPDFItems?.(ids),
  prepared(entry,effects){const r=entry&&records.get(entry.id);return r?.key===JSON.stringify(effects)?r.lease:null;},displayed(entry){return records.get(entry?.id)?.lease??null;},
  async prepare(entry,effects){if(closed)throw Object.assign(Error('Preview closed'),{code:'CANCELLED'});const r=record(entry),key=JSON.stringify(effects);if(r.key===key)return;if(r.building)return r.building;
   r.building=(async()=>{r.input.inlinePixels??=await r.input.readPixels({x:0,y:0,width:r.input.width,height:r.input.height});if(closed)throw Object.assign(Error('Preview closed'),{code:'CANCELLED'});const lease=await r.cache.acquire(r.input,effects,changed);if(closed){lease.close();throw Object.assign(Error('Preview closed'),{code:'CANCELLED'});}r.lease?.close();r.lease=mapped(lease,entry,r.sx,r.sy);r.key=key;changed();})().finally(()=>r.building=null);return r.building;
  },
  stats(){return {pixels:[...records.values()].reduce((n,r)=>n+r.input.width*r.input.height,0),fullPixels:[...records.values()].reduce((n,r)=>n+r.raw.width*r.raw.height,0),minimumScale:Math.min(1,...[...records.values()].map(r=>Math.min(r.sx,r.sy))),domains:records.size};},
  dispose(){if(closed)return;closed=true;for(const r of records.values()){r.lease?.close();r.cache.dispose();if(r.canvas)r.canvas.width=r.canvas.height=0;r.raw.release?.();}records.clear();}
 };return api;
}
