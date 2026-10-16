/** Read one oriented RGB window, retaining the core's lease until release. */
export async function readRGBWindow(source,rect,{signal}={}){
 if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
 const {x,y,width,height}=rect;
 if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>source.width||y+height>source.height)throw Error('Invalid source window');
 if(source.data){
  const channels=source.data.length/(source.width*source.height),data=new Uint8Array(width*height*3);
  if(![3,4].includes(channels))throw Error('RGB/RGBA8 source required');
  for(let row=0;row<height;row++)for(let col=0;col<width;col++)for(let c=0;c<3;c++)data[(row*width+col)*3+c]=source.data[((y+row)*source.width+x+col)*channels+c];
  return {pixels:{width,height,data},release(){}};
 }
 const read=source.readWindow??source.surface?.readWindow?.bind(source.surface);
 if(!read)throw Error('Source must provide RGB8 pixels or readWindow');
 const window=await read(rect,{signal});let released=false;
 try{
  const pixels=window.pixels??window;
  if(pixels.width!==width||pixels.height!==height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==width*height*3)throw Error('Invalid RGB8 source window');
  if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
  return {pixels,release(){if(released)return;released=true;window.release?.();}};
 }catch(error){window.release?.();throw error;}
}
