#pragma once
#include <thread>
#include <mutex>
#include <exception>
#include <algorithm>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
static int full_team=1;
template<class F>void full_parallel(int n,F job){
#ifdef __EMSCRIPTEN_PTHREADS__
 int team=std::min(n,full_team);std::vector<std::thread> workers;std::exception_ptr failure;std::mutex mutex;
 auto work=[&](int t){try{for(int i=t;i<n;i+=team)job(i);}catch(...){std::lock_guard<std::mutex>lock(mutex);if(!failure)failure=std::current_exception();}};
 try{for(int t=1;t<team;t++)workers.emplace_back([&,t](){work(t);});work(0);}catch(...){failure=std::current_exception();}for(auto&w:workers)w.join();if(failure)std::rethrow_exception(failure);
#else
 for(int i=0;i<n;i++)job(i);
#endif
}
extern "C" void ssg_full_set_team(int n){full_team=std::max(1,n);}
extern "C" void ssg_full_shutdown(){
#ifdef __EMSCRIPTEN_PTHREADS__
 EM_ASM({PThread.terminateAllThreads();});
#endif
}
