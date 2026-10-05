import {requireValue} from './errors.js';
export function enclosingCopyRegions(regions){
 if(!regions.length)return null;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const polygon of regions)for(const [x,y]of polygon){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
}
const bounds=poly=>{const p=enclosingCopyRegions([poly]);return [p[0],p[2]];};
const diagonal=poly=>{const [a,b]=bounds(poly);return Math.sqrt((b[0]-a[0])**2+(b[1]-a[1])**2);};
export function copyDistancePolicy({radius,autoRadius=false,compact=false,compare=false},regions){
 requireValue(!compare||regions.length===2,'Compare requires two regions.');
 let gap=[0,0];
 if(compare&&compact){const [alo,ahi]=bounds(regions[0]),[blo,bhi]=bounds(regions[1]);gap=[0,1].map(i=>blo[i]>ahi[i]?Math.max(0,blo[i]-ahi[i]-1):alo[i]>bhi[i]?-Math.max(0,alo[i]-bhi[i]-1):0);}
 const radii=regions.length?regions.map(poly=>autoRadius?Math.max(.01,diagonal(poly)):radius):[radius];
 if(compare&&autoRadius)radius=Math.max(.01,diagonal([...regions[0],...regions[1].map(([x,y])=>[x-gap[0],y-gap[1]])]));
 else if(autoRadius&&regions.length)radius=radii.reduce((a,b)=>Math.max(a,b),0);
 return {radius,radii,gap};
}
export function compactCopyAxes(width,height,regions,{reserveMemory}={}){
 if(!regions.length)return null;requireValue(typeof reserveMemory==='function','Compact axes require shared admission.');reserveMemory((width+height)*5);const axes=[];
 for(const [axis,length]of [[0,width],[1,height]]){
  const occupied=new Uint8Array(length);for(const poly of regions){const [a,b]=bounds(poly),lo=Math.max(0,Math.floor(a[axis])),hi=Math.min(length,Math.ceil(b[axis])+1);occupied.fill(1,lo,Math.max(lo,hi));}
  let total=0;const output=new Float32Array(length);for(let i=0;i<length;i++){total+=occupied[i];output[i]=total-1;}axes.push(output);
 }return axes;
}
