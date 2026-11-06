#pragma once
#include <cstdint>

namespace sherloq7c {
enum class LocalRootContacts { notApplicable, complete, stopped };

// Called for a singleton root. Only physical neighbors that are themselves
// roots qualify: their owner is their distinct pixel index. The direction order
// below is therefore exactly the historical ascending owner-index order.
// Validate every neighbor before invoking callbacks, so fallback has no effects
// from a partially emitted row. This preserves floating-point addition order.
template<class Target, class Callback>
LocalRootContacts localRootContacts(Target& target,uint32_t root,bool outgoing,Callback cb) {
 static constexpr uint32_t directions[8]={5,3,7,1,0,6,2,4};
 uint32_t neighbors[8],diagonalMask=0,count=0;
 for(uint32_t direction:directions) {
  uint32_t other;
  if(!target.neighbor(root,direction,other))continue;
  if(!target.isRoot(other))return LocalRootContacts::notApplicable;
  neighbors[count]=other;
  if(direction>=4)diagonalMask|=1U<<count;
  count++;
 }
 for(uint32_t i=0;i<count;i++) {
  const uint32_t other=neighbors[i];
  if(outgoing&&target.level[other]<=target.level[root])continue;
  if(!cb(other,((diagonalMask>>i)&1U)!=0))return LocalRootContacts::stopped;
 }
 return LocalRootContacts::complete;
}
}
