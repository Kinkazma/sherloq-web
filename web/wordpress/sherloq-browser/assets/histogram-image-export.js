const WIDTH=768,GRAPH_HEIGHT=170,GRAPH_TOP=48,FOOTER=54,MARGIN=12,LINE_HEIGHT=14,STAT_LINES=3;
const invalid=message=>{throw Object.assign(Error(message),{code:'INVALID_INPUT'});};
const cancelled=()=>Object.assign(Error('The histogram export frame has been released.'),{code:'CANCELLED'});
function layout(canvas){
 if(!canvas||typeof canvas.getContext!=='function'||![canvas.width,canvas.height].every(value=>Number.isSafeInteger(value)&&value>0))invalid('A calculated histogram canvas is required.');
 const density=Number(canvas.dataset?.pixelRatio);
 if(Number.isFinite(density)&&density>0){const width=Math.max(Math.round(WIDTH*density),canvas.width),top=Math.round(GRAPH_TOP*density);return{width,height:top+canvas.height+Math.round(FOOTER*density),density,graph:{x:Math.floor((width-canvas.width)/2),y:top,width:canvas.width,height:canvas.height}};}
 const scale=Math.min(1,WIDTH/canvas.width,GRAPH_HEIGHT/canvas.height),width=Math.max(1,Math.round(canvas.width*scale)),height=Math.max(1,Math.round(canvas.height*scale));
 return{width:WIDTH,height:GRAPH_TOP+height+FOOTER,density:1,graph:{x:Math.floor((WIDTH-width)/2),y:GRAPH_TOP,width,height}};
}
// A pure size query is safe in the shared export dialog's ordinary UI updates.
export function histogramImageExportSize(canvas){const {width,height}=layout(canvas);return{width,height};}
function fitText(context,value,width){
 const text=String(value??'').replace(/[\r\n]+/g,' ').trim();if(context.measureText(text).width<=width)return text;if(width<=0||context.measureText('…').width>width)return '';
 const chars=Array.from(text);let low=0,high=chars.length;
 while(low<high){const middle=Math.ceil((low+high)/2);if(context.measureText(chars.slice(0,middle).join('')+'…').width<=width)low=middle;else high=middle-1;}
 return chars.slice(0,low).join('')+'…';
}
function textLines(context,value,width){
 const words=String(value??'').replace(/[\r\n]+/g,' ').trim().split(/[ \t]+/).filter(Boolean),lines=[];let line='';
 for(let i=0;i<words.length;i++){
  const next=line?line+' '+words[i]:words[i];
  if(line&&context.measureText(next).width>width){lines.push(line);line='';if(lines.length===STAT_LINES-1){lines.push(fitText(context,words.slice(i).join(' '),width));return lines;}}
  line=line?line+' '+words[i]:words[i];
  if(context.measureText(line).width>width){lines.push(fitText(context,line,width));line='';if(lines.length===STAT_LINES)return lines;}
 }
 if(line)lines.push(line);return lines;
}

// The only source is the live chart canvas. Its pixels and supplied captions
// are captured synchronously into a separate opaque bitmap, never the photo.
// The shared raster exporter may then read it in whichever native bands its
// current or future encoder requests, without observing later pointer motion.
export function createHistogramImageExportSurface({canvas,title='',scope='',legend=[],statistics='',background='#202124',foreground='#e8eaed',document=canvas?.ownerDocument??globalThis.document}={}){
 const shape=layout(canvas),density=shape.density,margin=MARGIN*density;if(!document||typeof document.createElement!=='function'||!Array.isArray(legend))invalid('A document and histogram legend are required.');
 const frame=document.createElement('canvas');frame.width=shape.width;frame.height=shape.height;const context=frame.getContext('2d');
 if(!context){frame.width=frame.height=0;throw Object.assign(Error('A histogram export canvas is unavailable.'),{code:'CANVAS_UNAVAILABLE'});}
 try{
  context.fillStyle='#fff';context.fillRect(0,0,shape.width,shape.height);context.fillStyle=background;context.fillRect(0,0,shape.width,shape.height);context.textBaseline='alphabetic';context.fillStyle=foreground;context.font='bold '+13*density+'px sans-serif';context.fillText(fitText(context,title,shape.width-margin*2),margin,17*density);context.font=11*density+'px sans-serif';context.fillText(fitText(context,scope,shape.width-margin*2),margin,31*density);
  const column=(shape.width-margin*2)/Math.max(1,legend.length);
  for(let index=0;index<legend.length;index++){
   const item=legend[index]??{},x=margin+index*column;context.fillStyle=item.color||foreground;context.fillRect(x,37*density,8*density,8*density);context.fillStyle=foreground;context.fillText(fitText(context,item.label,Math.max(0,column-20*density)),x+13*density,44*density);
  }
  const g=shape.graph;context.drawImage(canvas,0,0,canvas.width,canvas.height,g.x,g.y,g.width,g.height);
  context.fillStyle=foreground;context.font=11*density+'px sans-serif';const lines=textLines(context,statistics,shape.width-margin*2);
  for(let index=0;index<lines.length;index++)context.fillText(lines[index],margin,g.y+g.height+(16+index*LINE_HEIGHT)*density);
 }catch(error){frame.width=frame.height=0;throw error;}
 let closed=false;
 const close=()=>{if(closed)return;closed=true;frame.width=frame.height=0;};
 return{
  width:shape.width,height:shape.height,byteLength:shape.width*shape.height*4,exportReadWorkspaceBytes:shape.width*shape.height*7,
  async readPixels(rect,{signal}={}){
   if(closed||signal?.aborted)throw cancelled();
   const {x,y,width,height}=rect??{};
   if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<=0||height<=0||x+width>shape.width||y+height>shape.height)invalid('The requested histogram export window is outside its snapshot.');
   const rgba=context.getImageData(x,y,width,height).data,data=new Uint8Array(width*height*3);
   for(let source=0,target=0;target<data.length;source+=4,target+=3){data[target]=rgba[source];data[target+1]=rgba[source+1];data[target+2]=rgba[source+2];}
   return{width,height,format:'rgb8',data};
  },close,dispose:close
 };
}
