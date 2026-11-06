const presentationKeys=['scale','contrast','linear','grayscale'];
const presentation=params=>Object.fromEntries(presentationKeys.map(key=>[key,params[key]]));
export function validElaSynthesisSession(value){
 if(value===undefined)return{enabled:false};
 if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw new TypeError('Invalid synthesis session.');
 if(!value.enabled)return{enabled:false};
 const p=value.presentation??{scale:1,contrast:0,grayscale:false};
 if(!Number.isInteger(p.scale)||p.scale<1||p.scale>100||!Number.isInteger(p.contrast)||p.contrast<0||p.contrast>100||typeof p.grayscale!=='boolean'||Object.keys(p).some(key=>!['scale','contrast','grayscale'].includes(key)))throw new TypeError('Invalid synthesis presentation.');
 return{enabled:true,presentation:{...p}};
}

// The scientific recipe has fixed parameters. These separate display controls
// never replace the user's ordinary ELA or equalization preferences.
export function createElaSynthesisState(){
 let enabled=false,ordinary=null,display={scale:1,contrast:0,linear:false,grayscale:false};
 return{
  get enabled(){return enabled;},
  set(next,params){
   if(typeof next!=='boolean')throw new TypeError('Boolean synthesis state required.');
   if(next===enabled)return params;
   if(next){ordinary=presentation(params);enabled=true;return{...params,...display};}
   display=presentation(params);display.linear=false;enabled=false;const restored={...params,...ordinary};ordinary=null;return restored;
  },
  normalParams(params){return enabled?{...params,...ordinary}:{...params};},
  displayParams(params){return{scale:params.scale,contrast:params.contrast,grayscale:params.grayscale};},
  restore(value,params){const state=validElaSynthesisSession(value);enabled=false;ordinary=null;display={scale:1,contrast:0,linear:false,grayscale:false};if(!state.enabled)return{...params};display={...state.presentation,linear:false};return this.set(true,params);},
  session(params){return enabled?{enabled:true,presentation:this.displayParams(params)}:{enabled:false};},
 };
}

export function mountElaSynthesisControls({document,language=()=> 'fr',state,onToggle}={}){
 const button=document.getElementById('ela-synthesis'),detail=document.getElementById('ela-synthesis-detail');
 if(!button)throw new Error('The Classic synthesis control is missing.');
 const toggle=()=>{const value=state();if(!button.disabled)onToggle(!value.enabled);};button.addEventListener('click',toggle);
 function sync(){
  const value=state(),fr=language()==='fr',active=value.enabled===true;
  button.textContent=fr?'Synthèse':'Synthesis';button.setAttribute('aria-pressed',String(active));button.disabled=value.locked===true||value.available===false;
  button.classList.toggle('ela-synthesis-active',active);
  button.title=fr?'Synthèse expérimentale : histogramme sur chaque niveau, puis médiane RGB.':'Experimental synthesis: histogram for each level, then RGB median.';
  for(const id of ['ela-tab-energy','ela-tab-biomes'])document.getElementById(id)?.classList.toggle('ela-synthesis-shared',active);
  if(detail){detail.hidden=!active;detail.textContent=active?(value.detail??(fr?'Histogramme · médiane':'Histogram · median')):'';}
 }
 sync();return{sync,dispose(){button.removeEventListener('click',toggle);}};
}
