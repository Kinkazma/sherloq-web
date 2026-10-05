# Storage estimate is advisory, explicit limits remain enforced

The first Comparison96MP run stopped at the wrapper's own `STORAGE_QUOTA` test,
not an actual browser write rejection. Dedicated-worker sessions captured quota
estimates near10GiB; native Butteraugli's live complete image planes crossed that
value. Chromium documents artificial usage+10GiB reporting for privacy:
https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs

OPFS and IndexedDB now use only the caller's explicit `maximumBytes` for logical
admission. Both quota and usage estimates remain reported diagnostics. Actual
QuotaExceededError and failed/short writes still stop the job; no browser quota,
permission, persistent-storage setting or physical storage limit is bypassed.
No probe allocation or startup benchmark is introduced. Existing1GiB OPFS shards
remain unchanged. This changes the two common storage wrappers consumed from M5;
merge once, retaining subsequent shared fixes.

Browser tests override estimate to quota4096/usage4096, then roundtrip8192bytes
on both real backends. Explicit16384 allowance still rejects a further8193byte
allocation. Injected physical OPFS QuotaExceededError is preserved and releases
reserved bytes. The original failed96MP report is kept as
`comparison-96mp-first-attempt.json`; the resumed run has already allocated over
19GB of real useful Butteraugli scratch. Completion/export qualification is separate.
