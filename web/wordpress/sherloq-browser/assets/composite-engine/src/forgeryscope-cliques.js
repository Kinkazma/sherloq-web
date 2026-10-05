import {checkpoint,requireValue} from './errors.js';
import {numpySum} from './numpy-sum.js';

// Integer-only CPython 3.11 set iteration, needed because the native clique
// merger gives shared edges to the first largest clique. JS insertion order
// changes that result. Reference algorithm: CPython Objects/setobject.c (PSF).
// https://github.com/python/cpython/blob/v3.11.9/Objects/setobject.c
class IntSet {
  constructor(values=[]){this.table=Array(8);this.size=0;this.fill=0;for(const x of values)this.add(x);}
  *[Symbol.iterator](){for(const x of this.table)if(x!==undefined&&x!==null)yield x;}
  slot(value,inserting=false){
    const mask=this.table.length-1;let i=value&mask,perturb=value,free=-1;
    for(;;){
      const end=i+(i+9<=mask?9:0);
      for(let j=i;j<=end;j++){
        const key=this.table[j];
        if(key===undefined)return inserting&&free>=0?free:j;
        if(key===value)return j;
        if(key===null)free=j;
      }
      perturb=Math.floor(perturb/32);i=(i*5+1+perturb)&mask;
    }
  }
  has(x){return this.table[this.slot(x)]===x;}
  clean(x){this.table[this.slot(x)]=x;}
  resize(minimum){
    let n=8;while(n<=minimum)n*=2;
    const old=[...this];this.table=Array(n);this.fill=this.size;for(const x of old)this.clean(x);
  }
  add(x){
    const i=this.slot(x,true),old=this.table[i];if(old===x)return this;
    this.table[i]=x;this.size++;
    if(old===undefined){this.fill++;if(this.fill*5>=(this.table.length-1)*3)this.resize(this.size*(this.size>50000?2:4));}
    return this;
  }
  delete(x){const i=this.slot(x);if(this.table[i]===x){this.table[i]=null;this.size--;}}
  merge(other){
    if(!other.size)return this;
    if((this.fill+other.size)*5>=(this.table.length-1)*3)this.resize((this.size+other.size)*2);
    if(!this.fill&&this.table.length===other.table.length&&other.fill===other.size){this.table=other.table.slice();this.size=other.size;this.fill=other.fill;}
    else if(!this.fill){for(const x of other)this.clean(x);this.size=other.size;this.fill=other.size;}
    else for(const x of other)this.add(x);
    return this;
  }
  copy(){return new IntSet().merge(this);}
  unionOne(x){return this.copy().merge(new IntSet([x]));}
  intersection(other){
    let large=this,small=other;if(other.size>this.size)[large,small]=[other,this];
    const result=new IntSet();for(const x of small)if(large.has(x))result.add(x);return result;
  }
}

/** Metadata only: callers keep pair geometry, never one full image per clique.
 * A group mask is the union of original_indices, preserving duplicate overwrite
 * and native first-clique ownership. No clique is silently truncated.
 */
export async function forgeryscopeCliqueGroups(info,{signal}={}){
  const graph=new Map(),pairs=new Map(),cliques=[];
  for(let i=0;i<info.length;i++){
    const {panel_id0:a,panel_id1:b}=info[i];
    requireValue(Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a!==b&&a<=0x7fffffff&&b<=0x7fffffff,'Invalid clique panel IDs.');
    if(!graph.has(a))graph.set(a,new IntSet());if(!graph.has(b))graph.set(b,new IntSet());
    graph.get(a).add(b);graph.get(b).add(a);pairs.set(`${Math.min(a,b)}:${Math.max(a,b)}`,i);
  }
  let steps=0;
  async function search(r,p,x){
    if(++steps%128===0)await checkpoint(signal);
    if(!p.size&&!x.size){if(r.size>1)cliques.push([...r]);return;}
    for(const v of [...p]){
      const n=graph.get(v);await search(r.unionOne(v),p.intersection(n),x.intersection(n));p.delete(v);x.add(v);
    }
  }
  await checkpoint(signal);
  await search(new IntSet(),new IntSet(graph.keys()),new IntSet());
  cliques.sort((a,b)=>b.length-a.length);
  const used=new Set(),result=[];
  function group(panelIds,indices){
    const polys=[],scores=new Float64Array(indices.length);let inliers=0;
    indices.forEach((index,j)=>{const item=info[index];polys.push(item.poly_coords0,item.poly_coords1);inliers+=item.match_result.inliers;scores[j]=item.match_result.mean_match_score;});
    return {panel_ids:panelIds,n_panels:panelIds.length,n_pairs:indices.length,avg_match_score:numpySum(scores)/scores.length,total_inliers:inliers,all_poly_coords:polys,original_indices:indices};
  }
  for(const clique of cliques){
    if(clique.length<3)continue;
    clique.sort((a,b)=>a-b);const indices=[];
    for(let i=0;i<clique.length;i++)for(let j=i+1;j<clique.length;j++){
      const key=`${clique[i]}:${clique[j]}`;if(!used.has(key)&&pairs.has(key)){indices.push(pairs.get(key));used.add(key);}
    }
    if(indices.length)result.push(group(clique,indices));
  }
  for(const [key,index] of pairs)if(!used.has(key))result.push(group(key.split(':').map(Number),[index]));
  return result;
}
