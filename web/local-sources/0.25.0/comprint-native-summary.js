/** Presentation only: values and contexts are owned by the scientific engine. */
export function comprintNativeSummary(output,language='fr'){
 const grids=output?.data?.statistics?.native_context_grids;
 if(output?.operation!=='jpeg.comprint'||output.status!=='ok'||!Array.isArray(grids)||!grids.length)return[];
 const en=language==='en',count=grids.length,mapped=grids.filter(g=>Number.isSafeInteger(g?.cells)&&g.cells>0).length,unmapped=count-mapped,n=v=>v.toLocaleString(en?'en':'fr');
 const rows=[{label:en?'Compression fingerprints':'Empreintes de compression',text:en?`${n(count)} native RGB contexts feed one shared statistical population. Spatial neighbours remain inside each context. The distance is not a forgery probability.`:`${n(count)} contextes RVB natifs alimentent une seule population statistique. Les voisinages restent propres à chaque contexte. La distance n’est pas une probabilité de falsification.`}];
 if(unmapped)rows.push({label:en?'Native map coverage':'Couverture de la carte native',text:en?`${n(unmapped)} of ${n(count)} contexts have no native SPAM grid: both dimensions must reach 100 pixels. Their fingerprints still contribute to global normalization; no map or zero score is invented there.`:`${n(unmapped)} ${unmapped===1?'contexte sur':'contextes sur'} ${n(count)} ${unmapped===1?'n’a':'n’ont'} pas de grille SPAM native : les deux dimensions doivent atteindre 100 pixels. ${unmapped===1?'Son empreinte contribue':'Leurs empreintes contribuent'} néanmoins à la normalisation globale ; aucune carte ni aucun score nul n’y sont inventés.`});
 return rows;
}
