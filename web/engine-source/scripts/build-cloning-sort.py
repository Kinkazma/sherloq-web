"""Extract the pinned libc++15 non-arithmetic introsort without replacing libc++."""
from pathlib import Path
import hashlib, json, re
root = Path(__file__).resolve().parents[1]
vendor = root/'vendor/llvm-sort15'
pin = json.loads((vendor/'PINNED.json').read_text())
for name, digest in pin['files'].items():
    assert hashlib.sha256((vendor/name).read_bytes()).hexdigest() == digest
source = (vendor/'sort.h').read_text()
# Keep the original comparison, swap, pivot, insertion and partition decisions.
# DMatch is not an arithmetic type, so the branchless arithmetic path is unused.
small = source[source.index('template <class _AlgPolicy, class _Compare, class _ForwardIterator>'):source.index('// The comparator being simple')]
insertion = source[source.index('template <class _AlgPolicy, class _Compare, class _RandomAccessIterator>\nvoid __insertion_sort_3'):source.index('template <class _AlgPolicy, class _Compare, class _BidirectionalIterator>\nvoid __insertion_sort_move')]
intro = source[source.index('template <class _AlgPolicy, class _Compare, class _RandomAccessIterator>\nvoid __introsort'):source.index('template <typename _Number>')]
def internal(name, end=None):
    text = (vendor/name).read_text().split('_LIBCPP_BEGIN_NAMESPACE_STD',1)[1].split('_LIBCPP_END_NAMESPACE_STD',1)[0]
    return text.split(end,1)[0] if end else text
public = 'template <class _RandomAccessIterator, class _Compare>'
heap = internal('sift_down.h')+internal('push_heap.h','template <class _AlgPolicy, class _RandomAccessIterator, class _Compare>')+internal('pop_heap.h',public)+internal('make_heap.h',public)+internal('sort_heap.h',public)
partial = internal('partial_sort.h')
partial = partial[:partial.index('template <class _AlgPolicy, class _Compare, class _RandomAccessIterator, class _Sentinel>',partial.index('__partial_sort_impl'))]
body = heap+partial+small+insertion+intro
body = body.replace('std::__sort', 'cloning_legacy::__sort').replace('std::__insertion_sort', 'cloning_legacy::__insertion_sort').replace('std::__introsort', 'cloning_legacy::__introsort')
body = body.replace('__sort3_maybe_branchless', '__sort3').replace('__sort4_maybe_branchless', '__sort4').replace('__sort5_maybe_branchless', '__sort5_wrap_policy')
body = body.replace('std::__partial_sort<_AlgPolicy, _Compare>(__first, __last, __last, __comp);', '++heapFallbacks; cloning_legacy::__partial_sort_impl<_AlgPolicy>(__first, __last, __last, __comp);')
body = re.sub(r'std::__(sift_down|floyd_sift_down|sift_up|make_heap|sort_heap|pop_heap)',r'cloning_legacy::__\1',body)
body = re.sub(r'_LIBCPP_ASSERT\((.*?), (".*?")\);',r'assert((\1) && \2);',body)
body = body.replace('_VSTD::move', 'std::move')
for macro in ['_LIBCPP_CONSTEXPR_AFTER_CXX11', '_LIBCPP_CONSTEXPR_AFTER_CXX17', '_LIBCPP_HIDE_FROM_ABI', '_LIBCPP_HIDDEN']:
    body = body.replace(macro, '')
header = '''// Generated from the pinned LLVM15 sort.h; see vendor/llvm-sort15/LICENSE.TXT.
#include <algorithm>
#include <iterator>
#include <type_traits>
#include <cassert>
namespace cloning_legacy {
using std::iterator_traits;
using std::is_trivially_copy_constructible;
using std::is_trivially_copy_assignable;
static int heapFallbacks = 0;
template<class Policy> struct _IterOps {
    template<class A, class B> static void iter_swap(A a, B b) { std::iter_swap(a,b); }
    template<class A> static auto __iter_move(A a) -> decltype(std::move(*a)) { return std::move(*a); }
    template<class A, class B> static B next(A, B last) { return last; }
};
template<class Compare> struct __comp_ref_type { using type=typename std::add_lvalue_reference<Compare>::type; };
template<class Policy, class Compare> struct _WrapAlgPolicy { using type=Compare; };
template<class Compare> struct _UnwrapAlgPolicy {
    using _AlgPolicy=int; using _Comp=Compare;
    static Compare __get_comp(Compare c) { return c; }
};
'''
footer = '''
template<class Iterator, class Compare> void sort(Iterator first, Iterator last, Compare compare) {
    auto length=last-first; int depth=0; while(length>1){ ++depth; length>>=1; }
    __introsort<int, Compare>(first,last,compare,2*depth);
}
}
'''
(root/'.build/cloning-legacy-sort.hpp').write_text(header+body+footer)
