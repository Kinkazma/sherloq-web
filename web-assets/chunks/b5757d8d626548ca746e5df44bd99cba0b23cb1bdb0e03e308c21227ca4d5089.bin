import "../../runtime-context.js?v=0.14.5";
import {checkAbort,controlCheckpoint} from './errors.js';
// A candidate index over BOTH endpoints. Every accepted native group predicate
// requires one endpoint near the query. Candidates are sorted back to original
// match-row order before the unchanged distance and duplicate predicates run.
export async function createCloningGroupGrid(points,matches,distance,{account,signal}={}){
 const count=matches.length/3,free=account(count*528+8192);let complete=false;
 try{
  const cells=new Map(),key=(x,y)=>x+','+y;
  for(let i=0;i<count*2;i++){
   if(i%8192===0)await controlCheckpoint(signal);const p=matches[Math.floor(i/2)*3+i%2]*7,k=key(Math.floor(points[p]/distance),Math.floor(points[p+1]/distance));let cell=cells.get(k);if(!cell){cell={length:0,start:0,next:0};cells.set(k,cell);}cell.length++;
  }
  let at=0;for(const c of cells.values()){c.start=c.next=at;at+=c.length;}
  const entries=new Uint32Array(count*2),stamps=new Uint32Array(count),candidates=new Uint32Array(count);
  for(let i=0;i<count*2;i++){if(i%8192===0)await controlCheckpoint(signal);const row=Math.floor(i/2),p=matches[row*3+i%2]*7,c=cells.get(key(Math.floor(points[p]/distance),Math.floor(points[p+1]/distance)));entries[c.next++]=row;}
  complete=true;return {
   query(row){checkAbort(signal);const p=matches[row*3]*7,x=points[p],y=points[p+1],pad=Math.max(1,Math.abs(x),Math.abs(y),distance)*Number.EPSILON*4,stamp=row+1;let n=0;
    for(let cy=Math.floor((y-distance-pad)/distance);cy<=Math.floor((y+distance+pad)/distance);cy++)for(let cx=Math.floor((x-distance-pad)/distance);cx<=Math.floor((x+distance+pad)/distance);cx++){
     const c=cells.get(key(cx,cy));if(!c)continue;for(let j=c.start;j<c.start+c.length;j++){const id=entries[j];if(id>row&&stamps[id]!==stamp){stamps[id]=stamp;candidates[n++]=id;}}
    }
    return candidates.subarray(0,n).sort();
   },dispose(){if(typeof free==='function')free();}
  };
 }finally{if(!complete&&typeof free==='function')free();}
}
