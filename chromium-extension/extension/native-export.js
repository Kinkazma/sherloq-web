// Export the native treated raster, independent of the on-screen lens geometry.
export async function nativePNG(source){
 const {width,height}=source;if(!(width>0&&height>0)||width*height>100_000_000)throw Error('Dimensions d’export non prises en charge.');
 const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');if(!ctx||canvas.width!==width||canvas.height!==height)throw Error('Dimensions supérieures à la capacité d’export de ce navigateur.');
 try{if(source.bitmap){ctx.drawImage(source.bitmap,0,0);return await canvas.convertToBlob({type:'image/png'});}for(let y=0;y<height;y+=128){const rows=Math.min(128,height-y),pixels=await source.readPixels({x:0,y,width,height:rows}),rgb=pixels.data,rgba=new Uint8ClampedArray(width*rows*4);if(pixels.format==='rgba8')rgba.set(rgb);else for(let i=0,j=0;i<rgb.length;i+=3,j+=4){rgba[j]=rgb[i];rgba[j+1]=rgb[i+1];rgba[j+2]=rgb[i+2];rgba[j+3]=255;}ctx.putImageData(new ImageData(rgba,width,rows),0,y);await new Promise(resolve=>setTimeout(resolve,0));}return await canvas.convertToBlob({type:'image/png'});}finally{canvas.width=canvas.height=1;}
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
