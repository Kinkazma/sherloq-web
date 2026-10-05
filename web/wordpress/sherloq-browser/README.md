# SHERLOQ Browser Lab — interface 0.14.0

This directory contains the browser workspace and WordPress entry point.
The source delivery is `6fb6e874ef7a1c36af22f2dc3ca2383085d9e249`.
The [repository overview](../../../README.md) describes the contribution,
example inputs and qualification scope.

Use the SHERLOQ Browser Lab block or `[sherloq_browser language="fr" height="920"]`
in a dedicated WordPress page. The workspace runs analysis in browser workers;
WordPress serves its interface. HTTPS or localhost is required for secure browser
APIs. Theme, language, favorites and settings remain separate from image data.

Restore the locked resources before development tests, following the
[build instructions](../../../docs/BUILD.md). The
[distribution contract](../DISTRIBUTION.md) describes verified resource pieces,
local libraries and transport limits. `../runtime-lock.json` is authoritative for
the exact runtime files and includes older slots still consumed by specific tools.

For recorded checks and their limits, see the
[validation summary](../../../docs/VALIDATION.md). The application adds no
image-upload endpoint or analysis telemetry; this does not describe third-party
WordPress plugins, site logs or resource-host logs.
