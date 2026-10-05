// Presentation only. Scientific maps remain untouched in the engine worker.
export async function renderEnergy(data,source,{view='overlay',opacity=70}={}){
 if(!['overlay','labels'].includes(view)||!Number.isInteger(opacity)||opacity<0||opacity>100)throw Error('Invalid energy presentation');
 const {width,height,energy_labels:labels,regionColors}=data,n=width*height;
 if(labels.length!==n||(source.data?source.data.length!==n*3:source.width!==width||source.height!==height))throw Error('Energy dimensions differ from original');
 const colors=new Map(regionColors.map(x=>[x.id,x.rgb])),output=new Uint8Array(n*3),alpha=opacity/100;
 for(let top=0;top<height;top+=256){const end=Math.min(height,top+256)*width;
  const rowSource=source.data?null:await source.readPixels({x:0,y:top,width,height:Math.min(256,height-top)});
  const original=source.data??rowSource.data,base=source.data?0:top*width*3;
  for(let i=top*width;i<end;i++){const rgb=colors.get(labels[i]);for(let c=0;c<3;c++)output[i*3+c]=view==='labels'?(rgb?.[c]??0):(rgb?Math.round(original[i*3+c-base]*(1-alpha)+rgb[c]*alpha):original[i*3+c-base]);}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return{width,height,format:'rgb8',data:output};
}
