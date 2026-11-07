import {EngineError} from './unified-engine/src/errors.js';

/** Presentation metadata borrows the admitted input; it never creates pixels,
 * changes scientific arrays, or grants a method a source-domain capability. */
export function extensionSourcePresentation(output){
 const domain=output?.sourceRegionDomain,source=output?.sourceRegionSourceSurface;
 if(!domain)return output;
 const metadata={sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin],sourceRegionSourceSurface:source};
 const descriptor=value=>value&&typeof value.id==='string'&&Number.isInteger(value.revision)?{...value,...metadata}:value;
 const records=value=>value?Object.fromEntries(Object.entries(value).map(([name,record])=>[name,descriptor(record)])):value;
 return{...output,...(output.surface?{surface:descriptor(output.surface)}:{}),...(output.planeSurfaces?{planeSurfaces:records(output.planeSurfaces)}:{}),...(output.maskSurfaces?{maskSurfaces:records(output.maskSurfaces)}:{})};
}

export function responseSourceSurface(display,original){
 const domain=display?.sourceRegionDomain,source=display?.sourceRegionSourceSurface??(!domain?original:null);
 if(!source||source.format!=='rgb8'||source.width!==display.width||source.height!==display.height)throw new EngineError('CACHE_MISS','The admitted source grid is unavailable for this response presentation.');
 if(domain&&(domain.width!==display.width||domain.height!==display.height||!Array.isArray(domain.origin)))throw new EngineError('SOURCE_REGIONS_INVALID','Response presentation and original-source domain grids differ.');
 return source;
}
export function responseProxyKey(display,source,side){
 const presentation=display.comprintPresentation??display.dtdPresentation,score=presentation?.score;
 return JSON.stringify([score?.id,score?.revision,side,source.id,source.revision,display.sourceRegionDomain?.fingerprint??null]);
}
