import {requireValue} from './errors.js';
// M3 native dimensions/linear pixel indices are signed int32, not texture axes.
// Byte arrays, heaps and pyramid/work buffers have separate real admission.
export function m3ImageShape(width,height,minimum=1){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=minimum&&height>=minimum&&width<=0x7fffffff&&height<=0x7fffffff&&width*height<=0x7fffffff,'M3 image dimensions and pixel indices must fit native signed int32.');
 return width*height;
}
