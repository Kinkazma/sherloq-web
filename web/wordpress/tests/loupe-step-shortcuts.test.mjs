import test from'node:test';import assert from'node:assert/strict';
import{loupeStepKeyDirection,loupeStepKeyPair,installLoupeStepShortcuts}from'../sherloq-browser/assets/loupe-step-shortcuts.js';
import{createLoupeStepPlayback}from'../sherloq-browser/assets/loupe-step-playback.js';
test('Apple and Windows character bindings work in AZERTY and QWERTY without physical-key assumptions',()=>{
 for(const platform of['MacIntel','Win32'])for(const[key,code,direction,shiftKey]of[[':','Period',-1,false],[':','Semicolon',-1,true],['-','Minus',-1,false],['=','Equal',1,false],['+','Equal',1,true]])assert.equal(loupeStepKeyDirection({key,code,shiftKey,platform}),direction);
 for(const props of[{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{defaultPrevented:true}])assert.equal(loupeStepKeyDirection({key:'=',...props}),0);
 for(const target of[{tagName:'INPUT',type:'number'},{tagName:'INPUT',type:'text'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{isContentEditable:true}])assert.equal(loupeStepKeyDirection({key:'=',target}),0);
 assert.equal(loupeStepKeyDirection({key:'=',target:{tagName:'BUTTON'}}),1);assert.equal(loupeStepKeyDirection({key:')',code:'Minus'}),0);
 assert.deepEqual(loupeStepKeyPair(new Map([['KeyQ','a'],['KeyA','q']])) ,{decrease:':',increase:'='});assert.deepEqual(loupeStepKeyPair(new Map([['KeyQ','q'],['KeyA','a']])) ,{decrease:'-',increase:'='});assert.equal(loupeStepKeyPair(null,'en').decrease,'-');
});
test('layout map failure falls back safely, observed layout updates labels, listeners dispose',async()=>{
 const handlers=new Map(),down=[],up=[],pairs=[],root={addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:(k,f)=>{if(handlers.get(k)===f)handlers.delete(k);}};
 const keys=installLoupeStepShortcuts({root,navigator:{keyboard:{getLayoutMap:()=>Promise.reject(Error('unsupported'))}},down:(...a)=>down.push(a),up:id=>up.push(id),onPair:p=>pairs.push(p)});await Promise.resolve();
 const event={key:'=',code:'Equal',preventDefault(){this.defaultPrevented=true;}};handlers.get('keydown')(event);assert.equal(event.defaultPrevented,true);assert.equal(down[0][1],1);handlers.get('keyup')(event);assert.equal(up[0],'loupe-step:Equal');
 handlers.get('keydown')({key:'q',code:'KeyQ'});assert.equal(keys.pair.decrease,'-');keys.dispose();assert.equal(handlers.size,0);
});
test('held keys wait for native paints, ignore OS repeats and stop on release with no repeat backlog',()=>{
 const scheduled=new Map();let serial=0,value=0;const applied=[];
 const p=createLoupeStepPlayback({schedule:fn=>{scheduled.set(++serial,fn);return serial;},cancel:id=>scheduled.delete(id),step:d=>{value+=d;applied.push(value);return{owner:'A',effectsKey:String(value)};}});
 p.down('Equal',1);for(let i=0;i<10;i++)p.down('Equal',1,{repeat:true});assert.deepEqual(applied,[1]);assert.equal(p.state.queued,0);
 p.presented({owner:'A',effectsKey:'1'});assert.equal(scheduled.size,1);assert.deepEqual(applied,[1]);const fn=[...scheduled.values()][0];scheduled.clear();fn();assert.deepEqual(applied,[1,2]);
 p.up('Equal');p.presented({owner:'A',effectsKey:'2'});assert.equal(scheduled.size,0);assert.equal(p.state.busy,false);assert.equal(p.state.held,0);
 p.down('Equal',1);p.up('Equal');p.presented({owner:'A',effectsKey:'3'});assert.deepEqual(applied,[1,2,3]);
 p.down('Equal',1);p.presented({owner:'A',effectsKey:'4'});assert.equal(scheduled.size,1);p.reset();assert.equal(scheduled.size,0);assert.equal(p.state.held,0);p.dispose();
});
