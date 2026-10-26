import {parameters,roundEven} from './pixel-utils.js';
import {checkpoint} from './errors.js';
import {VIRIDIS} from './viridis.js';
export const illuminantParams=(p={})=>parameters(p,{block:128,method:1,linear:true,exclude:true,mode:0},{method:[0,2],mode:[0,2]},{block:[32,64,128,256]},['linear','exclude']);
// NumPy's contiguous float64 pairwise sum, with the same eight accumulators.
function pairwise(a,start=0,n=a.length){
 if(n<8){let sum=-0;for(let i=0;i<n;i++)sum+=a[start+i];return sum;}
 if(n<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]+=a[start+i+j];let sum=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)sum+=a[start+i];return sum;}
 let cut=Math.floor(n/2);cut-=cut%8;return pairwise(a,start,cut)+pairwise(a,start+cut,n-cut);
}
export function illuminantEstimator(p){
 const table=Float64Array.from({length:256},(_,i)=>{const x=i/255;return p.linear?(x<=.04045?x/12.92:((x+.055)/1.055)**2.4):x;}),power=p.method===0?1:6,weights=table.map(x=>x**power),terms=new Float64Array(256);
 function estimate(hist,count){const moment=new Float64Array(3);for(let c=0;c<3;c++){
  if(p.method===2){let bin=255;while(bin>0&&!hist[c*256+bin])bin--;moment[c]=table[bin];}
  else{for(let j=0;j<256;j++)terms[j]=hist[c*256+j]*weights[j];moment[c]=(pairwise(terms)/Math.max(count,1))**(1/power);}
 }const norm=Math.sqrt(moment[0]**2+moment[1]**2+moment[2]**2);return moment.map(x=>norm?x/norm:0);}
 return estimate;
}
export function illuminantCellDisplay(unit,count,area,valid,globalRGB,p){
 const colors=new Uint8Array(3);
  const [r,g,b]=unit,[R,G,B]=globalRGB,cross=[g*B-b*G,b*R-r*B,r*G-g*R],sine=Math.sqrt(cross[0]**2+cross[1]**2+cross[2]**2),cosine=r*R+g*G+b*B;const angle=valid?Math.atan2(sine,cosine)*180/Math.PI:0;
  if(p.mode===2)colors.fill(roundEven(count/area*255),0,3);
  else if(!valid)colors.fill(64,0,3);
  else if(p.mode===1){const bin=roundEven(Math.max(0,Math.min(1,angle/90))*255);colors.set(VIRIDIS.slice(bin*3,bin*3+3),0);}
  else{const max=Math.max(...unit);for(let c=0;c<3;c++){let v=unit[c]/max;if(p.linear)v=v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;colors[c]=roundEven(Math.max(0,Math.min(1,v))*255);}}
 return {angle,color:colors};
}
export async function illuminant(image,p,hooks={}){
 const {width,height,data:input}=image,cols=Math.ceil(width/p.block),rows=Math.ceil(height/p.block),cells=cols*rows;
 const histogram=new Uint32Array(cells*768),globalHist=new Float64Array(768),areas=new Uint32Array(cells),counts=new Uint32Array(cells);
 for(let y=0;y<height;y++){if(y%32===0)await checkpoint(hooks.signal);for(let x=0;x<width;x++){
  const i=(y*width+x)*3,cell=Math.floor(y/p.block)*cols+Math.floor(x/p.block);areas[cell]++;
  if(p.exclude&&(Math.min(input[i],input[i+1],input[i+2])<=8||Math.max(input[i],input[i+1],input[i+2])>=250))continue;
  counts[cell]++;for(let c=0;c<3;c++){histogram[cell*768+c*256+input[i+c]]++;globalHist[c*256+input[i+c]]++;}
 }hooks.onProgress?.(.5*(y+1)/height);}
 const estimate=illuminantEstimator(p);
 const globalRGB=estimate(globalHist,counts.reduce((a,b)=>a+b,0)),rgb=new Float64Array(cells*3),angles=new Float64Array(cells),valid=new Uint8Array(cells),colors=new Uint8Array(cells*3);
 for(let cell=0;cell<cells;cell++){if(cell%32===0)await checkpoint(hooks.signal);const unit=estimate(histogram.subarray(cell*768,(cell+1)*768),counts[cell]);valid[cell]=Number(counts[cell]>=Math.min(16,areas[cell])&&Math.max(...unit)>0);if(!valid[cell])unit.fill(0);rgb.set(unit,cell*3);
  const display=illuminantCellDisplay(unit,counts[cell],areas[cell],valid[cell],globalRGB,p);angles[cell]=display.angle;colors.set(display.color,cell*3);
 }
 const data=new Uint8Array(input.length);for(let y=0;y<height;y++){if(y%32===0)await checkpoint(hooks.signal);for(let x=0;x<width;x++){const cell=Math.floor(y/p.block)*cols+Math.floor(x/p.block);data.set(colors.subarray(cell*3,cell*3+3),(y*width+x)*3);}hooks.onProgress?.(.5+.5*(y+1)/height);}
 return {pixels:{width,height,format:'rgb8',data},data:{rows,cols,block:p.block,rgb,counts,areas,valid,globalRGB,angles},semantics:'Local Minkowski illuminant colour estimates; surface colours also influence the result. Invalid cells remain explicit. No light direction or authenticity verdict.'};
}
