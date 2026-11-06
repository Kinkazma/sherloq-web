"""Scientific definitions independent of model inference and execution host."""
import numpy as np
from PIL import Image

BINS=4096
THRESHOLDS=[0.,.5,.75]


def ratio(a,b):return float(a/b) if b else None
def metrics(tp,fp,tn,fn):
    tp,fp,tn,fn=map(int,(tp,fp,tn,fn))
    return dict(TP=tp,FP=fp,TN=tn,FN=fn,F1=ratio(2*tp,2*tp+fp+fn),IoU=ratio(tp,tp+fp+fn),
        precision=ratio(tp,tp+fp),recall=ratio(tp,tp+fn),specificity=ratio(tn,tn+fp),
        accuracy=ratio(tp+tn,tp+fp+tn+fn),false_positive_rate=ratio(fp,fp+tn),
        balanced_accuracy=(tp/(tp+fn)+tn/(tn+fp))/2 if (tp+fn) and (tn+fp) else None)


def native_rgb(path):
    with Image.open(path) as image:return np.asarray(image.convert('RGB')).copy()


def labels(case,data_root):
    h,w=case['shape']
    if not case['is_tampered']:
        return np.zeros((h,w),np.uint8),('columbia_authentic' if case['dataset']=='columbia' else 'binary'),'ok'
    if not case.get('mask'):return None,None,'mask_missing'
    with Image.open(data_root/case['mask']) as image:
        if [image.height,image.width]!=[h,w]:return None,None,'mask_shape_mismatch'
        if case['mask_kind']=='columbia':
            a=np.asarray(image.convert('RGB')).astype(np.int16);r,g,b=np.moveaxis(a,2,0)
            out=np.full((h,w),255,np.uint8)
            out[(r>=100)&(r>=g+50)&(r>=b+50)]=1
            out[(g>=100)&(g>=r+50)&(g>=b+50)]=2
            return out,'columbia_provenance','ok'
        a=np.asarray(image.convert('L'))
    if case['mask_kind']=='korus':
        out=np.full((h,w),255,np.uint8);out[a==0]=0;out[a==255]=1;out[a==128]=2
        return out,'korus','ok'
    return (a>=128).astype(np.uint8),'binary','ok'


def histograms(p,lab):
    index=np.floor(np.clip(p,0,1)*BINS).astype(np.int32)
    return np.stack([np.bincount(index[lab==k],minlength=BINS+1).astype(np.uint64) for k in range(3)])


def pixel_views(h,kind):
    if kind in ['binary','korus']:return {'primary':(h[1]+h[2],h[0]),**({'korus_semantic':(h[1],h[0])} if kind=='korus' else {})}
    if kind=='columbia_provenance':return {'columbia_camera1':(h[1],h[2]),'columbia_camera2':(h[2],h[1])}
    return {} # Columbia authentic controls are evaluated at image level.


def at_threshold(positive,negative,t):
    # Requested thresholds and the full curve lie exactly on this power-of-two grid.
    scaled=t*BINS
    if abs(scaled-round(scaled))>1e-8:raise ValueError('Use native probability maps for an exact off-grid threshold')
    start=int(round(scaled));tp=int(positive[start:].sum());fp=int(negative[start:].sum())
    return metrics(tp,fp,int(negative.sum())-fp,int(positive.sum())-tp)


def image_scores(p):
    a=p.ravel();n=max(1,int(np.ceil(len(a)*.01)));cut=len(a)-n
    top=np.partition(a,cut)[cut:]
    return dict(mean_top_1_percent_localization=float(np.mean(top,dtype=np.float64)),maximum=float(a.max()),
        percentile_99=float(np.quantile(a,.99)),percentile_99_9=float(np.quantile(a,.999)))


def agreement(a,b):
    out=dict(MAE=float(np.mean(np.abs(a-b),dtype=np.float64)),RMSE=float(np.sqrt(np.mean((a-b)**2,dtype=np.float64))),
        max_abs=float(np.max(np.abs(a-b))),thresholds={})
    for t in THRESHOLDS:
        x=a>=t;y=b>=t;tp=int(np.sum(x&y));fp=int(np.sum(~x&y));tn=int(np.sum(~x&~y));fn=int(np.sum(x&~y))
        out['thresholds'][str(t)]=metrics(tp,fp,tn,fn)
    return out
