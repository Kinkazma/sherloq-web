# Encoded source ownership

A browser File can observe later filesystem changes. `new Blob([file])` and
`File.slice()` do not provide a portable owned snapshot. Loaded source SHA-256
must describe the exact bytes consumed by an analysis or decoder.

Contiguous native loading already owns the encoded Uint8Array used for decoding
and hashing. Header inspection, C2PA and byte windows prefer that private array.
For segmented JPEG/PNG/TIFF loading, SHA-256 is captured before parsing/decoding;
subsequent reads verify the buffers they actually return. PNG/TIFF headers are
read again through this protected accessor. Extended image decoding captures its
identity from the private encoded Uint8Array passed to the native decoder. Its
contiguous record reuses those owned bytes; its segmented record retains only
verification metadata in addition to the existing RGB store.

During a source's existing SHA pass, the pinned hash implementation saves a
116-byte state at each 1 MiB boundary, including the initial and final states.
An encoded block is accepted only when loading its previous state and hashing
that exact block produces the saved next state. Initial/final states and EOF
lengths are checked. Metadata costs `116 * (ceil(encodedBytes / 1 MiB) + 1)`
bytes. It is admitted and retained with its source, and released on disposal.
This adds no second initial hash pass. Reads admit their copied range and a
bounded block/hash workspace. Optional cached blocks are private owned buffers;
returned ranges are defensive copies. A cache hit can return certified A bytes
while a File now contains B; it does not certify that File as immutable.

C2PA retains its native partial FileReaderSync SDK path and per-read 64 MiB
staging limit. The exact buffers passed to the SDK are verified. Partial edge
blocks are checked against the supplied SDK fragment; a private single-block
cache is admitted with the 3 MiB verification workspace. There is no fixed source
size cap. When only an expected SHA is supplied without an owner manifest, a
bounded prefix capture adds one full source hash pass before those verified SDK
reads. SDK scores, trust policy, resources, licenses and signature algorithms are
unchanged. Digest compares its already computed SHA2-256 with the encoded owner
without another pass. ExifTool uses its separate consumed-range transcript guard.

`inspectHeaders` optionally accepts `imageId`. It then reads the loaded encoded
owner, or the encoded parent of a derived RGB region. A foreign Blob argument
cannot replace that owner. Calls without an imageId remain autonomous Blob
inspection. A changed or unreadable bound source refuses `SOURCE_CHANGED` before
publishing evidence. This is a consumed-byte guarantee for the paths above, not a
claim that every browser File or every raw Blob consumer is immutable.

Derived byte exports own their completed output. See
[original byte engines](ORIGINAL-BYTE-ENGINES.md) for the default Blob admission
and the bounded archive/download lifecycle. Pixel parameters, precision, native
geometry and algorithms are not changed by source identity checks.

The HEX client prefers the existing disk sink. Where a browser cannot create
a writable disk sink, it admits the actual output size and bounded stream
workspace before collecting owned Blob chunks in RAM. This explicit export
lease follows artifact cleanup, including transfer to the download manager.
No 32 MiB output cap is introduced by the derived archive path.
