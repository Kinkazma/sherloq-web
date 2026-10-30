// Reuse the unchanged nine-cell neighborhood per occupied query cell.
// Native cKDTree leaf-order ranks and all later predicates remain unchanged.
// This operation owns its lists; at most nine stored indices per point.
export async function buildSortedCellNeighborhoods(grid,ranks,{signal,reserveMemory=()=>{},cooperate=async()=>{},check=()=>{if(signal?.aborted)throw signal.reason;}}={}){
 check();
 const result=new Map(),address=(x,y)=>x+','+y;if(reserveMemory(ranks.length*36+grid.size*512+1024)===false){check();return null;}let references=0,maximum=0,last=performance.now();
 for(const key of grid.keys()){
  check();const[x,y]=key.split(',').map(Number),parts=[];let count=0;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const list=grid.get(address(x+dx,y+dy));if(list){parts.push(list);count+=list.length;}}
  const sorted=new Uint32Array(count);let at=0;for(const list of parts){sorted.set(list,at);at+=list.length;}sorted.sort((a,b)=>ranks[a]-ranks[b]);result.set(key,sorted);references+=count;maximum=Math.max(maximum,count);
  if(performance.now()-last>=8){await cooperate();last=performance.now();}
 }
 check();
 if(references>ranks.length*9)throw Error('Grid neighborhood ownership bound exceeded');return{lists:result,indices:references,maximum,bytes:references*4};
}
