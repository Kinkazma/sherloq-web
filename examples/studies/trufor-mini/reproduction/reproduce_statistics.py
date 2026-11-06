#!/usr/bin/env python3
"""Reproduce the main descriptive tables and paired ALL bootstrap from CSV.

Dependencies: Python >=3.10 and NumPy. No neural-network package, model weights,
image library, server connection or private file is used. This reproduces saved
measurements; it does not independently rerun the two detectors.

    python reproduce_statistics.py --replicates 2000
    python reproduce_statistics.py --input measurements.csv --output verification.json

The default output is reproduced-results.json beside this script. Set
--replicates 0 (the default) for point estimates without bootstrap intervals.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import numpy as np

MODELS=('trufor_original','proxy_current')
THRESHOLDS=(0.,.5,.75)
PIPELINES=(('TruFor - simplified score','trufor_original','mean_top_1_percent_localization'),
           ('TruFor Mini - simplified score','proxy_current','mean_top_1_percent_localization'),
           ('TruFor official','trufor_original','official_global_score'))

def ratio(a,b):return float(a/b) if b else None
def metrics(tp,fp,tn,fn):
    tp,fp,tn,fn=map(int,(tp,fp,tn,fn))
    P=tp+fn;N=tn+fp;den=(tp+fp)*(tp+fn)*(tn+fp)*(tn+fn)
    return dict(TP=tp,TN=tn,FP=fp,FN=fn,F1=ratio(2*tp,2*tp+fp+fn),
        IoU=ratio(tp,tp+fp+fn),precision=ratio(tp,tp+fp),recall=ratio(tp,P),
        specificity=ratio(tn,N),false_positive_rate=ratio(fp,N),
        false_negative_rate=ratio(fn,P),accuracy=ratio(tp+tn,P+N),
        balanced_accuracy=(tp/P+tn/N)/2 if P and N else None,
        negative_predictive_value=ratio(tn,tn+fn),
        MCC=(tp*tn-fp*fn)/math.sqrt(den) if den else None)

def clean(x):
    if isinstance(x,dict):return {str(k):clean(v) for k,v in x.items()}
    if isinstance(x,(list,tuple)):return [clean(v) for v in x]
    if isinstance(x,np.ndarray):return clean(x.tolist())
    if isinstance(x,np.generic):return clean(x.item())
    if isinstance(x,float) and not math.isfinite(x):return None
    return x

class Ranking:
    """Tie-aware exact weighted AUROC and non-interpolated AP."""
    def __init__(self,y,s):
        self.y=y;self.s=s;self.order=np.argsort(-s,kind='stable')
        z=s[self.order];self.first=np.r_[0,np.flatnonzero(z[1:]!=z[:-1])+1]
    def evaluate(self,w=None):
        if w is None:w=np.ones(len(self.y))
        p=np.add.reduceat((w*self.y)[self.order],self.first)
        n=np.add.reduceat((w*(1-self.y))[self.order],self.first)
        P=p.sum();N=n.sum()
        if not P or not N:return np.nan,np.nan
        tp=np.cumsum(p);fp=np.cumsum(n)
        auc=np.sum(p*(N-fp+.5*n))/(P*N)
        precision=np.divide(tp,tp+fp,out=np.zeros_like(tp),where=tp+fp>0)
        return float(auc),float(np.sum(p*precision)/P)

def interval(samples):
    a=np.asarray(samples,float);a=a[np.isfinite(a)]
    return dict(low=float(np.quantile(a,.025)),high=float(np.quantile(a,.975)),
                finite_replicates=len(a)) if len(a) else None

def read_data(path):
    with path.open(newline='') as f:rows=list(csv.DictReader(f))
    if not rows:raise ValueError('The input CSV is empty.')
    if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate case IDs.')
    for r in rows:
        for k in ('is_tampered','previously_examined','unique_source_first'):
            if r[k] not in ('0','1'):raise ValueError('Invalid binary flag: '+k)
        if len(r['bootstrap_component_sha256'])!=64 or any(c not in '0123456789abcdef' for c in r['bootstrap_component_sha256']):
            raise ValueError('Invalid opaque component hash.')
    y=np.array([int(r['is_tampered']) for r in rows],float)
    ds=np.array([r['dataset'] for r in rows])
    seen=np.array([r['previously_examined']=='1' for r in rows])
    first=np.array([r['unique_source_first']=='1' for r in rows])
    scores=np.array([[float(r[k]) for k in ('score_trufor_common','score_mini_common','score_trufor_official')] for r in rows])
    times=np.array([[float(r[k]) for k in ('seconds_trufor','seconds_mini')] for r in rows])
    if not np.isfinite(scores).all() or ((scores<0)|(scores>1)).any():raise ValueError('Invalid scores.')
    if not np.isfinite(times).all() or (times<=0).any():raise ValueError('Invalid inference durations.')
    pix=np.zeros((len(rows),2,3,4),float);valid=np.zeros(len(rows),bool)
    macro=np.zeros((len(rows),2,3),float);ious=np.zeros_like(macro);fpr=np.zeros_like(macro)
    positive=np.zeros(len(rows),bool)
    for i,r in enumerate(rows):
        if not r['positive_pixels'] and not r['negative_pixels']:continue
        P=int(r['positive_pixels']);N=int(r['negative_pixels'])
        if P<0 or N<0:raise ValueError('Invalid annotation pixel counts.')
        valid[i]=True;positive[i]=P>0
        for j,name in enumerate(('trufor','mini')):
            for k,tag in enumerate((None,'05','075')):
                tp,fp=(P,N) if tag is None else (int(r['tp_'+name+'_'+tag]),int(r['fp_'+name+'_'+tag]))
                if not (0<=tp<=P and 0<=fp<=N):raise ValueError('Invalid pixel confusion counts.')
                pix[i,j,k]=tp,fp,N-fp,P-tp
                q=metrics(tp,fp,N-fp,P-tp)
                macro[i,j,k]=q['F1'] or 0;ious[i,j,k]=q['IoU'] or 0;fpr[i,j,k]=q['false_positive_rate'] or 0
    return rows,y,ds,seen,first,scores,times,pix,valid,positive,macro,ious,fpr

def bootstrap_all(rows,y,ds,scores,times,pix,positive,macro,replicates,seed):
    # The CSV preserves manifest order. First appearance orders components by
    # their earliest original row; sorting opaque hashes would change the RNG
    # assignment and would not reproduce the recorded percentile intervals.
    keys=[];strata=[]
    for dataset in sorted(set(ds)):
        ids=list(dict.fromkeys(r['bootstrap_component_sha256'] for r in rows if r['dataset']==dataset))
        start=len(keys);keys.extend((dataset,c) for c in ids)
        strata.append(np.arange(start,len(keys)))
    lookup={k:i for i,k in enumerate(keys)}
    inv=np.array([lookup[(r['dataset'],r['bootstrap_component_sha256'])] for r in rows])
    rankings=[Ranking(y,scores[:,j]) for j in range(3)]
    names=[]
    for prefix in ('original_common','mini_common','original_official'):
        names.extend((prefix+'__AUROC',prefix+'__AP'))
        for t in (.5,.75):
            names.extend(prefix+'__'+m+'_'+str(t) for m in ('F1','balanced_accuracy','recall','false_positive_rate'))
    names+=['pixel_micro_delta_F1_0.5','pixel_micro_delta_F1_0.75',
        'pixel_macro_delta_F1_0.5','pixel_macro_delta_F1_0.75','forward_ratio_of_sums',
        'image_common_delta_AUROC','image_common_delta_AP',
        'image_common_delta_F1_0.5','image_common_delta_F1_0.75']
    rng=np.random.default_rng(seed+sum(map(ord,'ALL')))
    boot=np.full((replicates,len(names)),np.nan)
    predictions={(j,t):scores[:,j]>=t for j in range(3) for t in (.5,.75)}
    for b in range(replicates):
        draw=np.concatenate([rng.choice(st,len(st),replace=True) for st in strata])
        w=np.bincount(draw,minlength=len(keys))[inv].astype(float)
        P=np.sum(w*y);N=np.sum(w*(1-y));stats=[];f1={};rank=[]
        for j,ranking in enumerate(rankings):
            auc,ap=ranking.evaluate(w);stats.extend((auc,ap));rank.append((auc,ap))
            for t in (.5,.75):
                p=predictions[j,t];tp=np.sum(w*y*p);fp=np.sum(w*(1-y)*p);fn=P-tp;tn=N-fp
                f=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else np.nan
                stats.extend((f,(tp/P+tn/N)/2 if P and N else np.nan,tp/P if P else np.nan,fp/N if N else np.nan))
                f1[j,t]=f
        micro=[];macros=[]
        for k in (1,2):
            values=[];means=[]
            for j in range(2):
                tp,fp,tn,fn=np.sum(pix[:,j,k]*w[:,None],axis=0)
                values.append(2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else np.nan)
                means.append(np.sum(macro[:,j,k]*w*positive)/np.sum(w*positive) if np.sum(w*positive) else np.nan)
            micro.append(values[1]-values[0]);macros.append(means[1]-means[0])
        stats+=micro+macros+[np.sum(times[:,0]*w)/np.sum(times[:,1]*w),
            rank[1][0]-rank[0][0],rank[1][1]-rank[0][1],
            f1[1,.5]-f1[0,.5],f1[1,.75]-f1[0,.75]]
        boot[b]=stats
    return dict(clusters=len(keys),images=len(rows),replicates=replicates,confidence_level=.95,
        seed_base=seed,method='Paired percentile bootstrap; connected source components resampled within dataset strata.',
        intervals={name:interval(boot[:,j]) for j,name in enumerate(names)})

def analyse(path,replicates,seed):
    rows,y,ds,seen,first,scores,times,pix,valid,positive,macro,ious,fpr=read_data(path)
    groups={'ALL':np.arange(len(rows))}
    groups.update({d:np.flatnonzero(ds==d) for d in sorted(set(ds))})
    groups['EXCLUDING_IMD2020']=np.flatnonzero(ds!='imd2020-real-life')
    groups['NOT_PREVIOUSLY_EXAMINED']=np.flatnonzero(~seen)
    groups['PREVIOUSLY_EXAMINED']=np.flatnonzero(seen)
    groups['UNIQUE_SOURCE_SHA256']=np.flatnonzero(first)
    image_rows=[];pixel_rows=[];macro_rows=[];timing_rows=[];agreement_rows=[]
    for group,idx in groups.items():
        if not len(idx):continue
        Y=y[idx];S=scores[idx];T=times[idx];v=valid[idx];pos=positive[idx];auth=(Y==0)&v
        for j,(name,model,score) in enumerate(PIPELINES):
            auc,ap=Ranking(Y,S[:,j]).evaluate()
            for t in THRESHOLDS:
                p=S[:,j]>=t
                q=metrics(np.sum(Y*p),np.sum((1-Y)*p),np.sum((1-Y)*(~p)),np.sum(Y*(~p)))
                image_rows.append(dict(dataset=group,model=model,pipeline=name,score=score,threshold=t,
                                       images=len(idx),AUROC=auc,AP=ap,**q))
        for j,model in enumerate(MODELS):
            for k,t in enumerate(THRESHOLDS):
                pixel_rows.append(dict(dataset=group,model=model,threshold=t,view='primary',
                    valid_images=int(v.sum()),positive_mask_images=int(pos.sum()),**metrics(*pix[idx,j,k].sum(axis=0))))
                macro_rows.append(dict(dataset=group,model=model,threshold=t,positive_mask_images=int(pos.sum()),
                    macro_F1_tampered=float(macro[idx,j,k][pos].mean()) if pos.any() else None,
                    macro_IoU_tampered=float(ious[idx,j,k][pos].mean()) if pos.any() else None,
                    authentic_images=int(auth.sum()),pristine_false_pixel_fraction_mean=float(fpr[idx,j,k][auth].mean()) if auth.any() else None))
        speed=T[:,0]/T[:,1]
        timing_rows.append(dict(dataset=group,images=len(idx),full_forward_sum_seconds=T[:,0].sum(),
            mini_forward_sum_seconds=T[:,1].sum(),full_forward_mean_seconds=T[:,0].mean(),mini_forward_mean_seconds=T[:,1].mean(),
            ratio_of_sums=T[:,0].sum()/T[:,1].sum(),paired_ratio_median=np.median(speed),
            paired_ratio_q05=np.quantile(speed,.05),paired_ratio_q95=np.quantile(speed,.95),
            paired_ratio_geometric_mean=np.exp(np.log(speed).mean()),mini_faster_images=int((speed>1).sum()),
            full_median_seconds=np.median(T[:,0]),mini_median_seconds=np.median(T[:,1]),
            forward_time_reduction_fraction=1-T[:,1].sum()/T[:,0].sum()))
        chosen=[rows[i] for i in idx]
        area=np.array([int(r['native_pixels']) for r in chosen])
        mae=np.array([float(r['map_mae']) for r in chosen]);rmse=np.array([float(r['map_rmse']) for r in chosen])
        for t,tag in ((0.,None),(.5,'05'),(.75,'075')):
            counts=[];dice=[];dice_tampered=[];empty=0
            for r in chosen:
                if tag is None:tp,fp,fn=int(r['native_pixels']),0,0
                else:tp,fp,fn=(int(r['agreement_'+c+'_'+tag]) for c in ('tp','fp','fn'))
                tn=int(r['native_pixels'])-tp-fp-fn
                if min(tp,fp,tn,fn)<0:raise ValueError('Invalid direct-agreement counts.')
                counts.append((tp,fp,tn,fn));q=metrics(tp,fp,tn,fn)
                if q['F1'] is not None:
                    dice.append(q['F1'])
                    if r['is_tampered']=='1':dice_tampered.append(q['F1'])
                else:empty+=1
            agreement_rows.append(dict(dataset=group,threshold=t,images=len(idx),map_MAE_macro=mae.mean(),
                map_MAE_pixel_weighted=np.average(mae,weights=area),map_RMSE_pixel_weighted=np.sqrt(np.average(rmse**2,weights=area)),
                agreement_Dice_macro_nonempty=np.mean(dice) if dice else None,
                agreement_Dice_macro_tampered_nonempty=np.mean(dice_tampered) if dice_tampered else None,
                both_empty_maps=empty,**metrics(*np.sum(counts,axis=0))))
    out=dict(version='public-reproduction-1',input_csv_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        completed_images=len(rows),authentic_images=int((y==0).sum()),tampered_images=int(y.sum()),
        distinct_source_hashes=int(first.sum()),bootstrap_connected_components=len(set(r['bootstrap_component_sha256'] for r in rows)),
        image_metrics=image_rows,pixel_primary_metrics=pixel_rows,pixel_macro=macro_rows,
        timings=timing_rows,direct_agreement=agreement_rows,
        scope='Point estimates, all prespecified image thresholds, main binary localisation, direct map agreement and workload timing. Pixel ranking histograms and secondary border metrics are not reconstructed from this compact CSV; fresh saved maps or histograms are needed for spatial reanalysis.',
        caveats=[
            'Common top-1-percent image score is not the original learned global detector or a calibrated probability.',
            'No claim of unseen-data validation: original training overlap and development-examined records remain relevant.',
            'Components join declared source groups and identical source-image hashes. Donor dependencies in CASIA and Columbia remain incompletely known.',
            'Main estimates retain the 6246 manifest entries. unique_source_first marks the first occurrence of each source-image hash for descriptive sensitivity only.',
            'Timing intervals describe this image mix, not repeated independent timing runs. Chronometers are per-model forward durations during concurrent execution, original before Mini.',
            'Bootstrap intervals are descriptive, without multiple-comparison adjustment or a prespecified equivalence margin.'
        ])
    if replicates:
        out['bootstrap']={'ALL':bootstrap_all(rows,y,ds,scores,times,pix,positive,macro,replicates,seed)}
    return clean(out)

def main():
    here=Path(__file__).resolve().parent
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input',type=Path,default=here/'measurements.csv')
    parser.add_argument('--output',type=Path,default=here/'reproduced-results.json')
    parser.add_argument('--replicates',type=int,default=0)
    parser.add_argument('--seed',type=int,default=20261103)
    args=parser.parse_args()
    if args.replicates<0:parser.error('--replicates must be nonnegative.')
    if args.output.resolve()==args.input.resolve():parser.error('Output cannot overwrite input CSV.')
    result=analyse(args.input,args.replicates,args.seed)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print('Reproduced',result['completed_images'],'entries;',args.replicates,'bootstrap replicates.')
    print('Inference was not run. Output:',args.output.name)

if __name__=='__main__':main()
