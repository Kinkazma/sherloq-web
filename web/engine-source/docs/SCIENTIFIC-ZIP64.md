# Shared scientific ZIP32 / ZIP64 layout

`scientific-zip.js` is the single layout/header implementation consumed by the
M1/M5 stored scientific exporter, M2's paged borrowed-array exporter and M4's
Noisesniffer paged exporter. Metadata/NPY array contracts and lifetimes stay with
their existing providers. Do not develop another ZIP64 container per engine.

Small archives keep the existing ZIP32 bytes. An entry size or offset >=0xffffffff,
a central directory crossing that range, or >=65535 entries uses the required
ZIP64 extras and end records. Offsets are validated safe integers and encoded
as uint64. Caller maxBytes and actual RAM/storage quotas remain authoritative.
ZIP64 does not imply enough storage or that every upstream detector is paged.

Scientific assembly retains M1's cooperative scheduling improvement and chunked
hashing. `zip64:true` is a developer qualification option for exercising standard
reader compatibility with a small archive. Python zipfile/NumPy independently
verify CRC, Unicode names/metadata, float64 bits and shape. A sparse test archive
verifies a genuine entry offset above 4 GiB with Python's independent reader;
it does not claim to have computed a >4 GiB detector result. M2/Noisesniffer
small-export parity and M5 energy exact bytes remain covered by targeted tests.

The next >=94 MP qualification must exercise actual scientific arrays and a
complete export, measuring computation, storage, hashing and page delivery.
