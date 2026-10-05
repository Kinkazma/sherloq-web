# Native decoded BGR byte access and hash

`automaticBgrBytes(image)` creates a borrowed byte-store view over qualified
RGB8 pixels or an original RGB surface. It returns width, height, byteLength and
`readInto(target,byteOffset,{signal})`. Byte windows may begin/end inside a pixel;
output is exact native row-major BGR. Source pixels are never altered, and a
contiguous output aliasing the source buffer is rejected. Surface windows are
owned only for the duration of each read and released on success, cancellation
or failure. The caller must keep the immutable source alive while reading.

`automaticDecodedBgrSha256(image,{budget,signal,onProgress})` hashes those bytes
incrementally in at most 32 source rows per chunk. The shared-budget admission
covers its chunk and 512 KiB hash workspace; surface reads admit their own
windows. The result gives sha256, dimensions, colorOrder and maximumChunkBytes.
This is a scientific source identity, not a performance calibration.

The automatic ELA provider uses this view for its cached native preview and
hash. NumPy's hash of the decoded native BGR image and the native preview array
match the real browser outputs. A focused Node test exercises partial-pixel byte
offsets across row/band boundaries, contiguous and surface paths, caller target
views with nonzero byteOffset, source immutability, alias rejection, and
cancellation with final shared budget zero.
