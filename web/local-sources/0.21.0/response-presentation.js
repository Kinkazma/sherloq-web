import {TRUFOR_HEAT_COLORS} from './trufor-palette.js?v=0.21.0';

export const displayThreshold=(value,fallback=0)=>Number.isFinite(value)&&value>=0&&value<=1?value:fallback;
export function responseColor(response,channel){
 const scaled=response*4,index=Math.min(3,Math.floor(scaled)),fraction=scaled-index;
 return Math.trunc(TRUFOR_HEAT_COLORS[index][channel]+(TRUFOR_HEAT_COLORS[index+1][channel]-TRUFOR_HEAT_COLORS[index][channel])*fraction);
}

// The display threshold selects the regions. Opacity alone controls their
// blending: at 100%, every selected pixel has the exact map colour.
export function responseBlend(source,color,opacity){return Math.round(source+(color-source)*opacity);}
