/** Native YOLOv11 public profiles: decoded BCN tensors -> NMS -> source boxes.
 * Model execution and memory admission are supplied by the network runtime.
 */
import {checkAbort, checkpoint, requireValue} from './errors.js';
const f = Math.fround;
export const roundEven = x => {const a=Math.floor(x), r=x-a;return r<.5?a:r>.5?a+1:a%2===0?a:a+1;};

export function yoloLetterboxShape(width,height,{side=640,stride=32}={}) {
  requireValue([width,height,side,stride].every(x=>Number.isSafeInteger(x)&&x>0),'Invalid YOLO dimensions.');
  const gain=Math.min(side/width,side/height), resizedWidth=roundEven(width*gain), resizedHeight=roundEven(height*gain);
  requireValue(resizedWidth>0&&resizedHeight>0,'Image aspect ratio yields an empty YOLO resize.');
  const dw=(side-resizedWidth)%stride, dh=(side-resizedHeight)%stride;
  return {width:resizedWidth+dw,height:resizedHeight+dh,resizedWidth,resizedHeight,left:roundEven(dw/2-.1),top:roundEven(dh/2-.1),gain};
}

const offsetBox = row => row.slice(0,4).map(x=>f(x+row[5]*7680));
function iou(a,b) {
  const inter=f(Math.max(0,f(Math.min(a[2],b[2])-Math.max(a[0],b[0])))*Math.max(0,f(Math.min(a[3],b[3])-Math.max(a[1],b[1]))));
  const areaA=f(f(a[2]-a[0])*f(a[3]-a[1])),areaB=f(f(b[2]-b[0])*f(b[3]-b[1]));
  return f(inter/f(f(areaA+areaB)-inter));
}

export async function decodeForgeryscopeYolo(predictions,{anchors,classes,width,height,inputWidth,inputHeight,kind='panels',signal}={}) {
  requireValue(['panels','lanes'].includes(kind),'Invalid YOLO profile.');
  requireValue(predictions instanceof Float32Array&&Number.isSafeInteger(anchors)&&anchors>0&&Number.isSafeInteger(classes)&&classes>0&&predictions.length===(4+classes)*anchors,'Invalid YOLO decoded tensor.');
  requireValue([width,height,inputWidth,inputHeight].every(x=>Number.isSafeInteger(x)&&x>0),'Invalid YOLO source dimensions.');
  const confidence=f(kind==='panels'?.7:.3),overlap=kind==='panels'?.4:.1,rows=[];
  for(let i=0;i<anchors;i++) {
    if(i%1024===0) await checkpoint(signal);
    let cls=0,score=predictions[4*anchors+i];
    for(let c=1;c<classes;c++) if(predictions[(4+c)*anchors+i]>score){cls=c;score=predictions[(4+c)*anchors+i];}
    requireValue(Number.isFinite(score),'Nonfinite YOLO score.');
    if(score<=confidence) continue;
    const x=predictions[i],y=predictions[anchors+i],w=predictions[2*anchors+i],h=predictions[3*anchors+i];
    requireValue([x,y,w,h].every(Number.isFinite),'Nonfinite YOLO box.');
    rows.push([f(x-f(w/2)),f(y-f(h/2)),f(x+f(w/2)),f(y+f(h/2)),score,cls]);
  }
  rows.sort((a,b)=>b[4]-a[4]);rows.length=Math.min(rows.length,30000);
  const kept=[],offsets=rows.map(offsetBox),suppressed=new Uint8Array(rows.length);
  for(let i=0;i<rows.length&&kept.length<300;i++) {
    if(suppressed[i])continue;
    await checkpoint(signal);kept.push(rows[i]);
    for(let j=i+1;j<rows.length;j++) if(!suppressed[j]&&iou(offsets[i],offsets[j])>overlap)suppressed[j]=1;
  }
  // Native scale_boxes recomputes gain from actual rectangular tensor dimensions.
  const gain=Math.min(inputHeight/height,inputWidth/width),gx=f(gain);
  const px=roundEven((inputWidth-roundEven(width*gain))/2-.1),py=roundEven((inputHeight-roundEven(height*gain))/2-.1);
  for(const box of kept)for(let c=0;c<4;c++)box[c]=Math.min(c%2?height:width,Math.max(0,f(f(box[c]-(c%2?py:px))/gx)));
  checkAbort(signal);return kept;
}

export function parseForgeryscopePanels(boxes,names) {
  const excluded=new Set(['Graphs','Flow Cytometry','Body Imaging']);
  return boxes.filter(b=>!excluded.has(names[b[5]])&&f(b[2]-b[0])>=5&&f(b[3]-b[1])>=5)
    .map(b=>{requireValue(typeof names[b[5]]==='string','Unknown YOLO class.');return [names[b[5]],roundEven(b[4]*1000)/1000,...b.slice(0,4)];});
}
