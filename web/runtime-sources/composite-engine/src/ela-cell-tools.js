// Cell-only stages from native ela_biomes.py / ela_ghosts.py. Energy stays separate.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
export const ELA_PROFILE_NAMES=Object.freeze(['luminance','chroma_red','chroma_blue','grain_1px','grain_2px']);
const f=Math.fround;
const median3=(a,b,c)=>a>b?(b>c?b:Math.min(a,c)):(a>c?a:Math.min(b,c));
function shape(rows,cols){requireValue(Number.isInteger(rows)&&rows>0&&Number.isInteger(cols)&&cols>0&&Number.isSafeInteger(rows*cols)&&rows*cols<2**31,'Positive cell grid required');return rows*cols;}
function floats(value,length,name){requireValue(value instanceof Float32Array&&value.length===length&&value.every(Number.isFinite),`Finite float32 ${name} required`);}
function mask(value,length,name){requireValue(value instanceof Uint8Array&&value.length===length&&value.every(v=>v===0||v===1),`Binary ${name} required`);}
export async function coherentCellScores({rows,cols,signed_scores,supported},{signal,account=()=>{}}={}) {
  const n=shape(rows,cols);floats(signed_scores,n*15,'signed scores');mask(supported,n,'support');checkAbort(signal);account(n*24);
  const persistent=new Float32Array(n*5),result=new Float32Array(n),nearby=new Float32Array(9);
  for(let i=0;i<n;i++)for(let d=0;d<5;d++)persistent[i*5+d]=supported[i]?median3(signed_scores[i*15+d],signed_scores[i*15+5+d],signed_scores[i*15+10+d]):0;
  for(let y=0;y<rows;y++){
    if(y%16===0)await controlCheckpoint(signal);
    for(let x=0;x<cols;x++)for(let d=0;d<5;d++){
      let k=0;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)nearby[k++]=yy>=0&&yy<rows&&xx>=0&&xx<cols?persistent[(yy*cols+xx)*5+d]:0;
      nearby.sort();const own=persistent[(y*cols+x)*5+d],reference=nearby[4],value=own*reference>0?Math.min(Math.abs(own),Math.abs(reference)):0;
      result[y*cols+x]=Math.max(result[y*cols+x],value);
    }
  }
  checkAbort(signal);return result;
}
// OpenCV default 8-connected labeling orders components by the first 2×2 block.
// Flooding a component preserves that order without full-image mask copies.
async function components(rows,cols,predicate,signal){
  const n=rows*cols,labels=new Int32Array(n),queue=new Int32Array(n),stats=[null];
  for(let by=0;by<rows;by+=2){
    await controlCheckpoint(signal);
    for(let bx=0;bx<cols;bx+=2)for(let dy=0;dy<2&&by+dy<rows;dy++)for(let dx=0;dx<2&&bx+dx<cols;dx++){
      const first=(by+dy)*cols+bx+dx;if(labels[first]||!predicate(first))continue;
      const id=stats.length;labels[first]=id;queue[0]=first;let head=0,tail=1,x0=bx+dx,x1=x0,y0=by+dy,y1=y0;
      while(head<tail){const i=queue[head++],x=i%cols,y=Math.floor(i/cols);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        for(let yy=Math.max(0,y-1);yy<=Math.min(rows-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(cols-1,x+1);xx++){const j=yy*cols+xx;if(!labels[j]&&predicate(j)){labels[j]=id;queue[tail++]=j;}}
        if(head%8192===0)await controlCheckpoint(signal);
      }
      stats.push({bbox:[x0,y0,x1-x0+1,y1-y0+1],area:tail});
    }
  }
  return {labels,stats};
}
function floatMedian(values){values.sort();const m=values.length>>1;return values.length%2?values[m]:f(f(values[m-1]+values[m])/2);}
export async function segmentElaCells(base,{threshold=2,minimum=3}={}, {signal,account=()=>{}}={}){
  const {rows,cols,score,signed_scores,supported,legacy_score,ghost_score,ghost_supported,background_score,background_supported,ela_score}=base,n=shape(rows,cols),block=base.metadata?.block;
  requireValue(Number.isFinite(threshold)&&threshold>0&&Number.isFinite(minimum)&&minimum>=1&&Number.isInteger(block)&&block>=1&&Number.isSafeInteger(block*block*n),'Invalid cell segmentation parameters');
  floats(score,n,'scores');floats(signed_scores,n*15,'signed profiles');mask(supported,n,'support');
  for(const [name,value] of Object.entries({legacy_score,ghost_score,background_score,ela_score}))if(value!==undefined)floats(value,n,name);
  if(ghost_score)mask(ghost_supported,n,'ghost support');if(background_score)mask(background_supported,n,'background support');
  checkAbort(signal);account(n*384+8192);const t=f(threshold),primary=await components(rows,cols,i=>supported[i]&&score[i]>=t,signal);let seeded=null;
  if(legacy_score){
    seeded=new Set();
    for(const [values,allowed] of [[legacy_score,supported],...(ghost_score?[[ghost_score,ghost_supported]]:[]),...(background_score?[[background_score,background_supported]]:[])]){
      const seed=await components(rows,cols,i=>supported[i]&&allowed[i]&&values[i]>=t,signal);
      for(let i=0;i<n;i++)if(seed.labels[i]&&seed.stats[seed.labels[i]].area>=minimum)seeded.add(primary.labels[i]);
    }
  }
  const labels=new Int32Array(n),regions=[];
  for(let id=1;id<primary.stats.length;id++){
    if(primary.stats[id].area<minimum||(seeded&&!seeded.has(id)))continue;
    await controlCheckpoint(signal);const selected=[],[left,top,bw,bh]=primary.stats[id].bbox;for(let y=top;y<top+bh;y++)for(let x=left;x<left+bw;x++){const i=y*cols+x;if(primary.labels[i]===id)selected.push(i);}
    const rid=regions.length+1,signed_profile=[];
    for(let d=0;d<5;d++){const values=new Float32Array(selected.length*3);let at=0;for(const i of selected)for(let q=0;q<3;q++)values[at++]=signed_scores[i*15+q*5+d];signed_profile.push(floatMedian(values));}
    let dominant=0;for(let d=1;d<5;d++)if(Math.abs(signed_profile[d])>Math.abs(signed_profile[dominant]))dominant=d;
    const sources=[];if(selected.some(i=>(ela_score??score)[i]>=t))sources.push('ELA');if(ghost_score&&selected.some(i=>ghost_score[i]>=t))sources.push('JPEG Ghosts');if(background_score&&selected.some(i=>background_score[i]>=t))sources.push('ELA background');
    for(const i of selected)labels[i]=rid;
    const stat=primary.stats[id];account(1024);
    regions.push({id:rid,cells:stat.area,pixels:stat.area*block*block,bbox:stat.bbox.map(v=>v*block),score:floatMedian(Float32Array.from(selected,i=>score[i])),dominant_descriptor:ELA_PROFILE_NAMES[dominant],signed_profile,sources});
  }
  checkAbort(signal);return {rows,cols,labels,regions,metadata:{...base.metadata,threshold,minimum_cells:minimum}};
}
export async function aggregateGhostCells({maps,rows:mapRows,cols:mapCols,qualities},{rows,cols,block,dx=0,dy=0},{signal,account=()=>{}}={}){
  const n=shape(rows,cols),m=shape(mapRows,mapCols);requireValue(Number.isInteger(qualities)&&qualities>0&&maps instanceof Float64Array&&maps.length===m*qualities&&maps.every(Number.isFinite),'Normalized float64 Ghost cube required');
  requireValue(Number.isInteger(block)&&block>=16&&block%8===0&&Number.isInteger(dx)&&dx>=0&&dx<=7&&Number.isInteger(dy)&&dy>=0&&dy<=7,'ELA cell size / Ghost phase invalid');
  checkAbort(signal);account(n*qualities*8+n+(mapRows+1)*(mapCols+1)*8);
  const curves=new Float64Array(n*qualities),valid=new Uint8Array(n),stride=mapCols+1,integral=new Float64Array((mapRows+1)*stride),area=(block/16)**2;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)valid[y*cols+x]=((y+1)*block+dy)/16<=mapRows&&((x+1)*block+dx)/16<=mapCols?1:0;
  function corner(y,x){y=Math.min(y,mapRows);x=Math.min(x,mapCols);const iy=Math.floor(y),ix=Math.floor(x),fy=y-iy,fx=x-ix,jy=Math.min(iy+1,mapRows),jx=Math.min(ix+1,mapCols);
    return integral[iy*stride+ix]*(1-fy)*(1-fx)+integral[jy*stride+ix]*fy*(1-fx)+integral[iy*stride+jx]*(1-fy)*fx+integral[jy*stride+jx]*fy*fx;
  }
  for(let q=0;q<qualities;q++){
    integral.fill(0);
    // Match maps.cumsum(0).cumsum(1), separately per quality. Only one integral
    // plane is needed, avoiding a full extra H×W×Q temporary cube.
    for(let y=0;y<mapRows;y++){
      if(y%32===0)await controlCheckpoint(signal);
      for(let x=0;x<mapCols;x++)integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+maps[(y*mapCols+x)*qualities+q];
    }
    for(let y=1;y<=mapRows;y++)for(let x=1;x<=mapCols;x++)integral[y*stride+x]+=integral[y*stride+x-1];
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const y0=(y*block+dy)/16,y1=((y+1)*block+dy)/16,x0=(x*block+dx)/16,x1=((x+1)*block+dx)/16;
      curves[(y*cols+x)*qualities+q]=(corner(y1,x1)-corner(y0,x1)-corner(y1,x0)+corner(y0,x0))/area;
    }
  }
  checkAbort(signal);return {rows,cols,qualities,curves,valid};
}
