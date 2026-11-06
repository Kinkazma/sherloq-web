"""Small research API, without image decoding or display conversion.

render_rgb returns native samples at revelation=0, and normalized float64 at
positive revelation. The original source is never modified. Both controls are
continuous; the inline demonstration merely caches three microcontrast points.
"""
import numpy as np
from sherloq import prepare,solve

VARIANTS=('v1-gray','v2-rgb','v3-linked','v7b-linked','v7b-gray')

def target_scalar(source,micro=0.0,profile='v7b',**solver_options):
    if profile not in ('v1','v7b'):raise ValueError('Unknown research profile.')
    p=prepare(source)
    if profile=='v1' or not p.difference.size:
        y,info=solve(p,micro,**solver_options)
    else:
        order=np.argsort(p.difference,kind='stable');mass=np.cumsum(p.multiplicity[order])
        scale=float(p.difference[order[np.searchsorted(mass,.01*mass[-1])]])
        gain=max(4*16**micro,(.5+7.5*micro)/(255*scale))
        wanted=gain*p.difference/(1+(gain-1)*p.difference)
        y,info=solve(p,micro,alpha_bounds=(.5,.5),headroom=.1,contrast_target=wanted,fidelity=20,
                     fidelity_weights=1/(1+(p.difference/(8*scale))**4),**solver_options)
        info.update(weak_scale=scale,global_gain=gain)
    info.update(profile=profile,preparation_seconds=p.preparation_seconds)
    if not info['converged']:raise RuntimeError(f'Unconverged target, RMS bound {info["rms_error_bound"]}')
    return y,info

def render_rgb(source,revelation=1.0,micro=0.0,variant='v7b-linked',**solver_options):
    source=np.asarray(source)
    if source.ndim!=3 or source.shape[2]!=3 or not source.size:raise ValueError('An RGB image is required.')
    if variant not in VARIANTS or not 0<=revelation<=1 or not 0<=micro<=1:raise ValueError('Invalid variant or controls.')
    if source.dtype==np.uint8:scale=255
    elif source.dtype==np.uint16:scale=65535
    elif np.issubdtype(source.dtype,np.floating):scale=1
    else:raise ValueError('Use uint8, uint16, or normalized floating RGB.')
    if not np.isfinite(source).all() or source.min()<0 or source.max()>scale:raise ValueError('Invalid sample range.')
    if revelation==0:return source.copy(),{'identity':True,'native_samples':True,'variant':variant}
    x=source.astype(np.float64)/scale
    if np.all(x==x[0,0]):return x.copy(),{'identity':True,'native_samples':False,'variant':variant,'constant':True}
    profile='v7b' if variant.startswith('v7b') else 'v1'
    infos=[]
    if variant=='v2-rgb':
        channels=[]
        for c in range(3):
            y,info=target_scalar(x[:,:,c],micro,profile,**solver_options);channels.append(y);infos.append(info)
        target=np.stack(channels,axis=-1)
    else:
        v=x.max(axis=2);y,info=target_scalar(v,micro,profile,**solver_options);infos.append(info)
        if variant.endswith('gray'):target=np.repeat(y[:,:,None],3,axis=2)
        else:target=np.divide(x*y[:,:,None],v[:,:,None],out=np.zeros_like(x),where=v[:,:,None]>0)
    return (1-revelation)*x+revelation*target,{'variant':variant,'revelation':revelation,'micro':micro,
                                           'native_samples':False,'working_space':'native encoded RGB','solves':infos}
