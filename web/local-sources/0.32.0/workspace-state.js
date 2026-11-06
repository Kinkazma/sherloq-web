// Navigation never owns or cancels calculation lifetimes.
export const DEFAULT_FAVORITES=Object.freeze(['colors.pca','ela.classic','detail.gradient','tampering.copyMove.sparse']);
export function createWorkspaceState(){
 const documents=new Map(),favorites=new Set(DEFAULT_FAVORITES),groups=new Set();
 let active=null,layout='tabs',language='fr',toolsVisible=true;
 return {
  documents,favorites,groups,
  get active(){return active;},get layout(){return layout;},get language(){return language;},get toolsVisible(){return toolsVisible;},
  open(id,value){if(!documents.has(id))documents.set(id,Object.assign(value,{id}));active=id;return documents.get(id);},
  select(id){if(documents.has(id))active=id;},
  close(id){const ids=[...documents.keys()],index=ids.indexOf(id),value=documents.get(id);documents.delete(id);if(active===id)active=ids[index-1]??ids[index+1]??null;return value;},
  clear(){const previous=[...documents.values()];documents.clear();active=null;return previous;},
  setLanguage(value){if(!['fr','en'].includes(value))throw Error('Invalid language');language=value;},
  setLayout(value){if(!['tabs','tile','cascade'].includes(value))throw Error('Invalid layout');layout=value;},
  toggleTools(){toolsVisible=!toolsVisible;},
  toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);if(!favorites.size)groups.delete('Favorites');},
  setGroup(id,open){open?groups.add(id):groups.delete(id);},
  preferences(){return {language,layout,toolsVisible,favorites:[...favorites]};},
  restore(value={},validTools=[]){if(value.language)this.setLanguage(value.language);if(value.layout)this.setLayout(value.layout);if(typeof value.toolsVisible==='boolean')toolsVisible=value.toolsVisible;if(Array.isArray(value.favorites)){favorites.clear();for(const id of value.favorites)if(validTools.includes(id))favorites.add(id);}},
 };
}
