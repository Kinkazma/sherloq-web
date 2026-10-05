import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {gray} from './pixel-utils.js';

const roundEven=x=>{const n=Math.floor(x),f=x-n;return f===.5?n+(n%2):Math.round(x);};
const orderBounds=(a,b)=>{for(let i=0;i<4;i++)if(a.bounds[i]!==b.bounds[i])return a.bounds[i]-b.bounds[i];return 0;};
export function textTiles(width,height){
  requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Invalid OCR image dimensions.');
  const starts=length=>{const values=[];for(let i=0;i<Math.max(1,length-1536+1);i+=1408)values.push(i);if(length>1536&&values.at(-1)!==length-1536)values.push(length-1536);return values;};
  return starts(height).flatMap(y=>starts(width).map(x=>[x,y,Math.min(width,x+1536),Math.min(height,y+1536)]));
}

// Only bounds/confidence leave preprocessing; transcribed text is not retained.
export function parseTextBoxes(tsv,origin,width,height,{maxBoxes=Infinity}={}){
  requireValue(typeof tsv==='string'&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger),'Invalid OCR TSV/origin.');
  requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Invalid OCR dimensions.');
  const lines=tsv.split(/\r?\n/),headers=lines.shift().split('\t'),columns=Object.fromEntries(headers.map((h,i)=>[h,i]));
  requireValue(['level','text','conf','left','top','width','height'].every(k=>k in columns),'Missing Tesseract TSV columns.');
  const boxes=[];
  for(const line of lines){
    const row=line.split('\t');if(row[columns.level]!=='5')continue;
    const word=(row[columns.text]??'').trim(),confidence=Number(row[columns.conf]);
    if(!Number.isFinite(confidence)||confidence<70||!/[\p{L}\p{N}]/u.test(word))continue;
    if([...word].length===1&&!(word===word.toUpperCase()&&word!==word.toLowerCase()&&confidence>=90))continue;
    const [x,y,bw,bh]=['left','top','width','height'].map(k=>Number(row[columns[k]]));
    requireValue([x,y,bw,bh].every(Number.isSafeInteger),'Invalid OCR word bounds.');
    if(bw<=0||bh<=0)continue;
    const pad=Math.max(2,roundEven(bh*.1)),bounds=[Math.max(0,x+origin[0]-pad),Math.max(0,y+origin[1]-pad),Math.min(width-1,x+origin[0]+bw-1+pad),Math.min(height-1,y+origin[1]+bh-1+pad)];
    if(bounds[2]>=bounds[0]&&bounds[3]>=bounds[1]){if(boxes.length>=maxBoxes)throw new EngineError('MEMORY_LIMIT','Too many OCR word boxes.');boxes.push({bounds,confidence});}
  }
  return boxes;
}

export async function supportedTextBoxes(image,boxes,{signal,reserveMemory}={}){
  requireValue(image?.format==='rgb8'&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'OCR background filtering requires RGB8 pixels.');
  requireValue(typeof reserveMemory==='function','OCR filtering requires shared memory admission.');
  checkAbort(signal);
  let maximumRows=0;
  for(const {bounds,confidence} of boxes){requireValue(bounds?.length===4&&bounds.every(Number.isSafeInteger)&&Number.isFinite(confidence)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<image.width&&bounds[3]<image.height&&bounds[2]>=bounds[0]&&bounds[3]>=bounds[1],'Invalid text box.');maximumRows=Math.max(maximumRows,bounds[3]-bounds[1]+1);}
  reserveMemory(256*4+maximumRows*4+boxes.length*96);
  const histogram=new Uint32Array(256),rows=new Uint32Array(maximumRows),accepted=[];
  let lastYield=performance.now();
  const checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  for(const box of boxes){
    const [x,y,r,b]=box.bounds,w=r-x+1,h=b-y+1;histogram.fill(0);rows.fill(0);
    for(let yy=y;yy<=b;yy++){
      for(let xx=x;xx<=r;xx++){const at=(yy*image.width+xx)*3;histogram[gray(image.data[at],image.data[at+1],image.data[at+2])]++;}
      await checkpoint();
    }
    let peak=0;for(let k=1;k<256;k++)if(histogram[k]>histogram[peak])peak=k;
    let flat=0;
    for(let yy=y;yy<=b;yy++){
      for(let xx=x;xx<=r;xx++){const at=(yy*image.width+xx)*3;if(Math.abs(gray(image.data[at],image.data[at+1],image.data[at+2])-peak)<=5){rows[yy-y]++;flat++;}}
      await checkpoint();
    }
    if(flat/(w*h)<.45)continue;
    let bestStart=0,bestLength=0,start=0,length=0;
    for(let yy=0;yy<h;yy++){
      if(rows[yy]/w>=.2){if(length===0)start=yy;length++;if(length>bestLength){bestStart=start;bestLength=length;}}
      else length=0;
    }
    if(bestLength<Math.max(4,h*.45))continue;
    accepted.push({bounds:[x,y+bestStart,r,y+bestStart+bestLength-1],confidence:box.confidence});
  }
  checkAbort(signal);return accepted;
}

export function deduplicateTextBoxes(boxes){
  const selected=[];
  for(const box of [...boxes].sort((a,b)=>b.confidence-a.confidence||orderBounds(a,b))){
    const [x,y,r,b]=box.bounds,area=(r-x+1)*(b-y+1);
    if(selected.some(({bounds:[xx,yy,rr,bb]})=>Math.max(0,Math.min(r,rr)-Math.max(x,xx)+1)*Math.max(0,Math.min(b,bb)-Math.max(y,yy)+1)/Math.max(1,Math.min(area,(rr-xx+1)*(bb-yy+1)))>.8))continue;
    selected.push({bounds:[...box.bounds],confidence:box.confidence});
  }
  return selected.sort(orderBounds);
}
export const textPolygons=boxes=>boxes.map(({bounds:[x,y,r,b]})=>[[x,y],[r,y],[r,b],[x,b]]);
