"""Sherloq 7C: full-range zero and independent microcontrast control.

The 7B optimizer is frozen. This module changes its presentation path only.
Float64 calculations precede RGB display conversion and output quantization.
OSQP is a generic quadratic solver, not an image enhancement method.
"""
from pathlib import Path
from time import perf_counter
import sys
import numpy as np
from scipy import sparse
from sherloq import prepare
from variant_api import target_scalar


def stretch(source):
    """Exact observed scalar endpoints; no percentiles or discarded samples."""
    x = np.asarray(source, dtype=np.float64)
    if x.ndim != 2 or not x.size or not np.isfinite(x).all() or x.min() < 0 or x.max() > 1:
        raise ValueError('A nonempty finite normalized scalar plane is required.')
    lo, hi = float(x.min()), float(x.max())
    return x.copy() if hi == lo else (x-lo)/(hi-lo)


def micro_base(source, target_zero, target_micro, rho=.1, eps=1e-9):
    """Project N(x) + T_b(x) - T_0(x) onto the anchored contrast domain.

    Minimize the squared pixel distance, with 0 <= z <= 1, original minimum
    components at 0, maximum components at 1, and Bz >= rho * Bx. Equality
    components are shared variables. The objective is strictly convex.
    Returns a feasible numerical result and a primal/dual RMS certificate.
    """
    if not 0 < rho < 1 or not 0 < eps < 1:
        raise ValueError('Invalid numerical controls.')
    p = prepare(source)
    start = perf_counter()
    n = stretch(p.source)
    t0, tb = np.asarray(target_zero), np.asarray(target_micro)
    for t in (t0, tb):
        if t.shape != p.shape or not np.isfinite(t).all():
            raise ValueError('Targets must be finite scalar images of the source shape.')
    if not p.difference.size or np.array_equal(t0, tb):
        return n, {'seconds': perf_counter()-start, 'projection': False, 'rms_error_bound': 0.0}

    # This task keeps its optional numerical dependency in its private directory.
    try:
        import osqp
    except ImportError:
        sys.path.insert(0, str(Path(__file__).with_name('deps')))
        import osqp

    _, first = np.unique(p.labels, return_index=True)
    baseline = n.ravel()[first]
    trial = (n+tb-t0).ravel()[first]
    for t in (t0, tb):
        if not np.array_equal(t.ravel(), t.ravel()[first][p.labels]):
            raise ValueError('Targets must preserve the source equality components.')
    anchors = (p.levels == p.levels.min()) | (p.levels == p.levels.max())
    free = ~anchors
    if not free.any():
        return n, {'seconds': perf_counter()-start, 'projection': False,
                   'rms_error_bound': 0.0, 'only_endpoint_components': True}
    B = p.incidence[:, free].tocsc()
    offset = p.incidence[:, anchors] @ baseline[anchors]
    floor = rho*p.difference
    lower_edge = floor-offset
    counts = p.area[free]*p.source.size
    P = sparse.diags(counts, format='csc')
    q = -counts*trial[free]
    A = sparse.vstack((B, sparse.eye(free.sum(), format='csc')), format='csc')
    lower = np.r_[lower_edge, np.zeros(free.sum())]
    upper = np.r_[np.full(floor.size, np.inf), np.ones(free.sum())]
    optimizer = osqp.OSQP()
    optimizer.setup(P=P, q=q, A=A, l=lower, u=upper, verbose=False,
                    eps_abs=eps, eps_rel=eps, max_iter=100000,
                    polishing=True, scaled_termination=False)
    optimizer.warm_start(x=baseline[free])
    solution = optimizer.solve(raise_error=False)
    if solution.info.status_val != 1:
        raise RuntimeError('Unconverged microcontrast projection: '+solution.info.status)

    # Repair only solver roundoff, then certify the repaired point. Clipping is
    # not the image transform: it precedes a graph-wide feasibility restoration.
    z = baseline.copy()
    z[free] = np.clip(solution.x, 0, 1)
    slack = p.incidence@z-floor
    base_slack = p.incidence@baseline-floor
    bad = slack < 0
    repair = 0.0
    if bad.any():
        repair = min(1.0, float(np.max(-slack[bad]/(base_slack[bad]-slack[bad])))*1.0001+1e-12)
        z = (1-repair)*z+repair*baseline
    margin = float(np.min(p.incidence@z-floor))
    if margin < -2e-15 or z.min() < 0 or z.max() > 1:
        raise RuntimeError('Projection did not pass its feasibility check.')

    # Any dual vector with nonpositive multipliers on one-sided lower bounds
    # is dual feasible. Clamping them makes the bound independent of solver
    # stopping criteria. Bounds [0,1] use the support function max(lambda,0).
    dual = solution.y.copy()
    dual[:floor.size] = np.minimum(dual[:floor.size], 0)
    station = q+A.T@dual
    constant = .5*np.sum(counts*trial[free]**2)
    support = dual[:floor.size]@lower_edge + np.maximum(dual[floor.size:], 0).sum()
    dual_value = constant-.5*np.sum(station**2/counts)-support
    primal = .5*np.sum(counts*(z[free]-trial[free])**2)
    gap = max(0.0, float(primal-dual_value))
    # Add a floating-point arithmetic allowance to the analytic duality bound.
    allowance = 64*np.finfo(float).eps*(1+abs(primal)+abs(dual_value)+constant)
    info = {'seconds': perf_counter()-start, 'projection': True,
            'iterations': int(solution.info.iter), 'solver': 'OSQP '+osqp.__version__,
            'primal': float(primal), 'dual': float(dual_value), 'duality_gap': gap,
            'rms_error_bound': float(np.sqrt(2*(gap+allowance)/p.source.size)),
            'feasibility_repair_fraction': repair, 'minimum_constraint_margin': margin,
            'micro_rms_from_stretch': float(np.sqrt(np.sum(p.area*(z-baseline)**2)))}
    return z[p.labels].reshape(p.shape), info


def render_scalar(source, revelation=1.0, micro=0.0, **solver_options):
    if not 0 <= revelation <= 1 or not 0 <= micro <= 1:
        raise ValueError('Controls must be between 0 and 1.')
    n = stretch(source)
    if revelation == 0 and micro == 0:
        return n, {'version': '7C', 'stretch_only': True, 'solves': []}
    tb, bi = target_scalar(source, micro, 'v7b', **solver_options)
    if revelation == 1:
        return tb, {'version': '7C', 'full_revelation_7b': True, 'solves': [bi]}
    if micro == 0:
        base, pi, solves = n, {'projection': False, 'rms_error_bound': 0.0}, [bi]
    else:
        t0, zi = target_scalar(source, 0, 'v7b', **solver_options)
        base, pi = micro_base(source, t0, tb)
        solves = [zi, bi]
    return (1-revelation)*base+revelation*tb, {
        'version': '7C', 'revelation': revelation, 'micro': micro,
        'projection': pi, 'solves': solves}


def render_rgb(source, revelation=1.0, micro=0.0, **solver_options):
    """Always return normalized float64 RGB; source is never modified.

    Native encoded RGB proportions are preserved wherever output V > 0.
    True black stays black. A nonzero darkest pixel mapped to black loses its
    visible chromaticity; recovering it requires retaining the original data.
    """
    source = np.asarray(source)
    if source.ndim != 3 or source.shape[2] != 3 or not source.size:
        raise ValueError('A nonempty RGB image is required.')
    if source.dtype == np.uint8:
        scale = 255
    elif source.dtype == np.uint16:
        scale = 65535
    elif np.issubdtype(source.dtype, np.floating):
        scale = 1
    else:
        raise ValueError('Use uint8, uint16, or normalized floating RGB.')
    if not np.isfinite(source).all() or source.min() < 0 or source.max() > scale:
        raise ValueError('Invalid sample range.')
    x = source.astype(np.float64)/scale
    v = x.max(axis=2)
    y, info = render_scalar(v, revelation, micro, **solver_options)
    if np.all(x == x[0,0]) or (revelation == 0 and micro == 0 and np.array_equal(y,v)):
        result = x.copy()
    else:
        result = np.divide(x*y[:,:,None], v[:,:,None], out=np.zeros_like(x), where=v[:,:,None] > 0)
    info.update(native_samples=False, working_space='native encoded RGB',
                source_min_V=float(v.min()), source_max_V=float(v.max()))
    return result, info
