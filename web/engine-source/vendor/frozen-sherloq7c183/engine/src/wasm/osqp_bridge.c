/* Private research bridge to unmodified OSQP 1.0.0, Apache-2.0.
 * Every call has bounded iterations so a worker can cooperate between chunks.
 */
#include <stdint.h>
#include <errno.h>
#include <stdlib.h>
#include "osqp.h"

static int last_error = 0;

/* Linker wrappers latch the exact allocator failure before downstream code
 * can overwrite errno or translate it into another setup status. */
static volatile int allocation_failed = 0;
void *__real_malloc(size_t size);
void *__real_calloc(size_t count,size_t size);
void *__real_realloc(void *pointer,size_t size);
void *__wrap_malloc(size_t size){void *p=__real_malloc(size);if(!p&&size)allocation_failed=1;return p;}
void *__wrap_calloc(size_t count,size_t size){void *p=__real_calloc(count,size);if(!p&&count&&size)allocation_failed=1;return p;}
void *__wrap_realloc(void *pointer,size_t size){void *p=__real_realloc(pointer,size);if(!p&&size)allocation_failed=1;return p;}
void *sh_osqp_malloc(size_t size){return malloc(size);}
int sh_osqp_last_error(void) { return last_error; }
int sh_osqp_allocator_oom(void) { return allocation_failed || errno == ENOMEM; }
int sh_osqp_memory_error_code(void) { return OSQP_MEM_ALLOC_ERROR; }

uintptr_t sh_osqp_create(int n, int m, int annz,
    const double *pdiag, const int *ap, const int *ai, const double *ax,
    const double *q, const double *lower, const double *upper,
    double eps, int max_iter, int polishing) {
  /* Reset evidence per setup; no previous allocation failure is inherited. */
  allocation_failed = 0; errno = 0; last_error = 0;
  OSQPSolver *solver = NULL;
  OSQPSettings settings;
  OSQPCscMatrix P, A;
  int *pp = malloc((n+1)*sizeof(int));
  int *pi = malloc(n*sizeof(int));
  if (!pp || !pi) { free(pp); free(pi); last_error = -100; return 0; }
  for (int i=0; i<n; ++i) { pp[i]=i; pi[i]=i; }
  pp[n]=n;
  P.m=n; P.n=n; P.p=pp; P.i=pi; P.x=(double*)pdiag; P.nzmax=n; P.nz=-1; P.owned=0;
  A.m=m; A.n=n; A.p=(int*)ap; A.i=(int*)ai; A.x=(double*)ax; A.nzmax=annz; A.nz=-1; A.owned=0;
  osqp_set_default_settings(&settings);
  settings.verbose=0;
  settings.eps_abs=eps; settings.eps_rel=eps;
  settings.max_iter=max_iter;
  settings.polishing=polishing;
  settings.scaled_termination=0;
  /* Deterministic scheduling, independent of platform wall clock. */
  settings.adaptive_rho_interval=50;
  last_error=osqp_setup(&solver,&P,q,&A,lower,upper,m,n,&settings);
  free(pp); free(pi);
  /* On allocation failure some OSQP setup substructures are only partially
   * initialized. The JS owner discards this isolated bounded WASM instance;
   * calling the normal cleanup path on that partial workspace is unsafe. */
  if (last_error) return 0;
  return (uintptr_t)solver;
}

int sh_osqp_update_q(uintptr_t handle, const double *q) {
  return osqp_update_data_vec((OSQPSolver*)handle,q,NULL,NULL);
}

int sh_osqp_warm_start(uintptr_t handle, const double *x, const double *y) {
  return osqp_warm_start((OSQPSolver*)handle,x,y);
}

int sh_osqp_solve(uintptr_t handle, int max_iter) {
  /* Each call owns its allocation evidence; never inherit an older chunk. */
  allocation_failed = 0; errno = 0;
  OSQPSolver *solver=(OSQPSolver*)handle;
  OSQPSettings settings=*solver->settings;
  settings.max_iter=max_iter;
  int result=osqp_update_settings(solver,&settings);
  if(result) return -result;
  result=osqp_solve(solver);
  return result ? -result : solver->info->status_val;
}

uintptr_t sh_osqp_x(uintptr_t handle) { return (uintptr_t)((OSQPSolver*)handle)->solution->x; }
uintptr_t sh_osqp_y(uintptr_t handle) { return (uintptr_t)((OSQPSolver*)handle)->solution->y; }
int sh_osqp_iterations(uintptr_t handle) { return ((OSQPSolver*)handle)->info->iter; }
double sh_osqp_primal_residual(uintptr_t handle) { return ((OSQPSolver*)handle)->info->prim_res; }
double sh_osqp_dual_residual(uintptr_t handle) { return ((OSQPSolver*)handle)->info->dual_res; }
void sh_osqp_destroy(uintptr_t handle) { if(handle) osqp_cleanup((OSQPSolver*)handle); }
