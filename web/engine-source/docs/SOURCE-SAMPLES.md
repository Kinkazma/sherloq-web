# Original-owned source samples

The existing Core and worker client expose three methods:

| Method | Purpose |
| --- | --- |
| `prepareSourceSamples(request, {signal}?)` | Acquire a source lease for one Original and sample domain. |
| `readSourceSamples({...source, rect}, {signal}?)` | Acquire a typed window and its window lease. |
| `retireSourceSamples(receipt)` | Acknowledge a window, or retire a source lease after its windows are acknowledged. |

They share the normal Core, resource budget, storage and worker transport.
Preparation is lazy. Ordinary image imports and existing analysis requests do
not prepare a sensor bank. The bank uses admitted RAM and the common temporary
storage mechanism; dimensions do not select a separate numerical engine.

## Domains and precision

`domain:'decoded'` borrows the Original's selected RGB8 or RGB16 surface. It
does not decode another frame or duplicate the complete image. Its descriptor
declares the actual sample type, channel order, role and provenance. RGB16 may
be a developed RAW view or a color-converted working view: it is not thereby
the original CMYK channels, alpha, physical sensor grid or floating-point data.
The encoded Original remains distinct and unchanged.

`domain:'sensor'` is available for admitted RAW Originals. It unpacks physical
sensor samples into the same typed-bank interface, as `uint16` or `float32`
with the decoder's actual channels and grid. It does not run RAW development,
apply a display transform or normalize the samples. Sensor coordinates retain
orientation 1; orientation and crop information remain metadata. Coded depth
and container width are separate: a 16-bit container does not imply 16 bits of
source information, and unknown source depth remains unknown.

Neither domain changes an analysis tool's input contract. Existing native16
tools still use their declared working surface. Specialized models retain
their required RGB8 input; the author-approved large-dimension extension of
D2PRL is unchanged. Publishing a sensor bank does not make an unported tool
consume sensor samples.

## Identity and coordinates

The request binds to a canonical loaded Original through
`bindingOriginal = {imageId, sourceSurfaceId, sourceRevision, sourceSha256,
kind:'encoded'}`. `sourceSurfaceId` and revision identify the Original's loaded
surface; the returned `sourceId` and revision identify the sample bank. The
content SHA must already be established before scientific publication.

Only absent or explicit `frame:0` is qualified. A requested nonzero or malformed
frame is rejected before preparation rather than silently returning frame 0.
This does not prevent normal first-view import of a multiframe file.

Use the returned descriptor's dimensions and each window's origin. A sensor
grid can differ from the developed RGB grid. Acquisitions, exclusions, display
coordinates, orientation and ROI-derived images are not implicitly transposed
onto the sensor. These methods require a canonical Original; a physical-to-RGB
mapping must be established separately before a consumer uses such regions.

## Leases, ACKs and retry

A source receipt contains `sourceLeaseId`, `sourceId`, revision, domain, frame
and Original binding. A read additionally returns `windowLeaseId`, typed
`samples`, dimensions and origin. Receipts must be kept intact. Worker messages
carry identifiers and typed arrays, never a cloned `release()` function.

The parent retains window and transport funding until the matching window ACK.
Requesting source retirement marks that lease **retiring immediately**. If a
window is still held, retirement refuses and keeps its owners funded; further
reads on that retiring lease are not allowed. Acknowledge its existing windows,
then retry source retirement. Another live source lease remains independent.
An exact acknowledged receipt may be retried idempotently; altered or unrelated
bindings are not accepted as ACKs.

Storage, native-close or termination NACKs preserve a retryable owner and its
credits. A completed bank survives a refused codec retirement, so retry can
finish that boundary without another decode. Unload and disposal drain the
same owners; window ACK controls remain usable while normal work is occupied
or stopping. A cancellation is not evidence that transferred data was retired.

Full calibration is separately funded before metadata parsing and retained
privately until the source and its windows can close. The public descriptor
contains a small calibration schema/hash reference and declared provenance,
not the calibration payload or a diagnostic reader. A source-bank close NACK
does not prematurely discard that calibration.

Codec credit follows both its native-close boundary and the captured transport
certificate. `browser-terminate-requested` records the browser termination
request, not physical worker exit or garbage collection. `captured-worker-exit`
is used only when the transport supplies and awaits a real exit promise, as in
the Node qualification. Native-close acknowledgement remains a separate fact.

## Minimal decoded read

Here `loaded` is the existing `loadBlob` result and `engine` is the same Core or
worker client used to load it. Consume the window before acknowledging it. If
an ACK rejects, retain the receipts and retry that retirement boundary.

```js
const source = await engine.prepareSourceSamples({
  imageId: loaded.id, domain: 'decoded', frame: 0,
  bindingOriginal: {
    imageId: loaded.id,
    sourceSurfaceId: loaded.surface.id,
    sourceRevision: loaded.surface.revision,
    sourceSha256: loaded.sha256,
    kind: 'encoded'
  }
});
let window;
try {
  window = await engine.readSourceSamples({...source, rect: {
    x: 0, y: 0,
    width: Math.min(16, source.descriptor.width),
    height: Math.min(16, source.descriptor.height)
  }});
  await consume(window.samples, source.descriptor);
} finally {
  if (window) await engine.retireSourceSamples(window);
  await engine.retireSourceSamples(source);
}
```

## Qualified scope

The physical UInt16/CFA path has been checked on a 10,000 × 10,000 source in
Node and Chromium: all 100 million words, two leases, bounded windows, decoded
view preservation and complete owned-resource retirement. Small real RAW
fixtures also cover Float32, including fractions, negative values, values above
one and signed zero, plus temporary storage and refusal/retry paths.

This does not establish a 100 MP Float32 result, Firefox/WebKit sensor
qualification, additional frames, arbitrary RAW-format coverage, sensor ROI
mapping or compatibility with every analysis tool. Resource-accounting totals
are distinct from process RSS; browser termination certificates do not claim
physical memory reclamation.
