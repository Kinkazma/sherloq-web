// Match characters, not physical scan codes: the same controls work across
// macOS/Windows and AZERTY/QWERTY. Layout discovery only improves the labels.
export const loupeStepKeyDirection=event=>{
 if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return 0;
 if((event.composedPath?.()??[event.target]).some(node=>node?.isContentEditable||node?.getAttribute?.('contenteditable')==='true'||['TEXTAREA','SELECT'].includes(node?.tagName)||node?.tagName==='INPUT'&&!['range','checkbox','button','file'].includes(node.type)))return 0;
 return event.key===':'||event.key==='-'||event.key==='−'?-1:event.key==='='||event.key==='+'?1:0;
};
export function loupeStepKeyPair(layout,language='fr'){
 const q=layout?.get?.('KeyQ')?.toLowerCase(),a=layout?.get?.('KeyA')?.toLowerCase();
 const azerty=q==='a'&&a==='q';
 return Object.freeze({decrease:azerty||!q&&!a&&language.startsWith('fr')?':':'-',increase:'='});
}
export function installLoupeStepShortcuts({root=globalThis.document,navigator=root?.defaultView?.navigator,language=()=> 'fr',canStep=()=>true,down,up,onPair=()=>{}}={}){
 let closed=false,known=false,pair=loupeStepKeyPair(null,language());
 const publish=value=>{if(closed)return;pair=value;onPair(pair);};
 const keydown=event=>{
  if(((event.code==='KeyQ'&&['a','q'].includes(event.key.toLowerCase()))||(event.code==='KeyA'&&['a','q'].includes(event.key.toLowerCase())))){
   const azerty=event.code==='KeyQ'?event.key.toLowerCase()==='a':event.key.toLowerCase()==='q';known=true;publish(loupeStepKeyPair(new Map([['KeyQ',azerty?'a':'q'],['KeyA',azerty?'q':'a']]),language()));
  }
  const direction=loupeStepKeyDirection(event);if(!direction||!canStep())return;
  event.preventDefault();down('loupe-step:'+(event.code||event.key),direction,{repeat:event.repeat});
 };
 const keyup=event=>up('loupe-step:'+(event.code||event.key));
 root.addEventListener('keydown',keydown,true);root.addEventListener('keyup',keyup,true);publish(pair);
 try{const task=navigator?.keyboard?.getLayoutMap?.();if(task)Promise.resolve(task).then(layout=>{if(!closed){known=true;publish(loupeStepKeyPair(layout,language()));}},()=>{});}catch{}
 return{get pair(){return pair;},refresh(){if(!known)publish(loupeStepKeyPair(null,language()));},dispose(){if(closed)return;closed=true;root.removeEventListener('keydown',keydown,true);root.removeEventListener('keyup',keyup,true);}};
}
