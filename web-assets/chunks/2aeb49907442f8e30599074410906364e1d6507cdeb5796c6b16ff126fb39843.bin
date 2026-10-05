import {parameters,gray,roundEven} from './pixel-utils.js';import {requireValue,checkpoint} from './errors.js';
export function magnifierParams(input={}){const p=parameters(input,{mode:'equalize',percent:20,channel:false,bounds:null},{percent:[0,100]},{mode:['equalize','contrast']},['channel']);requireValue(p.bounds===null||(Array.isArray(p.bounds)&&p.bounds.length===4&&p.bounds.every(Number.isSafeInteger)&&p.bounds[2]>=p.bounds[0]&&p.bounds[3]>=p.bounds[1]),'Bounds must be ordered integer half-open coordinates.');return p;}
export async function magnifier(image,p,hooks={}){
 const [x1,y1,x2,y2]=(p.bounds??[0,0,image.width,image.height]).map((v,i)=>Math.max(0,Math.min(i%2?image.height:image.width,v))),width=x2-x1,height=y2-y1,bounds=[x1,y1,x2,y2];
 if(!width||!height)return {data:{bounds,empty:true},semantics:'Empty clipped magnifier region; original unchanged.'};
 const n=width*height,hist=Array.from({length:4},()=>new Uint32Array(256)),data=new Uint8Array(n*3);
 for(let y=0;y<height;y++){if(y%32===0)await checkpoint(hooks.signal);for(let x=0;x<width;x++){const source=((y+y1)*image.width+x+x1)*3,target=(y*width+x)*3;data.set(image.data.subarray(source,source+3),target);for(let c=0;c<3;c++)hist[c][data[target+c]]++;hist[3][gray(...data.subarray(target,target+3))]++;}}
 function table(h){const lut=new Uint8Array(256);let low=0,high=255;while(!h[low])low++;while(!h[high])high--;
  if(p.mode==='equalize'){if(h[low]===n){lut.fill(low);return lut;}const scale=Math.fround(255/(n-h[low]));let sum=0;for(let i=low+1;i<256;i++){sum+=h[i];lut[i]=Math.min(255,roundEven(Math.fround(sum*scale)));}return lut;}
  if(p.percent){let sum=0;for(let i=0;i<256;i++){sum+=h[i]/n;if(sum>=p.percent/200){low=i;break;}}sum=0;for(let i=255;i>=0;i--){sum+=h[i]/n;if(sum>=p.percent/200){high=i;break;}}}
  for(let i=0;i<256;i++)lut[i]=low===high?255:Math.trunc(Math.max(0,Math.min(255,(255*(low-i))/(low-high))));return lut;
 }
 const luts=p.mode==='equalize'||p.channel?hist.slice(0,3).map(table):Array(3).fill(table(hist[3]));
 for(let y=0;y<height;y++){if(y%32===0)await checkpoint(hooks.signal);for(let x=0;x<width;x++)for(let c=0;c<3;c++){const i=(y*width+x)*3+c;data[i]=luts[c][data[i]];}hooks.onProgress?.((y+1)/height);}
 return {pixels:{width,height,format:'rgb8',data},data:{bounds,empty:false},layers:[{id:'inspection.magnifier',kind:'rgb',origin:[x1,y1],range:[0,255]}],semantics:'Native clipped ROI enhancement; no resizing. Region origin is carried separately from its pixels.'};
}
