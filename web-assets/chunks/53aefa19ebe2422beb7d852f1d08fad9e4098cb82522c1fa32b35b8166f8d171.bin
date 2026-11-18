import "../../runtime-context.js?v=0.33.3";
import {requireValue} from './errors.js';
const integer=n=>Number.isSafeInteger(n), positive=n=>integer(n)&&n>0;
const plainRect=r=>r&&[r.x,r.y,r.width,r.height].every(integer)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0;
const immutable=v=>{if(Array.isArray(v))return Object.freeze(v.map(immutable));if(v&&typeof v==='object')return Object.freeze(Object.fromEntries(Object.entries(v).map(([k,x])=>[k,immutable(x)])));return v;};
// A small factual subset of the already admitted LibRaw metadata. Neither
// calibration arrays, a camera transform nor a developed pixel enters it.
export function rawSensorFacts(header){
 const g=header?.geometry,c=header?.cfa;
 requireValue(['uint16','float32'].includes(header?.sampleType)&&[1,3,4].includes(header.channels)&&[header.width,header.height].every(positive)&&header.orientationApplied===false&&header.selectedFrame===0&&g&&plainRect(g.activeArea)&&g.activeArea.x+g.activeArea.width<=header.width&&g.activeArea.y+g.activeArea.height<=header.height&&Number.isFinite(g.pixelAspect)&&g.pixelAspect>0&&integer(g.librawFlip)&&g.librawFlip>=0&&g.librawFlip<=7&&integer(c?.filterCode)&&c.filterCode>=0&&c.filterCode<=0xffffffff&&typeof c.colorDescription==='string'&&c.colorDescription.length<=5,'Invalid preserved sensor geometry/CFA metadata.');
 const pattern=p=>Array.isArray(p)&&p.length===6&&p.every(row=>Array.isArray(row)&&row.length===6&&row.every(v=>integer(v)&&v>=0&&v<4));
 requireValue(pattern(c.xtransSensorPattern),'Invalid preserved X-Trans sensor pattern.');
 const d=header.rawDemosaic;requireValue(d===undefined||d&&['bayer-rgb','linear','xtrans','other-cfa'].includes(d.kind)&&typeof d.applicable==='boolean'&&(!d.applicable||Array.isArray(d.methods)&&d.methods.join(',')==='0,3,4'),'Invalid RAW development capability metadata.');
 const kind=header.channels===1&&c.filterCode!==0?'cfa':header.channels===1?'monochrome':'linear';
 return immutable({schema:'sherloq.raw-sensor-facts/1',kind,width:header.width,height:header.height,channels:header.channels,sampleType:header.sampleType,orientation:1,demosaic:d?{kind:d.kind,applicable:d.applicable,methods:d.applicable?[...d.methods]:[]}:null,activeArea:{...g.activeArea},pixelAspect:g.pixelAspect,librawFlip:g.librawFlip,cfa:kind==='cfa'?{filterCode:c.filterCode,colorDescription:c.colorDescription,xtransSensorPattern:c.xtransSensorPattern}:null});
}
export function sensorFilterCode(facts,x,y){
 requireValue(facts?.schema==='sherloq.raw-sensor-facts/1'&&facts.kind==='cfa'&&integer(x)&&integer(y)&&x>=0&&y>=0&&x<facts.width&&y<facts.height,'A sensor site and preserved CFA pattern are required.');
 const c=facts.cfa;return c.filterCode===9?c.xtransSensorPattern[y%6][x%6]:(c.filterCode>>>(((((y<<1)&14)+(x&1))<<1)))&3;
}
export function sensorFilterName(facts,x,y){const code=sensorFilterCode(facts,x,y);return facts.cfa.colorDescription[code]||'C'+code;}
// The development crop/flip is an explicit geometric relation. This does not
// assert that an interpolated RGB value is the value at the raw sensor site.
export function rawSensorGridMap(facts,development,display){
 const d=development,r=d?.rawOrigin,u=d?.unorientedSize,o=d?.outputSize;
 requireValue(facts?.schema==='sherloq.raw-sensor-facts/1'&&facts.pixelAspect===1&&d?.rawGrid?.width===facts.width&&d.rawGrid.height===facts.height&&d.rawGrid.orientation===1&&d.sensorSamplesCropped===false&&d.orientationApplied===true&&d.librawFlip===facts.librawFlip&&r&&[r.x,r.y].every(integer)&&r.x>=0&&r.y>=0&&u&&[u.width,u.height].every(positive)&&r.x+u.width<=facts.width&&r.y+u.height<=facts.height&&o&&o.width===display?.width&&o.height===display?.height&&o.width===(d.librawFlip&4?u.height:u.width)&&o.height===(d.librawFlip&4?u.width:u.height),'The displayed RAW crop/rotation is not proven to map one-to-one to this sensor grid.');
 const orientation=[1,2,4,3,5,8,6,7][d.librawFlip],w=u.width,h=u.height;
 function unorient(x,y,boundary=false){const W=boundary?w:w-1,H=boundary?h:h-1;switch(orientation){case 2:return[W-x,y];case 3:return[W-x,H-y];case 4:return[x,H-y];case 5:return[y,x];case 6:return[y,H-x];case 7:return[W-y,H-x];case 8:return[W-y,x];default:return[x,y];}}
 function orient(x,y,boundary=false){const W=boundary?w:w-1,H=boundary?h:h-1;switch(orientation){case 2:return[W-x,y];case 3:return[W-x,H-y];case 4:return[x,H-y];case 5:return[y,x];case 6:return[H-y,x];case 7:return[H-y,W-x];case 8:return[y,W-x];default:return[x,y];}}
 return Object.freeze({sensorWidth:facts.width,sensorHeight:facts.height,displayWidth:o.width,displayHeight:o.height,
  toSensor(x,y){requireValue(integer(x)&&integer(y)&&x>=0&&y>=0&&x<o.width&&y<o.height,'Point outside displayed RAW.');const p=unorient(x,y);return{x:p[0]+r.x,y:p[1]+r.y};},
  toDisplay(x,y){const p=orient(x-r.x,y-r.y);return{x:p[0],y:p[1]};},
  displayRect(rect){requireValue(plainRect(rect),'A sensor rectangle is required.');const corners=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>orient(x-r.x,y-r.y,true)),xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};},
  relation:'pixel-centre crop/flip only; sensor samples remain uninterpolated'});
}
