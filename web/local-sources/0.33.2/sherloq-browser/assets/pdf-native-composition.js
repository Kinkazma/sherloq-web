// Only visual composition is guarded here. Native operators and scientific
// scope/scores remain untouched. Windows use the page's rendered pixel grid.
export function pdfRgbCanvas(pixels){const canvas=new OffscreenCanvas(pixels.width,pixels.height),context=canvas.getContext('2d'),rgba=context.createImageData(pixels.width,pixels.height);for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){rgba.data[b]=pixels.data[a];rgba.data[b+1]=pixels.data[a+1];rgba.data[b+2]=pixels.data[a+2];rgba.data[b+3]=255;}context.putImageData(rgba,0,0);return canvas;}
export function pdfCompositionProtection(reference,reconstructed,textMask){
 if(reference.length!==reconstructed.length||reference.length%4||textMask&&textMask.length!==reference.length)throw new TypeError('PDF composition windows differ.');
 const cover=new Uint8ClampedArray(reference.length);let protectedPixels=0,occludedPixels=0,textPixels=0;
 for(let i=0;i<reference.length;i+=4){const text=!!textMask?.[i+3],different=reference[i]!==reconstructed[i]||reference[i+1]!==reconstructed[i+1]||reference[i+2]!==reconstructed[i+2]||reference[i+3]!==reconstructed[i+3];if(!text&&!different)continue;cover.set(reference.subarray(i,i+4),i);protectedPixels++;if(text)textPixels++;else occludedPixels++;}
 return{cover,protectedPixels,occludedPixels,textPixels,totalPixels:reference.length/4};
}
export function protectPdfPixels(output,reference,protection){const data=new Uint8Array(output.length/4*3);let protectedEffectPixels=0;for(let a=0,b=0;a<output.length;a+=4,b+=3){const blocked=protection.cover[a+3]!==0;if(blocked&&[0,1,2].some(c=>output[a+c]!==reference[a+c]))protectedEffectPixels++;for(let c=0;c<3;c++)data[b+c]=blocked?reference[a+c]:output[a+c];}return{data,protectedEffectPixels};}
