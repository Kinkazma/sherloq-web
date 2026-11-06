// Viewport-only placement; original menu ownership and contents stay intact.
const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
export function viewportPopupPosition(anchor,box,{left=0,top=0,width,height},{align='start',margin=8,gap=4}={}){
 const m=Math.max(0,Math.min(margin,width/2,height/2)),w=Math.min(box.width,Math.max(1,width-2*m)),h=Math.min(box.height,Math.max(1,height-2*m));
 return{left:clamp(align==='end'?anchor.right-w:anchor.left,left+m,left+width-w-m),top:clamp(anchor.bottom+gap,top+m,top+height-h-m),maxWidth:Math.max(1,width-2*m),maxHeight:Math.max(1,height-2*m)};
}
export function positionViewportPopup(anchor,popup,{align='start',width}={}){
 const win=anchor.ownerDocument.defaultView??globalThis,v=win.visualViewport,viewport={left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??win.innerWidth??1024,height:v?.height??win.innerHeight??768};
 const set=(key,value)=>{if(popup.style[key]!==value)popup.style[key]=value;};
 set('position','fixed');set('boxSizing','border-box');set('right','auto');set('bottom','auto');set('minWidth','0');set('maxWidth',Math.max(1,viewport.width-16)+'px');set('maxHeight',Math.max(1,viewport.height-16)+'px');
 if(width!==undefined)set('width',Math.max(1,Math.min(width,viewport.width-16))+'px');
 const next=viewportPopupPosition(anchor.getBoundingClientRect(),popup.getBoundingClientRect(),viewport,{align});set('left',next.left+'px');set('top',next.top+'px');return next;
}
export function bindViewportMenu(menu){
 const anchor=menu.querySelector('summary'),popup=menu.querySelector('div'),doc=menu.ownerDocument,win=doc.defaultView;if(!anchor||!popup)return{dispose(){}};
 let closed=false;const update=()=>{if(!closed&&menu.open)positionViewportPopup(anchor,popup,{align:menu.id==='settings-menu'?'end':'start',width:230});};
 menu.addEventListener('toggle',update);doc.addEventListener('scroll',update,true);win?.addEventListener('resize',update);win?.visualViewport?.addEventListener('resize',update);win?.visualViewport?.addEventListener('scroll',update);
 const observer=win?.ResizeObserver?new win.ResizeObserver(update):null;observer?.observe(popup);observer?.observe(anchor);update();
 return{update,dispose(){closed=true;observer?.disconnect();menu.removeEventListener('toggle',update);doc.removeEventListener('scroll',update,true);win?.removeEventListener('resize',update);win?.visualViewport?.removeEventListener('resize',update);win?.visualViewport?.removeEventListener('scroll',update);}};
}
