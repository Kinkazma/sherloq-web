import {effectRanges} from './vendor/loupe-effects-settings.js';
export const shortcutDefaults = Object.freeze({close: 'L', settings: 'R', sweep: 'B', original: 'O', decrease: ':', increase: '=', mark: 'M', export: 'E', basket: 'A', previousMark: '[', nextMark: ']', ocr:'Shift+O'});
const modifiers = ['Control', 'Meta', 'Alt', 'Shift'];
export function eventShortcut(event) {
  if (!event.key || modifiers.includes(event.key) || event.isComposing || event.key === 'Dead') return '';
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [event.ctrlKey && 'Ctrl', event.metaKey && 'Command', event.altKey && 'Alt', event.shiftKey && !/^[^a-z0-9\s]$/i.test(event.key) && 'Shift', key].filter(Boolean).join('+');
}
export function validShortcut(key) {
  return typeof key==='string' && /^(?:(?:Ctrl|Command|Alt|Shift)\+)*(?:[A-Z0-9:;=,./!?_()\[\]{}<>@#$%&*~`\\-]|F\d{1,2}|Arrow(?:Up|Down|Left|Right)|Space|Escape|Home|End|PageUp|PageDown)$/.test(key);
}
export function validateShortcuts(value = shortcutDefaults) {
  const result = {};
  for (const name of Object.keys(shortcutDefaults)) {
    const key = value[name] ?? shortcutDefaults[name];
    if (!validShortcut(key)) throw Error('Raccourci invalide.');
    result[name] = key;
  }
  if (new Set(Object.values(result)).size !== Object.keys(result).length) throw Error('Deux fonctions utilisent le même raccourci.');
  return result;
}
export function reservedShortcut(combo, mac = /Mac/.test(globalThis.navigator?.platform || '')) {
  const mod = mac ? 'Command' : 'Ctrl';
  const common = ['L','T','N','W','R','F','D','P','S','O','H','J'];
  if (common.some(key => combo === mod + '+' + key) || ['T','N','W'].some(key => combo === mod + '+Shift+' + key) || combo === 'F5' || combo === 'F11' || combo === 'F12') return 'Cette combinaison est déjà utilisée par le navigateur.';
  if (['Alt+ArrowLeft','Alt+ArrowRight'].includes(combo)) return 'Cette combinaison sert à la navigation du navigateur.';
  if (mac && ['Command+Q','Command+M','Command+Space'].includes(combo)) return 'Cette combinaison est déjà utilisée par macOS.';
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(combo)) return 'Les flèches règlent déjà la taille et la transition de la loupe.';
  if (combo === 'Escape') return 'Échap sert déjà à fermer les réglages ou la loupe.';
  return '';
}

// Additional pairs share the same collision checks and serialized playback.
export function validateBindings(bindings=[],shortcuts=shortcutDefaults){
 if(!Array.isArray(bindings)||bindings.length>16)throw Error('Seize paires de touches au maximum.');
 const used=new Set(Object.values(validateShortcuts(shortcuts))),ids=new Set();
 return bindings.map((v,index)=>{
  if(!v||!/^b[\w-]{1,80}$/.test(v.id)||ids.has(v.id))throw Error('Paire de touches invalide.');ids.add(v.id);
  if(!effectRanges[v.target?.split('.')[0]]?.[v.target?.split('.')[1]]||!Number.isInteger(v.step)||v.step<1||v.step>255)throw Error('Paramètre ou pas invalide.');
  for(const key of [v.decrease,v.increase]){if(!validShortcut(key))throw Error('Raccourci invalide.');if(used.has(key))throw Error('Deux fonctions utilisent le même raccourci : '+key);used.add(key);}
  return {id:v.id,target:v.target,step:v.step,decrease:v.decrease,increase:v.increase};
 });
}
export function resolveShortcut(preferences,combo){
 const action=Object.keys(preferences.shortcuts).find(name=>preferences.shortcuts[name]===combo);
 if(action)return {action};
 for(const binding of preferences.parameterBindings||[]){if(binding.decrease===combo)return {action:'decrease',binding,direction:-1};if(binding.increase===combo)return {action:'increase',binding,direction:1};}
 return {};
}
