import {noisesnifferOwnerRetirement as acknowledgedRetirement} from './noisesniffer-owner-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
// Removed optional cache entries remain owned after a refused storage ACK.
// Successful siblings retire once; pressure/disposal can retry the remainder.
export function createJpegEntryRetirement(){
 const records=new Map();
 const retire=entry=>{let owner=records.get(entry);if(!owner){owner=acknowledgedRetirement([()=>entry.store.dispose()],{onRetired:()=>records.delete(entry)});records.set(entry,owner);}return owner();};
 return{retire,defer(entry){void retire(entry).catch(()=>{});},drain(options){return retireCompositeOwners([...records.values()],options);},get size(){return records.size;}};
}
