// A fixed scalar-to-RGB presentation of the retained TruFor anomaly map.
export const TRUFOR_HEAT_COLORS=Object.freeze([[7,15,39],[42,42,109],[207,66,59],[251,177,53],[255,248,201]].map(Object.freeze));
export function truforHeatFrame(width,height,values){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||values.length!==width*height)throw new RangeError('Invalid TruFor heatmap dimensions');
 const data=new Uint8Array(width*height*3);
 for(let i=0;i<values.length;i++){
  if(!Number.isFinite(values[i]))throw new RangeError('Non-finite TruFor heatmap value');
  const scaled=Math.max(0,Math.min(1,values[i]))*4,index=Math.min(3,Math.floor(scaled)),fraction=scaled-index;
  // Match the reference's linear RGB interpolation and uint8 truncation.
  for(let channel=0;channel<3;channel++)data[i*3+channel]=TRUFOR_HEAT_COLORS[index][channel]+(TRUFOR_HEAT_COLORS[index+1][channel]-TRUFOR_HEAT_COLORS[index][channel])*fraction;
 }
 return {width,height,format:'rgb8',data};
}
