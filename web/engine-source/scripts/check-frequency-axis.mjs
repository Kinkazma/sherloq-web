import {frequencyStreamMath} from '../src/frequency-stream-math.js';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const math=await frequencyStreamMath(),cases=[];
for(const [width,height]of [[3,5],[4,6],[5,7],[8,8],[16,15],[17,19],[30,32],[64,45],[1,8],[7,1]]){
 const source=Float32Array.from({length:width*height},(_,i)=>(i*73+Math.floor(i/7)*13)%256),expected=math.full(source,width,height),rows=math.axis(source,width,height,height,0),half=Math.floor(width/2)+1;
 let output=new Float32Array(rows.length);
 if(width===1)output=math.axis(source,height,1,1,0);
 else {const columns=new Float32Array(half*height*2);for(let x=0;x<half;x++)for(let y=0;y<height;y++)columns.set(rows.subarray((y*width+x)*2,(y*width+x)*2+2),(x*height+y)*2);const r=math.axis(columns,height,half,width,1);for(let x=0;x<half;x++)for(let y=0;y<height;y++)output.set(r.subarray((x*height+y)*2,(x*height+y)*2+2),(y*width+x)*2);}
 for(let y=0;y<height;y++)for(let x=(width===1?0:half);x<width;x++){if(width===1&&y<=height/2)continue;const src=(((height-y)%height)*width+(width-x)%width)*2,dst=(y*width+x)*2;output[dst]=output[src];output[dst+1]=-output[src+1];}
 let forward=0;for(let i=0;i<output.length;i++)if(output[i]!==expected[i])forward++;
 const inverseExpected=math.full(expected,width,height,true),a=math.axis(expected,width,height,height,2),b=new Float32Array(a.length);for(let x=0;x<width;x++)for(let y=0;y<height;y++)b.set(a.subarray((y*width+x)*2,(y*width+x)*2+2),(x*height+y)*2);const c=math.axis(b,height,width,width,3),actual=new Float32Array(c.length);for(let x=0;x<width;x++)for(let y=0;y<height;y++)actual.set(c.subarray((x*height+y)*2,(x*height+y)*2+2),(y*width+x)*2);
 let inverse=0;for(let i=0;i<actual.length;i++)if(actual[i]!==inverseExpected[i])inverse++;cases.push({width,height,forwardDifferences:forward,inverseDifferences:inverse});
}
await fs.writeFile('.build/frequency-axis-proof.json',JSON.stringify(cases,null,2)+'\n');console.log(cases);assert(cases.every(c=>c.forwardDifferences===0&&c.inverseDifferences===0));
