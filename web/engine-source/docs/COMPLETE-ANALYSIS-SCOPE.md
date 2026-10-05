# Complete-analysis scope lifecycle

`subimages.detect` supplies the qualified CPU panel detector described in
[AUTO-ZONES.md](AUTO-ZONES.md). The integrated `analysis.complete` API now runs
the real clone/ELA providers; see [AUTOMATIC-RUNTIME.md](AUTOMATIC-RUNTIME.md) for
model loading, group states, shared-budget execution and exports. The controller
described here manages scope and generations; callers supply its detector and
analysis adapters. The combined96MP qualification and assembled WordPress recipe
remain pending; the older controller tests alone do not qualify either path.

A detector adapter can return `(await engine.run({id, imageId,
operation:'subimages.detect'}, {signal,onProgress})).data.regions`. Forward the
request signal/progress and use the same loaded original image. Hard worker
cancellation requires reloading the source before another request.

`createAnalysisScopeController` accepts original `imageId`, `width`, `height`,
a real `detectSubimages` adapter, a real complete-pipeline `analyze` adapter and
an `onEvent` callback. Missing adapters throw `UNSUPPORTED_OPERATION`.

- `start()` defaults to automatic subimage detection.
- `useWholeImage()` clears old regions, exclusions, result and progress, aborts
  the previous signal (including a running detector) and requests a new analysis
  on `[{id:'whole-image',bounds:[0,0,width,height]}]`.
- `useAutomaticRegions()` clears the same state and runs detection anew.
- `replaceExclusions(rectangles)` restarts analysis on current regions with a
  copied exclusion list. A later mode switch always empties that list.
- `cancel()` and `dispose()` invalidate outstanding work. No late result,
  progress or error from an older generation can update controller state.

Every request/event carries an increasing `generation`. Rectangles are integer,
half-open source coordinates; invalid rectangles are rejected, never resized.
The detector returns `[{id,bounds:[x0,y0,x1,y1]}]`. An empty list yields
`no-regions`, and a detector failure yields `detection-failed`. Neither condition
starts analysis or silently selects whole-image mode. UI can offer retry and
**Exécuter sur toute l’image**. **Détecter les sous-images** returns to automatic.

`analyze` receives an independent request snapshot with copied regions/exclusions,
`restartAllBranches:true`, `mode`, `generation`, `signal` and a guarded progress
callback. Its implementation must restart every real branch for that generation
under the shared engine budget. It must forward cancellation to detector/branch
workers; if termination clears image state, reload the same original bytes before
dispatch. Controller generation checks also reject adapters that complete despite
an aborted signal. UI must check generation before rendering events or promises;
superseded promises contain only `{generation,status:'superseded'}`.

`getState()` returns an owned snapshot. Lifecycle states are `ready`, `detecting`,
`analyzing`, `complete`, `no-regions`, `detection-failed`, `analysis-failed`,
`cancelled`, and `disposed`. Events include `reset`, `scope`, `progress`, `complete`
and terminal states. On `reset`, UI must discard stored subimage/exclusion overlays.
No progress from an old generation should repopulate them.

`tests/analysis-scope.test.mjs` covers switching during detection, switching during
analysis, exclusion reset, late progress/results/errors, empty/failed detection,
cancellation/disposal, missing adapters and a synchronous UI-triggered mode switch.
The tests use explicit asynchronous test doubles; they are not proof of actual
complete-analysis availability or WordPress integration.
