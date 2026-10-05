import {pairedBiomes} from './copy-biomes.js';
import {roundEven,distinctCentres,geometricErrors,median} from './copy-geometry.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

function hsvToBgr(h,s,v){
  if(!s)return [v,v,v].map(x=>roundEven(x*255));
  const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));
  const rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];return rgb.reverse().map(x=>roundEven(x*255));
}
function bgrToHsv(bgr){
  const [b,g,r]=Array.from(bgr,x=>x/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),range=hi-lo;
  if(!range)return [0,0,hi];const rc=(hi-r)/range,gc=(hi-g)/range,bc=(hi-b)/range;
  const h=r===hi?bc-gc:g===hi?2+rc-bc:4+gc-rc;
  return [((h/6)%1+1)%1,range/hi,hi];
}
export function copyPalette(groups,pairs,threshold,{reserveMemory}={}){
  requireValue(typeof reserveMemory==='function'&&Number.isFinite(threshold)&&threshold>0,'Invalid copy palette settings.');
  reserveMemory(pairs.length/4*3+groups.length*96);const colors=new Uint8Array(pairs.length/4*3),bases=[];
  groups.forEach((group,i)=>{const hue=(.76+i*.618033988749895)%1,band=Math.min(1/12,.3/Math.max(1,groups.length));bases.push(hsvToBgr(hue,.75,.95));
    group.forEach((row,j)=>{const offset=group.length>1?(j===group.length-1?band/2:-band/2+j*(band/(group.length-1))):0,value=.4+.6*Math.min(1,pairs[row*4+2]/Math.max(threshold,1e-9));colors.set(hsvToBgr(((hue+offset)%1+1)%1,.8,value),row*3);});
  });return {colors,bases};
}
export async function refineCopyBiomes(points,pairs,groups,models,colors,bases,tolerance,{signal,reserveMemory,pairSearchRegions=null}={}){
  requireValue(typeof reserveMemory==='function'&&colors instanceof Uint8Array&&colors.length===pairs.length/4*3&&bases.length===groups.length&&(!models.length||models.length===groups.length),'Invalid sub-biome input.');
  reserveMemory(colors.byteLength+pairs.length/4*160+4096);const outputColors=colors.slice(),refined=[],fitted=[],shades=[],provenance=[];
  for(let parent=0;parent<groups.length;parent++){
    await controlCheckpoint(signal);const group=groups[parent],localPairs=new Float64Array(group.length*4),owners=pairSearchRegions?new Int32Array(group.length):null;
    group.forEach((row,i)=>{localPairs.set(pairs.subarray(row*4,row*4+4),i*4);if(owners)owners[i]=pairSearchRegions[row];});
    const components=await pairedBiomes(points,localPairs,tolerance,{signal,reserveMemory,pairSearchRegions:owners});
    for(let number=0;number<components.length;number++){
      const indices=components[number],part=Uint32Array.from(indices,i=>group[i]);let model=models[parent]??null,color=bases[parent];
      if(components.length>1){
        let [h,s,v]=bgrToHsv(color);h=((h+(number/Math.max(1,components.length-1)-.5)*.045)%1+1)%1;color=hsvToBgr(h,s,v);
        for(const row of part){const [,sat,val]=bgrToHsv(outputColors.subarray(row*3,row*3+3));outputColors.set(hsvToBgr(h,sat,val),row*3);}
        if(model){
          const source=Array.from(indices,i=>model.source_point_indices[i]),target=Array.from(indices,i=>model.destination_point_indices[i]);
          const a=Float64Array.from(source.flatMap(i=>[points[i*7],points[i*7+1]])),b=Float64Array.from(target.flatMap(i=>[points[i*7],points[i*7+1]])),errors=geometricErrors(a,b,model.matrix.flat());
          model={...model,source_point_indices:source,destination_point_indices:target,inliers:part.length,parent_inliers:group.length,post_geometry_partition:true,distinct_centres:[distinctCentres(a),distinctCentres(b)],median_error_px:median(errors),maximum_error_px:errors.reduce((a,b)=>Math.max(a,b),0)};
        }
      }
      refined.push(part);shades.push(color);if(models.length)fitted.push(model);provenance.push({parent,part:number,parts:components.length,parent_matches:group.length});
    }
  }
  checkAbort(signal);return {groups:refined,models:fitted,colors:outputColors,bases:shades,provenance};
}
