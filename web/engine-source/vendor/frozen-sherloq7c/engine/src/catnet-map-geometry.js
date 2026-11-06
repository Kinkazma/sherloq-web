import {requireValue} from './errors.js';
// Validate map geometry before either dense or segmented output is allocated.
export function catnetMapGeometry(metadata){
 requireValue(Array.isArray(metadata?.source_shape)&&metadata.source_shape.length===2&&Array.isArray(metadata?.padded_shape)&&metadata.padded_shape.length===2,'Invalid CAT-Net crop geometry.');
 const [h,w]=metadata.source_shape,[ph,pw]=metadata.padded_shape,o=metadata.orientation;
 requireValue([h,w,ph,pw].every(value=>Number.isSafeInteger(value)&&value>0)&&Number.isSafeInteger(h*w)&&Number.isSafeInteger(ph*pw)&&h<=ph&&w<=pw,'Invalid CAT-Net crop geometry.');
 requireValue(Number.isInteger(o)&&o>=1&&o<=8,'Invalid CAT-Net orientation.');
 return{h,w,ph,pw,o,width:o>=5?h:w,height:o>=5?w:h};
}
