
#include "vl/sift.h"
#include "vl/mathop.h"
#include <stdlib.h>
static double *frames = 0;
static int count = 0;
static size_t refused = 0;
static void *checked_malloc(size_t bytes) { void *p=malloc(bytes); if(!p && !refused) refused=bytes; return p; }
static void *checked_realloc(void *old,size_t bytes) { void *p=realloc(old,bytes); if(!p && !refused) refused=bytes; return p; }
static void *checked_calloc(size_t n,size_t size) { void *p=calloc(n,size); if(!p && !refused) refused=n*size; return p; }
size_t ssg_vlfeat_allocation_bytes(void) { return refused; }
void ssg_vlfeat_release(void) { free(frames); frames=0; count=0; }
double *ssg_vlfeat_output(void) { return frames; }
int ssg_vlfeat_detect(const float *matlabColumnMajor, int rows, int cols) {
  ssg_vlfeat_release();
  refused=0;
  vl_set_alloc_func(checked_malloc,checked_realloc,checked_calloc,free);
  if (!matlabColumnMajor || rows<1 || cols<1) return -1;
  /* Preserve the official MATLAB wrapper's transposed C image geometry. */
  VlSiftFilt *f = vl_sift_new(rows, cols, -1, 3, 0);
  if (!f) return -2;
  if (!f->temp || !f->octave || !f->dog || !f->grad) { vl_sift_delete(f); return -2; }
  vl_sift_set_peak_thresh(f,0);
  vl_sift_set_edge_thresh(f,50);
  int first=1, capacity=0;
  for (;;) {
    int error = first ? vl_sift_process_first_octave(f,matlabColumnMajor) : vl_sift_process_next_octave(f);
    first=0;
    if (error) break;
    vl_sift_detect(f);
    const VlSiftKeypoint *keys=vl_sift_get_keypoints(f);
    const int n=vl_sift_get_nkeypoints(f);
    for (int i=0;i<n;i++) {
      double angles[4];
      const VlSiftKeypoint *k=keys+i;
      int orientations=vl_sift_calc_keypoint_orientations(f,angles,k);
      for(int q=0;q<orientations;q++) {
        if(count==capacity) {
          capacity=capacity ? capacity*2 : 256;
          double *next=checked_realloc(frames,(size_t)capacity*4*sizeof(double));
          if(!next) { vl_sift_delete(f); ssg_vlfeat_release(); return -3; }
          frames=next;
        }
        frames[4*count]=k->y+1;
        frames[4*count+1]=k->x+1;
        frames[4*count+2]=k->sigma;
        frames[4*count+3]=VL_PI/2-angles[q];
        count++;
      }
    }
  }
  vl_sift_delete(f);
  return count;
}
