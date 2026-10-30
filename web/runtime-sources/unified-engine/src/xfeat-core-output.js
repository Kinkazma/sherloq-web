import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
export function validateXfeatCoreGeometry(width,height,core){
 requireValue(Array.isArray(core)&&core.length===4,'XFeat core inventory differs.');
 const [x,y,w,h]=core;
 requireValue([width,height,x,y,w,h].every(Number.isSafeInteger)&&width>0&&height>0&&width%8===0&&height%8===0&&x>=0&&y>=0&&w>0&&h>0&&x%8===0&&y%8===0&&w%8===0&&h%8===0&&x+w<=width&&y+h<=height,'XFeat core output geometry differs.');
}
/** The historical xfeat-paged-worker core copy, shared without new arithmetic. */
export function copyXfeatCoreOutput(output,width,height,core,allocate=(Type,length)=>new Type(length)){
 validateXfeatCoreGeometry(width,height,core);const[x,y,w,h]=core;
 requireValue(output.heat?.data instanceof Float32Array&&output.heat.data.length===width*height&&output.features?.data instanceof Float32Array&&output.features.data.length===width*height&&output.reliability?.data instanceof Float32Array&&output.reliability.data.length===width*height/64,'Pinned XFeat raw output shape differs.');
 const heat=allocate(Float32Array,w*h),dense=allocate(Float32Array,w*h),reliability=allocate(Float32Array,w*h/64),fw=width/8,fh=height/8,cw=w/8,ch=h/8;
 for(let yy=0;yy<h;yy++)heat.set(output.heat.data.subarray((y+yy)*width+x,(y+yy)*width+x+w),yy*w);
 for(let yy=0;yy<ch;yy++)for(let xx=0;xx<cw;xx++){const from=(y/8+yy)*fw+x/8+xx,to=yy*cw+xx;reliability[to]=output.reliability.data[from];for(let c=0;c<64;c++)dense[to*64+c]=output.features.data[c*fw*fh+from];}
 return{heat,dense,reliability};
}
