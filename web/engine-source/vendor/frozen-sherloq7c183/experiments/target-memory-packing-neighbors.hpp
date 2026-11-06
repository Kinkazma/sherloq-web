#pragma once
#include <cstdint>

namespace sherloq7c {
// Packing reduces neighboring codes with integer min/max and checks the minimum
// scalar margin. Repeated physical contacts are idempotent for those operations.
// Do not use this traversal for weighted sums, gradients, or certificates that
// depend on contact multiplicity: those require Target::row / rowCounts.
template<class Target, class Callback>
bool packingContacts(Target& target, uint32_t root, bool outgoing, Callback cb) {
 if(target.singleton) {
  static constexpr uint32_t directions[8]={5,3,7,1,0,6,2,4};
  for(uint32_t direction:directions) {
   uint32_t other;
   if(!target.neighbor(root,direction,other)||(outgoing&&target.level[other]<=target.level[root]))continue;
   const uint32_t lo=target.level[root]<target.level[other]?root:other,hi=lo==root?other:root;
   cb(lo,hi,target.value(hi)-target.value(lo));
  }
  return true;
 }
 constexpr uint32_t end=0xffffffffU;
 for(uint32_t member=root;member!=end;member=target.nextMember(member)) {
  for(uint32_t direction=0;direction<8;direction++) {
   uint32_t pixel;
   if(!target.neighbor(member,direction,pixel))continue;
   const uint32_t other=target.owner(pixel);
   if(other==root||(outgoing&&target.level[other]<=target.level[root]))continue;
   const uint32_t lo=target.level[root]<target.level[other]?root:other,hi=lo==root?other:root;
   cb(lo,hi,target.value(hi)-target.value(lo));
  }
 }
 return true;
}
}
