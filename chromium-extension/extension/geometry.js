export function imageGeometry(rect, natural, {fit = 'fill', position = '50% 50%', border = [0,0,0,0], padding = [0,0,0,0]} = {}) {
  let x = rect.x + border[3] + padding[3], y = rect.y + border[0] + padding[0];
  const width = rect.width - border[1] - border[3] - padding[1] - padding[3], height = rect.height - border[0] - border[2] - padding[0] - padding[2];
  const contain = Math.min(width / natural.width, height / natural.height), cover = Math.max(width / natural.width, height / natural.height);
  let sx = width / natural.width, sy = height / natural.height;
  if (fit !== 'fill') sx = sy = fit === 'cover' ? cover : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, contain) : contain;
  const coordinate = (value, free) => value?.endsWith('%') ? free * parseFloat(value) / 100 : value === 'left' || value === 'top' ? 0 : value === 'right' || value === 'bottom' ? free : value === 'center' ? free / 2 : parseFloat(value) || 0;
  const [px = '50%', py = '50%'] = position.split(/\s+/);
  x += coordinate(px, width - natural.width * sx); y += coordinate(py, height - natural.height * sy);
  return {x, y, sx, sy, clip: {x: rect.x + border[3], y: rect.y + border[0], width: rect.width - border[1] - border[3], height: rect.height - border[0] - border[2]}};
}

export function distanceToRect(x,y,rect){return Math.hypot(Math.max(rect.x-x,0,x-rect.x-rect.width),Math.max(rect.y-y,0,y-rect.y-rect.height));}
export function nearestImages(current,images,limit=3){
 const rect=current.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
 return images.filter(image=>image!==current&&image.isConnected&&(!image.checkVisibility||image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))).map(image=>({image,rect:image.getBoundingClientRect()})).filter(({rect})=>rect.width>=24&&rect.height>=24&&rect.right>0&&rect.bottom>0&&rect.x<innerWidth&&rect.y<innerHeight).filter(({image,rect})=>[[.5,.5],[.15,.15],[.85,.85]].some(([px,py])=>{const x=Math.max(0,Math.min(innerWidth-1,rect.x+rect.width*px)),y=Math.max(0,Math.min(innerHeight-1,rect.y+rect.height*py));return document.elementsFromPoint(x,y).find(node=>node.tagName==='IMG'&&(!node.checkVisibility||node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})))===image;})).sort((a,b)=>distanceToRect(x,y,a.rect)-distanceToRect(x,y,b.rect)).slice(0,limit).map(v=>v.image);
}

// Fraction of the rendered disk occupied by the selected image. Integrate equal-area
// rings after the same quintic radial mapping used by the loupe shader. Each ring's
// intersection with the image rectangle is measured by its exact angular intervals.
export function loupeImageCoverage(rect,centre,{diameter,transition=0,relativeZoom=1},rings=128){
 const inner=diameter/2,radius=inner+transition,tau=2*Math.PI;
 if(!(rect.width>0&&rect.height>0&&radius>0&&relativeZoom>0))return 0;
 const reach=radius*Math.max(1,1/relativeZoom);
 if(distanceToRect(centre.x,centre.y,rect)>reach)return 0;
 const left=rect.x-centre.x,right=left+rect.width,top=rect.y-centre.y,bottom=top+rect.height;
 if(left<=-reach&&right>=reach&&top<=-reach&&bottom>=reach)return 1;
 function angularFraction(q){
  if(q<1e-10)return left<=0&&right>=0&&top<=0&&bottom>=0?1:0;
  const cuts=[0,tau];
  for(const x of [left,right])if(Math.abs(x)<q){const a=Math.acos(x/q);cuts.push(a,tau-a);}
  for(const y of [top,bottom])if(Math.abs(y)<q){const a=Math.asin(y/q);cuts.push((a+tau)%tau,(Math.PI-a+tau)%tau);}
  cuts.sort((a,b)=>a-b);let angle=0;
  for(let i=1;i<cuts.length;i++){const a=(cuts[i-1]+cuts[i])/2,x=q*Math.cos(a),y=q*Math.sin(a);if(x>=left&&x<=right&&y>=top&&y<=bottom)angle+=cuts[i]-cuts[i-1];}
  return angle/tau;
 }
 let occupied=0;
 for(let i=0;i<rings;i++){const r=radius*Math.sqrt((i+.5)/rings),t=transition?Math.max(0,Math.min(1,(r-inner)/transition)):Number(r>inner),s=t*t*t*(t*(t*6-15)+10),q=r*(1/relativeZoom+(1-1/relativeZoom)*s);occupied+=angularFraction(q);}
 return occupied/rings;
}
