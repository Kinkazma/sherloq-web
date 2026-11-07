// Native word/line boxes place browser-selectable text over the raster. Glyph
// advances are fitted with browser font metrics: OCR does not supply native
// per-character geometry, so this is not a character-localization assertion.
const styles=new WeakMap();
// Native OCR lines determine reading order; top-coordinate sorting alone can
// put an ascender in the next word before the first word of the same line.
function readingLines(presentation){
 const regions=presentation.regions,native=presentation.lines;
 if(Array.isArray(native)&&native.length&&native.every(line=>Array.isArray(line.regions)))return native.map(line=>[...line.regions].sort((a,b)=>(a.bounds?.[0]??0)-(b.bounds?.[0]??0)));
 const groups=new Map();let anonymous=0;
 for(const region of regions){let key=region.lineKey??region.lineId??region.line;if(key===undefined){const box=ocrTextBox(region);if(!box)continue;key=[...groups].find(([,words])=>{const first=words[0],b=ocrTextBox(first);return first.lineKey===undefined&&first.lineId===undefined&&first.line===undefined&&b&&Math.abs(b.y-box.y)<=Math.max(b.height,box.height)*.5;})?.[0]??Symbol(anonymous++);}const line=groups.get(key)??[];line.push(region);groups.set(key,line);}
 return [...groups.values()].map(words=>words.sort((a,b)=>(a.bounds?.[0]??0)-(b.bounds?.[0]??0)));
}
function retainStyles(parent){const owner=parent.ownerDocument,root=parent.getRootNode?.(),target=root?.nodeType===11?root:owner.head??parent;let entry=styles.get(target);if(!entry){const link=owner.createElement('link');link.rel='stylesheet';link.href=new URL('./ocr-text-layer.css',import.meta.url).href;link.dataset.ocrTextLayerStyles='true';target.append(link);entry={link,count:0};styles.set(target,entry);}entry.count++;return()=>{if(!--entry.count){entry.link.remove();styles.delete(target);}};}
export function ocrTextBox(region){
 const b=region?.bounds;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=b[0]||b[3]<=b[1])return null;let x=b[0],y=b[1],width=b[2]-b[0],height=b[3]-b[1],angle=0;
 const polygon=region.polygon;if(Array.isArray(polygon)&&polygon.length>=4&&polygon.every(point=>Array.isArray(point)&&point.length>=2&&point.slice(0,2).every(Number.isFinite))){const a=polygon[0],z=polygon[1],d=polygon.at(-1),dx=z[0]-a[0],dy=z[1]-a[1],length=Math.hypot(dx,dy),h=length?Math.abs(dx*(d[1]-a[1])-dy*(d[0]-a[0]))/length:0;if(length>0&&h>0){x=a[0];y=a[1];width=length;height=h;angle=Math.atan2(dy,dx);}}
 return{x,y,width,height,angle};
}
export function createOcrTextLayer({document=globalThis.document,parent,language=()=> 'fr'}={}){
 if(!parent)throw new TypeError('OCR text layer requires its image viewport.');const owner=parent.ownerDocument??document,element=document.createElement('div'),plane=document.createElement('div'),canvas=document.createElement('canvas'),measure=canvas.getContext?.('2d'),releaseStyles=retainStyles(parent);
 element.className='ocr-text-layer';element.hidden=true;element.dataset.ocrTextLayer='true';element.setAttribute('role','document');plane.className='ocr-text-plane';element.append(plane);parent.append(element);let disposed=false,lastRegions,lastLines,lastThreshold,lastSource,lastView;
 const isTextTarget=value=>{const target=value?.target??value;return !!target?.closest?.('.ocr-text-span')&&element.contains(target);};
 const stopTextPointer=e=>{if(isTextTarget(e))e.stopPropagation();};for(const name of ['pointerdown','dblclick','dragstart'])element.addEventListener(name,stopTextPointer);
 const clearSelection=()=>{const selection=owner.getSelection?.()??owner.defaultView?.getSelection?.();if(selection&&(element.contains(selection.anchorNode)||element.contains(selection.focusNode)))selection.removeAllRanges();};
 function clear(){clearSelection();plane.replaceChildren();element.hidden=true;lastRegions=lastLines=lastThreshold=lastSource=lastView=undefined;}
 function update({presentation,camera,enabled=true}={}){
  if(disposed)return;const source=presentation?.source,regions=presentation?.regions,threshold=Number.isFinite(presentation?.threshold)?Math.max(0,Math.min(1,presentation.threshold)):0;
  if(!enabled||!source||!Number.isSafeInteger(source.width)||source.width<1||!Number.isSafeInteger(source.height)||source.height<1||!Array.isArray(regions)||!camera||![camera.scale,camera.x,camera.y].every(Number.isFinite)||camera.scale<=0){if(!element.hidden||lastRegions)clear();return;}
  element.setAttribute('aria-label',language()==='fr'?'Texte reconnu dans l’image':'Recognized image text');plane.style.transform=`matrix(${camera.scale},0,0,${camera.scale},${camera.x},${camera.y})`;plane.style.width=source.width+'px';plane.style.height=source.height+'px';
  if(lastRegions!==regions||lastLines!==presentation.lines||lastThreshold!==threshold||lastSource!==source.id||lastView!==presentation.view){
   clearSelection();plane.replaceChildren();let previousLine;
   for(const [lineIndex,line]of readingLines(presentation).entries())for(const region of line){const score=region.score??region.confidence/100,box=ocrTextBox(region),text=region.text;if(!box||typeof text!=='string'||!text.length||!Number.isFinite(score)||score<threshold)continue;
    if(previousLine!==undefined)plane.append(owner.createTextNode(previousLine===lineIndex?' ':'\n'));
    const span=document.createElement('span');span.className='ocr-text-span';span.dataset.ocrRegion=String(region.id??region.index??'');span.textContent=text;const fontSize=box.height,font=`${fontSize}px sans-serif`;if(measure)measure.font=font;const natural=measure?.measureText?.(text)?.width||Math.max(1,text.length*fontSize*.6);span.style.left=box.x+'px';span.style.top=box.y+'px';span.style.width=natural+'px';span.style.height=box.height+'px';span.style.fontSize=fontSize+'px';span.style.transform=`rotate(${box.angle}rad) scaleX(${box.width/natural})`;plane.append(span);previousLine=lineIndex;
   }
   lastRegions=regions;lastLines=presentation.lines;lastThreshold=threshold;lastSource=source.id;lastView=presentation.view;
  }
  element.hidden=!plane.querySelector('.ocr-text-span');
 }
 return{element,update,clear,isTextTarget,dispose(){if(disposed)return;clear();disposed=true;for(const name of ['pointerdown','dblclick','dragstart'])element.removeEventListener(name,stopTextPointer);element.remove();releaseStyles();canvas.width=canvas.height=0;}};
}
