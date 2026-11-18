/** Detection preferences are UI state, independent from the scientific zone fingerprint. */
export function originalSourceRegionOptions(excludeTexts){
 if(typeof excludeTexts!=='boolean')throw new TypeError('Invalid original source detection options.');
 return Object.freeze({schema:'sherloq.original-region-options/1',excludeTexts});
}

export function validateOriginalSourceRegionOptions(value){
 if(value===undefined)return null;
 if(!value||value.schema!=='sherloq.original-region-options/1'||typeof value.excludeTexts!=='boolean')throw new TypeError('Invalid original source detection options.');
 return originalSourceRegionOptions(value.excludeTexts);
}
