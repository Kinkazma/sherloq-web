import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';

export const CFA_NATIVE_CELL_PLAN_VERSION='native-window-cfa-cells/2';
const identity=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');

/** Native cells are anchored to this calculation window, never to the reader's
 * technical rectangles. No RGB is read. A retained cell's ENTIRE B+8 support
 * is admitted; only contiguous cells on this same grid may share a crop. */
export async function planCfaNativeCells(view,parameters,{budget,signal}={}){
 requireValue(view?.domain&&typeof view.includesRectangle==='function'&&typeof budget?.reserve==='function','A certified CFA source view and budget are required.');
 const {block}=parameters,{width,height}=view.domain,origin=view.domain.toOriginal([0,0]);
 requireValue([width,height,...origin].every(Number.isSafeInteger)&&width>0&&height>0&&Number.isSafeInteger(block)&&block>=8&&block%2===0,'Invalid CFA native window grid.');
 const nx=Math.max(0,Math.floor((width-width%2-8)/block)),ny=Math.max(0,Math.floor((height-height%2-8)/block)),nativeCells=nx*ny;
 requireValue(Number.isSafeInteger(nativeCells)&&nativeCells<=0xffffffff,'CFA native cell addressing exceeds safe admission.');
 const cooperate=createCooperator(signal),temporary=[],retained=[],fragments=[],full={x:0,y:0,width,height},direct=view.includesRectangle(full);let cells=0,complete=false;
 const hold=(list,n)=>list.push(budget.reserve(n));
 const add=(rect,gridOrigin,gridShape,cellOffsets)=>{
  const count=gridShape[0]*gridShape[1];hold(retained,1024);
  requireValue(!count||view.includesRectangle(rect),'A CFA coalesced support contains excluded RGB.');
  const p=view.domain.toOriginal([rect.x,rect.y]);
  fragments.push({index:fragments.length,rect:{...rect},originalBounds:[p[0],p[1],p[0]+rect.width,p[1]+rect.height],phase:(p[0]&1)|((p[1]&1)<<1),offset:cellOffsets?.[0]??0,count,evaluable:count>0,gridShape:[...gridShape],nativeOrigin:[4,4],validShape:[gridShape[0]*block,gridShape[1]*block],windowCellOrigin:[...gridOrigin],...(cellOffsets?{cellOffsets}:{}),status:count?'evaluated-native-context':'not-evaluable',...(count?{}:{reason:nativeCells?'no-fully-admitted-native-cell-support':'native-cfa-block-plus-eight',message:nativeCells?'No complete native CFA support is admitted.':'CFA image must be at least block + 8 pixels per side.',minimumSide:block+8})});
 };
 try{
  hold(retained,4096);checkAbort(signal);
  if(direct){cells=nativeCells;add(full,[0,0],[ny,nx]);}
  else{
   // Zero is absent, positive entries are packed row-major indices plus one.
   // This temporary map is admitted before allocation and released after plan.
   hold(temporary,nativeCells*4+4096);const population=new Uint32Array(nativeCells);
   for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    await cooperate();if(view.includesRectangle({x:x*block,y:y*block,width:block+8,height:block+8}))population[y*nx+x]=++cells;
   }
   let active=new Map();const groups=[];
   for(let y=0;y<ny;y++){
    await cooperate();const next=new Map();let x=0;
    while(x<nx){if(!population[y*nx+x]){x++;continue;}const first=x;while(x<nx&&population[y*nx+x])x++;const key=first+':'+x,old=active.get(key);
     if(old){old.h++;next.set(key,old);}else{hold(temporary,256);next.set(key,{x:first,y,w:x-first,h:1});}
    }
    for(const[k,g]of active)if(!next.has(k))groups.push(g);active=next;
   }
   groups.push(...active.values());groups.sort((a,b)=>a.y-b.y||a.x-b.x||a.h-b.h||a.w-b.w);
   for(const g of groups){
    await cooperate();hold(temporary,256);const count=g.w*g.h;
    // Reserve the persistent index before constructing its ordinary transport
    // array. It will be copied neither from halos nor from another grid.
    hold(retained,count*16);const offsets=[];
    for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++)offsets.push(population[(g.y+y)*nx+g.x+x]-1);
    add({x:g.x*block,y:g.y*block,width:g.w*block+8,height:g.h*block+8},[g.y,g.x],[g.h,g.w],offsets);
   }
   if(!cells)add(full,[0,0],[0,0]);
  }
  hold(temporary,4096+fragments.length*512);const fingerprint=await identity([CFA_NATIVE_CELL_PLAN_VERSION,view.domain.sourceSha256,[...origin,width,height],view.domain.fingerprint,parameters,fragments.map(f=>[f.rect,f.windowCellOrigin,f.gridShape])]);checkAbort(signal);
  const modeledPixels=cells*block*block;requireValue(Number.isSafeInteger(modeledPixels)&&modeledPixels<=view.domain.countIncluded,'CFA modeled cells exceed admitted membership.');
  complete=true;let closed=false;return{version:CFA_NATIVE_CELL_PLAN_VERSION,fingerprint,parameters,fragments,cells,nativeCells,rejectedNativeCells:nativeCells-cells,windowOrigin:[...origin],windowGridShape:[ny,nx],direct,modeledPixels,selectedPixels:view.domain.countIncluded,release(){if(closed)return;closed=true;for(const free of retained.splice(0))free();}};
 }finally{for(const free of temporary)free();if(!complete)for(const free of retained)free();}
}
