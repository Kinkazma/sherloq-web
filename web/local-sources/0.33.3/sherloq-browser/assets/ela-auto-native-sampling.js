// Every rectangle remains wholly inside one admitted context. Read a bounded
// band instead of paying storage/RPC and a clamped timer once per native row.
export function* nativeSampleWindows(context,maximumPixels=8192){for(let x=0;x<context.width;x+=maximumPixels){const width=Math.min(maximumPixels,context.width-x),rows=Math.max(1,Math.floor(maximumPixels/width));for(let y=0;y<context.height;y+=rows)yield{x:context.x+x,y:context.y+y,width,height:Math.min(rows,context.height-y),localX:x,localY:y};}}
