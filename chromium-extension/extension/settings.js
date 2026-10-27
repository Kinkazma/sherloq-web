import {validateLoupeSettings, loupeDefaults} from './native-media-settings.js';
import {shortcutDefaults, validateShortcuts, validateBindings} from './shortcuts.js';
import {normalizeControlSettings,controlGroupDefaults} from './controls.js';
export const defaults = {
  webURL: 'https://gaeldauchy.com/sherloq/', localURL: '', navigationMode:'auto',
  ocrPreference:'auto', language: 'auto', theme: 'auto', font: 'iowan', settingsVersion: 4, parameterBindings: [], controlTarget: 'adjust.sweep', controlStep: 10, controlGroups:controlGroupDefaults, controlInterval: 100,
  loupe: {...loupeDefaults, enabled: true, sweepTarget: 'sweep'}, shortcuts: shortcutDefaults
};
export function destinationURL(value, local = false) {
  const u = new URL(value);
  if (!['http:', 'https:', ...(local ? ['file:'] : [])].includes(u.protocol) || u.username || u.password) throw Error('Adresse SHERLOQ invalide.');
  return u.href;
}
export function normalizeSettings(saved = {}) {
  const loupe = {...defaults.loupe, ...saved.loupe};
  if (Number.isFinite(loupe.zoom) && loupe.zoom >= 1 && loupe.zoom < 101) loupe.zoom = 101;
  if (!saved.settingsVersion && loupe.sweepTarget === 'gamma') loupe.sweepTarget = 'sweep';
  const shortcuts={...saved.shortcuts},used=new Set([...Object.values(shortcuts),...(saved.parameterBindings??[]).flatMap(v=>[v.decrease,v.increase])]);
  for(const [name,key] of Object.entries(shortcutDefaults))if(shortcuts[name]===undefined){const free=used.has(key)?['F2','F3','F4','F6','F7','F8','F9','F10','F13','F14','F15','F16','F17','F18','F19','F20'].find(v=>!used.has(v)):key;shortcuts[name]=free;used.add(free);}
  return {...defaults,...saved,...normalizeControlSettings(saved),settingsVersion:4,parameterBindings:validateBindings(saved.parameterBindings,shortcuts),loupe:validateLoupeSettings(loupe),shortcuts:validateShortcuts(shortcuts)};
}
export async function readSettings() {
  const saved = (await chrome.storage.local.get('preferences')).preferences || {};
  return normalizeSettings(saved);
}
export async function saveSettings(value) {
  const p = normalizeSettings(value);
  if(!['auto','enabled','disabled'].includes(p.ocrPreference))throw Error('Préférence OCR invalide.');
  if(!['auto','mouse','trackpad'].includes(p.navigationMode))throw Error('Mode de navigation invalide.');
  if (!/^(adjust|enhance|sweep)\.[a-z]+$/i.test(p.controlTarget) || !Number.isInteger(p.controlStep) || p.controlStep < 1 || p.controlStep > 255) throw Error('Réglage des touches invalide.');
  if (!Number.isInteger(p.controlInterval) || p.controlInterval < 0 || p.controlInterval > 5000) throw Error('Intervalle des touches invalide.');
  p.parameterBindings=validateBindings(p.parameterBindings,p.shortcuts);
  p.webURL = destinationURL(p.webURL);
  if (p.localURL) p.localURL = destinationURL(p.localURL, true);
  if (!['auto', 'fr', 'en'].includes(p.language) || !['auto', 'dark', 'light'].includes(p.theme) || !['iowan', 'montserrat'].includes(p.font)) throw Error('Réglage invalide.');
  await chrome.storage.local.set({preferences: p});
  return p;
}
export function language(p) {
  return p.language === 'auto' ? (navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en') : p.language;
}
export function applyAppearance(p) {
  document.documentElement.lang = language(p);
  document.documentElement.dataset.theme = p.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p.theme;
  document.documentElement.dataset.font = p.font;
}
