import {effectDefaults,effectRanges} from './loupe-effects-settings.js';
// Advance only after a calculated frame was drawn. Faster sweeps take larger
// steps, never queue obsolete work; .5 retains the original one-unit pace.
export function createLoupeScan({read,write,changed=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=clearTimeout,now=()=>performance.now()}){
 let active=null,paused=null,timer=null;
 const stop=({remember=false}={})=>{if(timer!==null)cancel(timer);timer=null;paused=remember&&active?{...active,until:now()+5000}:null;if(active){active=null;changed(null);}};
 const compatible=(a,s)=>a&&s.enabled&&s.effects[a.group]?.enabled&&s.effects[a.group][a.key]===a.value&&(a.group!=='enhance'||s.effects.enhance.mode==='contrast')&&(a.group!=='adjust'||s.sweepTarget===a.key);
 const apply=value=>{if(!active)return;const {group,key}=active;active.value=value;active.started=now();write(group,key,value);};
 return{
  get active(){return active?.group??null;},stop,
  start(group){if(active){stop({remember:true});return false;}const s=read();if(!s.enabled||!s.effects[group]?.enabled||group==='enhance'&&s.effects.enhance.mode!=='contrast')return false;
   const key=group==='adjust'?s.sweepTarget:group==='enhance'?'percent':'position',bounds=effectRanges[group]?.[key]??(key==='invert'?[0,1]:null);if(!bounds)return false;
   const resume=paused?.group===group&&paused.key===key&&now()<=paused.until&&compatible(paused,s);
   active=resume?{...paused}:{group,key,max:bounds[1],value:null,boolean:typeof effectDefaults[group][key]==='boolean'};paused=null;changed(group);apply(resume?active.value:active.boolean?false:key==='threshold'?1:bounds[0]);return true;
  },
  observe(){const s=read();if(active&&!compatible(active,s))stop();if(paused&&!compatible(paused,s))paused=null;},
  presented(){if(!active||timer!==null)return;const factor=Math.max(.1,Math.min(5,read().sweepSpeed??2))/.5,elapsed=Math.max(0,now()-active.started),delay=factor<1?(elapsed+16)/factor-elapsed:16/factor;
   timer=schedule(()=>{timer=null;if(!active)return;const {group,key,value,max,boolean}=active;if(Number(value)>=max){stop();write(group,key,effectDefaults[group][key]);}else apply(boolean?true:Math.min(max,value+Math.max(1,Math.round((read().sweepSpeed??2)/.5))));},delay);
  }
 };
}
