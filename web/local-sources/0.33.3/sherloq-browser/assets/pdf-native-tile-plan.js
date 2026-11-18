// Native coordinates throughout. The display scale never changes the calculation grid.
export const NATIVE_TILE_SIZE=128;
export const tileId=r=>r.x+':'+r.y;
export function nativeTiles(width,height,bounds={left:0,top:0,right:width,bottom:height}){
 const size=NATIVE_TILE_SIZE,left=Math.max(0,Math.floor(bounds.left)),top=Math.max(0,Math.floor(bounds.top)),right=Math.min(width,Math.ceil(bounds.right)),bottom=Math.min(height,Math.ceil(bounds.bottom)),out=[];
 if(right<=left||bottom<=top)return out;
 for(let y=Math.floor(top/size)*size;y<bottom;y+=size)for(let x=Math.floor(left/size)*size;x<right;x+=size)out.push({x,y,width:Math.min(size,width-x),height:Math.min(size,height-y)});
 return out;
}
export function centreOrder(tiles,centre){return [...tiles].sort((a,b)=>Math.hypot(a.x+a.width/2-centre.x,a.y+a.height/2-centre.y)-Math.hypot(b.x+b.width/2-centre.x,b.y+b.height/2-centre.y)||a.y-b.y||a.x-b.x);}
export function tileBounds(regions){return {left:Math.min(...regions.map(r=>r.x)),top:Math.min(...regions.map(r=>r.y)),right:Math.max(...regions.map(r=>r.x+r.width)),bottom:Math.max(...regions.map(r=>r.y+r.height))};}
