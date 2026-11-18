// Algorithm identity only: numeric slider values stay in their native recipe.
// A slow local equalizer must not lower the next unrelated display method.
export function previewEqualizationFamily(params={}){return 'eq='+String(params.equalization?.method??(params.equalize||params.levels===0?'histogram':'none'));}
