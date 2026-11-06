import {requireValue} from './errors.js';
// Row segments form the exact x+2y wavefront, including the second-order
// upper-right dependency. A row is published only after its writes are flushed.
export class DenseWavefront {
 constructor(width,height){requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'Invalid wavefront shape.');this.width=width;this.height=height;this.positions=new Int32Array(height);this.running=new Uint8Array(height);this.first=0;this.completed=0;}
 take(pixels=1024){
  const {width,height,positions,running}=this;
  for(let row=this.first;row<height;row++){
   const begin=positions[row];if(begin===width||running[row])continue;
   let end=Math.min(width,begin+pixels);
   if(row&&positions[row-1]<width)end=Math.min(end,positions[row-1]-1);
   if(row>1&&positions[row-2]<width)end=Math.min(end,positions[row-2]-2);
   if(end<=begin){if(begin===0)break;continue;}
   running[row]=1;return {row,begin:row*width+begin,end:row*width+end};
  }
  return null;
 }
 finish(task){const {row,begin,end}=task;requireValue(this.running[row]===1&&this.positions[row]===begin-row*this.width,'Invalid wavefront completion.');this.running[row]=0;this.positions[row]=end-row*this.width;this.completed+=end-begin;while(this.first<this.height&&this.positions[this.first]===this.width)this.first++;}
 retry(task){requireValue(this.running[task.row]===1,'Invalid wavefront retry.');this.running[task.row]=0;}
 get done(){return this.first===this.height;}
}
