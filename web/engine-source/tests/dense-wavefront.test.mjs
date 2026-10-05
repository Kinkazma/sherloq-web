import test from 'node:test';
import assert from 'node:assert/strict';
import {DenseWavefront} from '../src/dense-wavefront.js';

test('every asynchronously completed row segment respects all first and second order predecessors',()=>{
 for(const [width,height] of [[1,19],[2,13],[47,31],[129,67]])for(const workers of [1,2,4,11]){
  const wave=new DenseWavefront(width,height),complete=new Uint8Array(width*height),active=[];let ticks=0;
  while(!wave.done){
   while(active.length<workers){const task=wave.take(3+(ticks%11));if(!task)break;
    for(let i=task.begin;i<task.end;i++){const x=i%width,y=i/width|0;for(const [dx,dy] of [[-1,0],[0,-1],[-1,-1],[1,-1]])for(const scale of [1,2]){const xx=x+dx*scale,yy=y+dy*scale;if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=yy*width+xx;assert.ok(complete[j]||(j>=task.begin&&j<i),'unpublished predecessor '+[width,height,workers,i,j]);}}
    active.push(task);
   }
   assert.ok(active.length,'wavefront deadlock');const at=(ticks++*7)%active.length,task=active.splice(at,1)[0];for(let i=task.begin;i<task.end;i++){assert.equal(complete[i],0);complete[i]=1;}wave.finish(task);
  }
  assert.equal(active.length,0);assert.ok(complete.every(x=>x===1));
 }
});
