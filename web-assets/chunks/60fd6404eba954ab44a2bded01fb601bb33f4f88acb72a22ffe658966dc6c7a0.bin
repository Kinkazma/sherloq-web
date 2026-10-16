"""Bounded global EM for Comprint, evaluated against the unmodified author EM.

Loaded after kernel.py in the same namespace. Every valid 32D observation is
retained. Only N×32 temporary residuals/dot products are split into blocks;
posterior N×2, initialization indices, Gaussian/outlier model, regularization,
likelihood selection and stopping rule keep the published definitions.
"""

def _comprint_chunk_variance(training, rows=8192):
    mean=np.zeros(32,dtype=np.float64)
    for at in range(0,len(training),rows):
        mean+=np.sum(training[at:at+rows],axis=0,dtype=np.float64)
    mean/=len(training)
    variance=np.zeros(32,dtype=np.float64)
    for at in range(0,len(training),rows):
        residual=training[at:at+rows]-mean
        variance+=np.sum(residual*residual,axis=0,dtype=np.float64)
    return (variance/len(training)).reshape(1,32)

def _comprint_expectation_chunks(m, training, posterior, rows=8192):
    total=np.float64(0.)
    for at in range(0,len(training),rows):
        logit=m.getLoglh(training[at:at+rows])
        maximum=np.max(logit,axis=1,keepdims=True)
        probability=np.exp(logit-maximum)
        denominator=np.sum(probability,axis=1,keepdims=True)
        posterior[at:at+rows]=probability/denominator
        total+=np.sum(np.log(denominator)+maximum,dtype=np.float64)
    return total/len(training)

def _comprint_maximization_chunks(m, training, posterior, rows=8192):
    # The original model has one inlier Gaussian and a fixed-cost outlier.
    # Its second, unused mu row is preserved for exact output conventions.
    mass=np.sum(posterior,axis=0,dtype=np.float64)
    numerator=np.zeros((2,32),dtype=np.float64)
    for at in range(0,len(training),rows):
        numerator+=np.matmul(posterior[at:at+rows].T,training[at:at+rows])
    mu=numerator/mass[0]
    covariance=np.zeros((32,32),dtype=np.float64)
    for at in range(0,len(training),rows):
        centered=training[at:at+rows]-mu[0]
        centered*=np.sqrt(posterior[at:at+rows,0:1])
        covariance+=np.matmul(centered.T,centered)
    covariance/=mass[0]
    spacing=np.abs(-1.*np.spacing(gm_module.eigvalsh(covariance,eigvals=(31,31))))
    covariance+=spacing*np.eye(32)
    m.mu=mu;m.listSigma=[covariance]
    denominator=mass[0]+mass[1]
    m.prioriProb=np.asarray([[mass[0]/denominator]],dtype=np.float64)
    m.outliersProb=mass[1]/denominator

def _comprint_em_chunks(m, training, rows=8192):
    posterior=np.empty((len(training),2),dtype=np.float64)
    previous=_comprint_expectation_chunks(m,training,posterior,rows)
    flag=1
    for iteration in range(100):
        _comprint_maximization_chunks(m,training,posterior,rows)
        likelihood=_comprint_expectation_chunks(m,training,posterior,rows)
        difference=likelihood-previous
        if (difference>=0) and (difference<1e-5*np.abs(likelihood)):
            flag=0;break
        previous=likelihood
    return likelihood,flag,iteration

def execute_comprint_chunked(operation,a):
    started=time.perf_counter()
    if operation=='retain_training_chunked':
        STATE.clear();training=a['training'];STATE['training']=training
        variance=_comprint_chunk_variance(training)
        variance+=np.abs(-1.*np.spacing(np.max(variance)))
        random=np.random.RandomState(0);mus=[];sigmas=[];priors=[];indices=[]
        for _ in range(10):
            index=random.random_integers(low=0,high=len(training)-1,size=(1,))
            indices.append(int(index[0]));mus.append(training[index,:].copy())
            sigmas.append(np.diag(variance.flatten()));priors.append(np.array([[.99]],dtype=np.float64))
        return {'mu':np.asarray(mus),'Sigma':np.asarray(sigmas),'prior':np.asarray(priors),'initial_indices':np.asarray(indices,dtype=np.int32)},{'seconds':time.perf_counter()-started,'variance_blocks':8192}
    if operation=='fit_retained_chunked':
        results=[];training=STATE['training'];seconds=[]
        for at in range(len(a['indices'])):
            m=model(a['mu'][at],a['Sigma'][at],a['prior'][at]);begin=time.perf_counter()
            score,flag,iterations=_comprint_em_chunks(m,training)
            seconds.append(time.perf_counter()-begin);results.append((m,score,flag,iterations))
        return {'indices':a['indices'],'mu':np.asarray([v[0].mu for v in results]),'Sigma':np.asarray([v[0].listSigma[0] for v in results]),'prior':np.asarray([v[0].prioriProb for v in results]),'outlier':np.asarray([v[0].outliersProb for v in results]),'score':np.asarray([v[1] for v in results]),'iterations':np.asarray([v[3] for v in results],dtype=np.int32)},{'fit_seconds':seconds,'chunk_rows':8192,'global_observations':len(training)}
    raise ValueError('Unknown bounded Comprint EM operation: '+operation)
