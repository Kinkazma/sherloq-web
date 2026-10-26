import {requireValue} from './errors.js';

/** A detector mask selects native centres. It is distinct from the source
 * membership that removes RGB before diffusion, pyramids and descriptors. */
export function assertCloningDetectionMask(mask,domain){
 if(!mask)return;
 const d=mask.surface?.descriptor??mask.pixels;
 requireValue(d&&d.width===domain.sourceWidth&&d.height===domain.sourceHeight&&typeof mask.sha256==='string'&&/^[a-f0-9]{64}$/.test(mask.sha256),'The detection mask must identify the verified Original native grid.');
 if(mask.surface)requireValue(typeof mask.surface.readWindow==='function','The detection mask must provide native RGB windows.');
 else requireValue(d.format==='rgb8'&&d.data instanceof Uint8Array&&d.data.length===d.width*d.height*3,'The detection mask must contain complete native RGB8 pixels.');
}
