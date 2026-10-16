"""Browser orchestration around unmodified official Comprint statistics.

Only global covariance arithmetic and independent EM restarts are partitioned.
All observations, 512 SPAM features, PCA32 whitening, 10 initial states, stopping
rule, original Gaussian-mixture code and deterministic max-likelihood choice stay.
"""
import time
import numpy as np
import scipy.linalg
from scipy.linalg.blas import dsyrk
from comprint_official.utility import gaussianMixture as gm_module
for name,value in [('float',float),('int',int),('bool',bool)]:
    if name not in np.__dict__: setattr(np,name,value)
def eigvalsh_compat(a,*args,eigvals=None,**kwargs):
    if eigvals is not None: kwargs['subset_by_index']=eigvals
    return scipy.linalg.eigvalsh(a,*args,**kwargs)
gm_module.eigvalsh=eigvalsh_compat
STATE={}

def model(mu=None,sigma=None,prior=None,outlier=.01):
    m=gm_module.gm(32,[0],[2],outliersProb=float(outlier),outliersNlogl=42,dtype=np.float64)
    if mu is not None:m.mu=np.array(mu,dtype=np.float64,copy=True)
    if sigma is not None:m.listSigma=[np.array(sigma,dtype=np.float64,copy=True)]
    if prior is not None:m.prioriProb=np.array(prior,dtype=np.float64,copy=True)
    return m

def execute_comprint(operation,a):
    t=time.perf_counter()
    if operation=='feature_chunk':
        from comprint_official import post_em
        mean,variance=a['moments'];fingerprint=a['fingerprint']
        residual=((fingerprint-np.float32(mean))*(1/np.float32(variance))).astype(np.float32)
        spam,valid,_,_,_=post_em.getSpamFromNoiseprint(residual,a['luminance'])
        row,column,rows,columns=map(int,a['crop'])
        spam=spam[row:row+rows,column:column+columns,:]
        valid=valid[row:row+rows,column:column+columns]
        if spam.shape!=(rows,columns,512):raise ValueError('Segmented SPAM geometry mismatch')
        return {'features':np.ascontiguousarray(spam.reshape(-1,512)),'valid':np.ascontiguousarray(valid.ravel().astype(np.uint8))},{'seconds':time.perf_counter()-t}
    if operation=='covariance_chunk':
        values=np.asarray(a['features'][a['valid'].astype(bool)],dtype=np.float64)-a['mean']
        upper=dsyrk(1.,np.asfortranarray(values),trans=1)
        lower=np.tril_indices(512,-1);upper[lower]=upper.T[lower]
        return {'covariance':upper},{'rows':len(values),'seconds':time.perf_counter()-t}
    if operation=='stream_basis':
        cov=a['covariance']/float(a['count'].ravel()[0])
        w,v=np.linalg.eigh(cov);w=w[::-1];v=v[:,::-1]
        return {'basis':v[:,:32]/np.sqrt(w[:32]),'eigs':w},{'seconds':time.perf_counter()-t}
    if operation=='project_chunk':
        return {'projected':np.matmul(a['features'],a['basis'])},{'seconds':time.perf_counter()-t}
    if operation in ('retain_training','retain_training_only'):
        STATE.clear();training=a['training'];STATE['training']=training
        if operation=='retain_training_only':return {},{'rows':len(training)}
        random=np.random.RandomState(0);mus=[];sigmas=[];priors=[];indices=[]
        # The original initializer recomputes the same population variance ten
        # times. Its result is shared; RNG draws and selected observations stay.
        variance=np.var(training,axis=0,keepdims=True)
        variance+=np.abs(-1.*np.spacing(np.max(variance)))
        for i in range(10):
            index=random.random_integers(low=0,high=len(training)-1,size=(1,))
            indices.append(int(index[0]));mus.append(training[index,:].copy());sigmas.append(np.diag(variance.flatten()));priors.append(np.array([[.99]],dtype=np.float64))
        return {'mu':np.asarray(mus),'Sigma':np.asarray(sigmas),'prior':np.asarray(priors),'initial_indices':np.asarray(indices,dtype=np.int32)},{'seconds':time.perf_counter()-t}
    if operation=='finish_chunk':
        m=model(a['mu'],a['Sigma'],a['prior'],float(a['outlier'].ravel()[0]))
        _,mahal=m.getNlogl(a['projected'])
        if not np.isfinite(mahal).all():raise ValueError('Nonfinite statistical map')
        return {'map':mahal.ravel()},{'seconds':time.perf_counter()-t}
    if operation=='prepare':
        from comprint_official import post_em
        STATE.clear()
        gray=a['luminance'];fingerprint=a['fingerprint']
        variance=np.var(fingerprint)
        if not np.isfinite(variance) or variance<=0:raise ValueError('Insufficient fingerprint variation')
        residual=((fingerprint-np.mean(fingerprint))*(1/variance)).astype(np.float32)
        spam,valid,r0,r1,size=post_em.getSpamFromNoiseprint(residual,gray)
        if np.sum(valid)<50:raise ValueError('Too few valid SPAM blocks')
        training=spam.reshape(-1,512)[valid.ravel(),:]
        # Same full-sample float64 mean as np.cov(rowvar=False,bias=True).
        mean=np.mean(training,axis=0,dtype=np.float64)
        STATE.update(spam=spam,valid=valid,range0=r0,range1=r1,imgsize=size,variance=float(variance),timings={'features':time.perf_counter()-t})
        return {'features':training,'mean':mean},{'valid_blocks':int(np.sum(valid)),'feature_dimensions':512}
    if operation=='covariance':
        values=np.asarray(a['features'],dtype=np.float64)-a['mean']
        upper=dsyrk(1.,np.asfortranarray(values),trans=1)
        lower=np.tril_indices(512,-1);upper[lower]=upper.T[lower]
        return {'covariance':upper},{'seconds':time.perf_counter()-t,'rows':len(values)}
    if operation=='basis':
        valid=STATE['valid'];spam=STATE['spam'];count=int(np.sum(valid))
        # Partial Gram matrices are reduced in ascending source-row order.
        cov=np.zeros((512,512),dtype=np.float64)
        for part in a['covariances']:cov+=part
        cov/=count
        w,v=np.linalg.eigh(cov);w=w[::-1];v=v[:,::-1]
        L=v[:,:32]/np.sqrt(w[:32])
        projected=np.matmul(spam.reshape(-1,512),L)
        training=projected[valid.ravel(),:]
        random=np.random.RandomState(0);mus=[];sigmas=[];priors=[];indices=[]
        for i in range(10):
            m=model();indices.append(int(m.setRandomParams(training,regularizer=-1.,randomState=random)[0]));mus.append(m.mu.copy());sigmas.append(m.listSigma[0].copy());priors.append(m.prioriProb.copy())
        STATE.update(projected=projected,L=L,eigs=w)
        STATE['timings']['basis_and_projection']=time.perf_counter()-t
        return {'training':training,'mu':np.asarray(mus),'Sigma':np.asarray(sigmas),'prior':np.asarray(priors),'initial_indices':np.asarray(indices,dtype=np.int32)},{}
    if operation in ('fit','fit_retained'):
        results=[];training=STATE['training'] if operation=='fit_retained' else a['training'];fit_seconds=[]
        for at in range(len(a['indices'])):
            m=model(a['mu'][at],a['Sigma'][at],a['prior'][at]);started=time.perf_counter()
            score,flag,iterations=m.EM(training,maxIter=100,regularizer=-1.)
            fit_seconds.append(time.perf_counter()-started);results.append((m,score,flag,iterations))
        return {'indices':a['indices'],'mu':np.asarray([x[0].mu for x in results]),'Sigma':np.asarray([x[0].listSigma[0] for x in results]),'prior':np.asarray([x[0].prioriProb for x in results]),'outlier':np.asarray([x[0].outliersProb for x in results]),'score':np.asarray([x[1] for x in results]),'iterations':np.asarray([x[3] for x in results],dtype=np.int32)},{'fit_seconds':fit_seconds}
    if operation=='finish':
        m=model(a['mu'],a['Sigma'],a['prior'],float(a['outlier'].ravel()[0]))
        _,mahal=m.getNlogl(STATE['projected']);mapp=mahal.reshape(STATE['valid'].shape)
        if not np.isfinite(mapp).all():raise ValueError('Nonfinite statistical map')
        outputs={'map':mapp,'valid':STATE['valid'].astype(np.uint8),'range0':STATE['range0'],'range1':STATE['range1'],'eigs':STATE['eigs']}
        metadata={'method':'comprint','statistics_policy':'official-Comprint-global-partitioned-f64','source_revision':'e79cd7d9bc768cde6d0fbf77d4cea79ec31ce2aa','grid_shape':list(mapp.shape),'original_shape':list(STATE['imgsize']),'valid_blocks':int(np.sum(STATE['valid'])),'spam_features':512,'pca_dimensions':32,'replicates':10,'max_iterations':100,'seed':0,'outliers_nlogl':42,'heatmap_percentile_99_5':float(np.percentile(mapp,99.5)),'score_is_probability':False,'ground_truth_available':False,'timings_seconds':{**STATE['timings'],'finish':time.perf_counter()-t},'partitioning':'global float64 mean, centered symmetric Gram, source-row-ordered reduction; identical source EM initializations and loop; no per-tile statistics/no changed features'}
        STATE.clear();return outputs,metadata
    raise ValueError('Unknown Comprint operation: '+operation)
