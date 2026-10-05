// Same arithmetic, compact candidate/result buffers for single-thread workers.
static int tile_begin=0,tile_count=0;
#define D2PRL_OFFSET_AT(k,n,i) ((k)*tile_count+(i)-tile_begin)
#define D2PRL_RESULT_AT(i) ((i)-tile_begin)
#define d2prl_evaluate_range d2prl_evaluate_tile_impl
#include "evaluator.cpp"
#undef d2prl_evaluate_range
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_evaluate_tile(const H* features,const float* ox,const float* oy,int side,int channels,int candidates,int begin,int end,float* result_x,float* result_y,int reference_threads){
 tile_begin=begin;tile_count=end-begin;
 return d2prl_evaluate_tile_impl(features,ox,oy,side,channels,candidates,begin,end,result_x,result_y,nullptr,reference_threads);
}
