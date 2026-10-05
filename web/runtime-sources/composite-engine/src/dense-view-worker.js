import {createDenseRegions} from './dense-regions.js';
let math,renderer;
self.onmessage=async({data:p})=>{try{let result;
 if(p.command==='init'){math=await createDenseRegions();renderer=math.renderer({width:p.width,height:p.height},p.points,p.pairs,p.colors,{stored:true});result={heapBytes:math.heapBytes};}
 else if(p.command==='write'){renderer.write(p.bytes,p.offset);result={};}
 else if(p.command==='overlap')result={overlap:renderer.overlap(p.a,p.b)};
 else if(p.command==='group'){renderer.group(p.rows,p.color,p.flags);result={heapBytes:math.heapBytes};}
 else if(p.command==='read')result={bytes:renderer.pixels(p.offset,p.length),heapBytes:math.heapBytes};
 else throw Error('Unknown dense renderer command');
 self.postMessage({result},result.bytes?[result.bytes.buffer]:[]);
 }catch(e){self.postMessage({error:{code:e.code??'NUMERIC_RANGE',message:e.message}});}};
