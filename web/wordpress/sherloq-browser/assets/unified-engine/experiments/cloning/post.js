// Offline stage prototype. Product admission/cancellation are deliberately absent.
export function cluster(points, matches, distance, scalarNorm) {
  const kept=[],displacements=[];
  const norm=(a,b)=>{const dx=points[a*7]-points[b*7],dy=points[a*7+1]-points[b*7+1];return Math.sqrt(dx*dx+dy*dy);};
  for(let i=0;i<matches.length;i+=3){const d=norm(matches[i],matches[i+1]);if(d>distance){kept.push(matches[i],matches[i+1],matches[i+2]);displacements.push(d);}}
  const filtered=Float64Array.from(kept),lengths=[],groups=[];
  const scalar=(a,b)=>{
    const dx=points[a*7]-points[b*7],dy=points[a*7+1]-points[b*7+1];
    const d=Math.sqrt(dx*dx+dy*dy);
    return Math.abs(d-distance)<=Math.max(1,distance)*1e-12?scalarNorm(dx,dy):d;
  };
  for(let i=0;i<displacements.length;i++){
    const query=filtered[i*3],train=filtered[i*3+1],seen=new Set([query+':'+train]);let length=1;groups.push(i);
    for(let j=i+1;j<displacements.length;j++){
      if(Math.abs(displacements[j]-displacements[i])>distance)continue;
      const q=filtered[j*3],t=filtered[j*3+1];if(q===train&&t===query)continue;
      const aa=scalar(query,q),bb=scalar(train,t),ab=scalar(query,t),ba=scalar(train,q);
      if(!((aa>0&&aa<distance&&bb>0&&bb<distance)||(ab>0&&ab<distance&&ba>0&&ba<distance)))continue;
      if(!seen.has(t+':'+q)){groups.push(j);length++;seen.add(q+':'+t);}
    }
    lengths.push(length);
    if(groups.length*8>128*1024**2)throw Error('Cluster index budget');
  }
  return {matches:filtered,lengths:Uint32Array.from(lengths),groups:Uint32Array.from(groups)};
}
const roundEven=value=>{const low=Math.floor(value),f=value-low;return f<.5?low:f>.5?low+1:low%2===0?low:low+1;};
export function commands(points,geometry,p){
  const commands=[],angles=[];let offset=0;
  for(const length of geometry.lengths){
    if(length>=p.minimum)for(let i=offset;i<offset+length;i++){
      const at=geometry.groups[i]*3,a=geometry.matches[at]*7,b=geometry.matches[at+1]*7;
      const ax=Math.trunc(points[a]),ay=Math.trunc(points[a+1]),bx=Math.trunc(points[b]),by=Math.trunc(points[b+1]);
      let angle=Math.atan2(by-ay,bx-ax);if(angle<0)angle+=Math.PI;angles.push(angle);
      commands.push(ax,ay,bx,by,roundEven(points[a+2]),roundEven(points[b+2]),Math.trunc(angle/Math.PI*180)&255,Math.trunc(geometry.matches[at+2]/(p.matching/100*255)*255)&255);
    }
    offset+=length;
  }
  return {commands:Int32Array.from(commands),angles:Float32Array.from(angles)};
}
function sum32(a,start,length){
  const f=Math.fround;
  if(length<8){let s=-0;for(let i=0;i<length;i++)s=f(s+a[start+i]);return s;}
  if(length<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i+7<length;i+=8)for(let k=0;k<8;k++)r[k]=f(r[k]+a[start+i+k]);let s=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<length;i++)s=f(s+a[start+i]);return s;}
  let cut=Math.floor(length/2);cut-=cut%8;return f(sum32(a,start,cut)+sum32(a,start+cut,length-cut));
}
const reduce32=a=>{let value=0;for(let i=0;i<a.length;i+=8192)value=Math.fround(value+sum32(a,i,Math.min(8192,a.length-i)));return value;};
export function std32(a){
  if(!a.length)return null;
  const f=Math.fround,mean=f(reduce32(a)/a.length),delta=Float32Array.from(a,v=>f(v-mean));
  for(let i=0;i<delta.length;i++)delta[i]=f(delta[i]*delta[i]);
  return f(Math.sqrt(f(reduce32(delta)/delta.length)));
}
