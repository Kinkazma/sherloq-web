// Descriptive results on the Sherloq corpus, 5 November 2026.
// Display data only: no model loading, inference, or scientific parameters.
const freeze=value=>{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};
const DATA=freeze({
 "dda": {
  "method": "dda",
  "name": "DDA",
  "rank": 1,
  "recommendation": {
   "fr": "Meilleur équilibre global observé sur ce corpus.",
   "en": "Best overall balance observed on this corpus."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.46540880503144655,
    "falsePositiveRate": 0.16954022988505746,
    "precision": 0.714975845410628,
    "accuracy": 0.6561561561561562,
    "balancedAccuracy": 0.6479342875731946
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.5660377358490566,
    "falsePositiveRate": 0.09770114942528736,
    "precision": 0.8411214953271028,
    "accuracy": 0.7417417417417418,
    "balancedAccuracy": 0.7341682932118846
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.36477987421383645,
    "falsePositiveRate": 0.2413793103448276,
    "precision": 0.58,
    "accuracy": 0.5705705705705706,
    "balancedAccuracy": 0.5617002819345044
   }
  }
 },
 "gapl": {
  "method": "gapl",
  "name": "GAPL",
  "rank": 2,
  "recommendation": {
   "fr": "Repère davantage d’images IA que DDA, avec plus de fausses alertes.",
   "en": "Detects more AI images than DDA, with more false alerts."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.6446540880503144,
    "falsePositiveRate": 0.3936781609195402,
    "precision": 0.5994152046783626,
    "accuracy": 0.6246246246246246,
    "balancedAccuracy": 0.6254879635653872
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.7987421383647799,
    "falsePositiveRate": 0.3218390804597701,
    "precision": 0.6939890710382514,
    "accuracy": 0.7357357357357357,
    "balancedAccuracy": 0.7384515289525049
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.49056603773584906,
    "falsePositiveRate": 0.46551724137931033,
    "precision": 0.49056603773584906,
    "accuracy": 0.5135135135135135,
    "balancedAccuracy": 0.5125243981782693
   }
  }
 },
 "spai": {
  "method": "spai",
  "name": "SPAI",
  "rank": 3,
  "recommendation": {
   "fr": "Repère le plus d’images IA, mais accuse aussi le plus de fichiers humains.",
   "en": "Detects the most AI images, but also wrongly flags the most human images."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.6666666666666666,
    "falsePositiveRate": 0.45977011494252873,
    "precision": 0.5698924731182796,
    "accuracy": 0.6006006006006006,
    "balancedAccuracy": 0.603448275862069
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.6226415094339622,
    "falsePositiveRate": 0.2988505747126437,
    "precision": 0.6556291390728477,
    "accuracy": 0.6636636636636637,
    "balancedAccuracy": 0.6618954673606593
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.710691823899371,
    "falsePositiveRate": 0.6206896551724138,
    "precision": 0.5113122171945701,
    "accuracy": 0.5375375375375375,
    "balancedAccuracy": 0.5450010843634786
   }
  }
 },
 "prl": {
  "method": "prl",
  "name": "PRL",
  "rank": 4,
  "recommendation": {
   "fr": "Moins de fausses alertes que DDA, mais une détection plus incomplète des images IA.",
   "en": "Fewer false alerts than DDA, but more AI images are missed."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.2138364779874214,
    "falsePositiveRate": 0.1235632183908046,
    "precision": 0.6126126126126126,
    "accuracy": 0.56006006006006,
    "balancedAccuracy": 0.5451366297983083
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.2641509433962264,
    "falsePositiveRate": 0.12643678160919541,
    "precision": 0.65625,
    "accuracy": 0.5825825825825826,
    "balancedAccuracy": 0.5688570808935155
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.16352201257861634,
    "falsePositiveRate": 0.1206896551724138,
    "precision": 0.5531914893617021,
    "accuracy": 0.5375375375375375,
    "balancedAccuracy": 0.5214161787031013
   }
  }
 },
 "community-forensics": {
  "method": "community-forensics",
  "name": "Community Forensics 384",
  "rank": 5,
  "recommendation": {
   "fr": "Très peu de fausses alertes, mais une grande partie des images IA est manquée.",
   "en": "Very few false alerts, but a large share of AI images is missed."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.1069182389937107,
    "falsePositiveRate": 0.031609195402298854,
    "precision": 0.7555555555555555,
    "accuracy": 0.5570570570570571,
    "balancedAccuracy": 0.5376545217957059
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.1949685534591195,
    "falsePositiveRate": 0.017241379310344827,
    "precision": 0.9117647058823529,
    "accuracy": 0.6066066066066066,
    "balancedAccuracy": 0.5888635870743874
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.018867924528301886,
    "falsePositiveRate": 0.04597701149425287,
    "precision": 0.2727272727272727,
    "accuracy": 0.5075075075075075,
    "balancedAccuracy": 0.4864454565170245
   }
  }
 },
 "bfree": {
  "method": "bfree",
  "name": "B-Free",
  "rank": 6,
  "recommendation": {
   "fr": "Repérage très faible des images IA sur ce corpus.",
   "en": "Very low detection of AI images on this corpus."
  },
  "results": {
   "all": {
    "n": 666,
    "human": 348,
    "ai": 318,
    "recall": 0.07232704402515723,
    "falsePositiveRate": 0.08045977011494253,
    "precision": 0.45098039215686275,
    "accuracy": 0.515015015015015,
    "balancedAccuracy": 0.49593363695510734
   },
   "sans bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.0880503144654088,
    "falsePositiveRate": 0.05172413793103448,
    "precision": 0.6086956521739131,
    "accuracy": 0.5375375375375375,
    "balancedAccuracy": 0.5181630882671872
   },
   "avec bruit": {
    "n": 333,
    "human": 174,
    "ai": 159,
    "recall": 0.05660377358490566,
    "falsePositiveRate": 0.10919540229885058,
    "precision": 0.32142857142857145,
    "accuracy": 0.4924924924924925,
    "balancedAccuracy": 0.4737041856430275
   }
  }
 }
});

export const DETECTOR_STUDY_ORDER=Object.freeze(['dda','gapl','spai','prl','community-forensics','bfree']);
const QUESTIONS=freeze([
 {metric:'recall',fr:'Parmi les images IA, lesquelles sont correctement repérées ?',en:'Which AI-generated images are correctly detected?'},
 {metric:'falsePositiveRate',fr:'Parmi les images non IA, lesquelles sont accusées à tort ?',en:'Which non-AI images are wrongly flagged as AI?'},
 {metric:'precision',fr:'Parmi les alertes, lesquelles sont justifiées ?',en:'Which alerts are justified?'},
 {metric:'accuracy',fr:'Sur l’ensemble, quelles décisions sont correctes ?',en:'Across all images, which decisions are correct?'}
]);
const COPY=freeze({
 fr:{title:'Résultats sur les images de l’étude',source:'Étude Sherloq · 5 novembre 2026 · 666 fichiers',metric:'Ce qu’indique le pourcentage',population:'348 fichiers humains · 318 images IA',rank:'Rang global',of:'sur',criterion:'selon l’exactitude équilibrée'},
 en:{title:'Results on the study’s images',source:'Sherloq study · 5 November 2026 · 666 files',metric:'What the percentage describes',population:'348 human images · 318 AI images',rank:'Overall rank',of:'of',criterion:'by balanced accuracy'}
});

/** Read-only public study data. UI bfree and source b-free identify the same model. */
export function detectorStudy(method){
 if(typeof method!=='string')return null;
 const key=method==='b-free'?'bfree':method;
 return Object.hasOwn(DATA,key)?DATA[key]:null;
}

/** The existing gauge evaluation block, using only the 666-file population. */
export function renderDetectorStudy(document,{method,language='fr'}={}){
 const study=detectorStudy(method);
 if(!study)return null;
 const lang=language==='en'?'en':'fr',copy=COPY[lang],result=study.results.all;
 const percent=new Intl.NumberFormat(lang,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
 const node=(tag,text)=>{
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  return element;
 };
 const section=node('section');
 section.className='generation-evaluation';
 section.dataset.detectorStudy=study.method;
 section.lang=lang;
 const source=node('span',copy.source);
 source.className='generation-study-source';
 source.title=copy.population+'. '+copy.rank+' '+study.rank+' '+copy.of+' '+DETECTOR_STUDY_ORDER.length+' '+copy.criterion+'. '+study.recommendation[lang];
 const table=node('table'),head=node('thead'),headRow=node('tr'),body=node('tbody');
 table.setAttribute('aria-label',copy.title+' · '+study.name+' · '+copy.population);
 for(const text of [copy.metric,study.name]){const cell=node('th',text);cell.setAttribute('scope','col');headRow.append(cell);}
 head.append(headRow);
 QUESTIONS.forEach(question=>{
  const row=node('tr'),label=node('th',question[lang]),value=node('td',percent.format(result[question.metric]));
  label.setAttribute('scope','row');
  value.dataset.detectorStudyMetric=question.metric;
  value.className='generation-rate-emphasis';
  if(question.metric==='accuracy')row.className='generation-study-overall';
  row.append(label,value);body.append(row);
 });
 table.append(head,body);
 section.append(node('h3',copy.title),source,table);
 return section;
}
