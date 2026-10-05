// Frozen0.14 row-at-a-time baseline; development benchmark only.
// Exact full-resolution window reads over un-oriented RGB8 storage.
// Presentation tiles are consumers; these coordinates never rescale analysis.
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from '../src/errors.js';
export function createRgbSurface(store,{width:sw,height:sh,orientation=1,budget,ownsStore=true}={}){
 requireValue(Number.isSafeInteger(sw)&&Number.isSafeInteger(sh)&&sw>0&&sh>0&&Number.isSafeInteger(sw*sh*3)&&store.byteLength===sw*sh*3,'Invalid RGB surface dimensions.');
 requireValue(Number.isInteger(orientation)&&orientation>=1&&orientation<=8&&budget,'Invalid RGB surface options.');
 const width=orientation>=5?sh:sw,height=orientation>=5?sw:sh,id=crypto.randomUUID();let disposed=false,disposing;
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Pixel surface disposed.');};
 function source(x,y){switch(orientation){case 2:return [sw-1-x,y];case 3:return [sw-1-x,sh-1-y];case 4:return [x,sh-1-y];case 5:return [y,x];case 6:return [y,sh-1-x];case 7:return [sw-1-y,sh-1-x];case 8:return [sw-1-y,x];default:return [x,y];}}
 return {
  descriptor:Object.freeze({id,revision:1,width,height,format:'rgb8',sourceWidth:sw,sourceHeight:sh,orientation,coordinates:'full-resolution',storage:store.storage??'blob'}),
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   alive();checkAbort(signal);requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Pixel window is outside the full-resolution surface.');
   const corners=[source(x,y),source(x+w-1,y),source(x,y+h-1),source(x+w-1,y+h-1)],x0=Math.min(...corners.map(p=>p[0])),x1=Math.max(...corners.map(p=>p[0])),y0=Math.min(...corners.map(p=>p[1])),y1=Math.max(...corners.map(p=>p[1])),rowBytes=(x1-x0+1)*3,release=budget.reserve(w*h*3);let out,scratch;
   try{scratch=budget.reserve(rowBytes);out=new Uint8Array(w*h*3);const row=new Uint8Array(rowBytes);
    for(let sy=y0;sy<=y1;sy++){if((sy-y0)%32===0)await controlCheckpoint(signal);alive();await store.readInto(row,(sy*sw+x0)*3);checkAbort(signal);
     if(orientation===1||orientation===4){const dy=orientation===1?sy:sh-1-sy;out.set(row,(dy-y)*w*3);continue;}
     for(let sx=x0;sx<=x1;sx++){let dx=sx,dy=sy;switch(orientation){case 2:dx=sw-1-sx;break;case 3:dx=sw-1-sx;dy=sh-1-sy;break;case 4:dy=sh-1-sy;break;case 5:dx=sy;dy=sx;break;case 6:dx=sh-1-sy;dy=sx;break;case 7:dx=sh-1-sy;dy=sw-1-sx;break;case 8:dx=sy;dy=sw-1-sx;break;}const a=(sx-x0)*3,b=((dy-y)*w+dx-x)*3;out[b]=row[a];out[b+1]=row[a+1];out[b+2]=row[a+2];}
    }
    return {surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format:'rgb8',data:out},release};
   }catch(error){release();throw normalizeResourceError(error);}finally{scratch?.();}
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=Promise.resolve(ownsStore?store.dispose():undefined);return disposing;}
 };
}
