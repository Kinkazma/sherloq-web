# Native automatic display selection

`automaticViewSelection(entries, view, {complete})` is shared by
`createAutomaticAnalysisView().visible()` and `exportAutomaticSession`. It runs no
detector, JPEG operation or segmentation. Coordinates and viewport remain intact.

Complete views include `ELA biomes` in `enabledSources`. Disabling that source
suppresses its background and all its entries, including in the ELA tab. Caller
lists passed to `setEnabledSources` must include ELA explicitly when desired.

ELA background modes are 0 image, 1 biomes on ELA, 2 ELA only, 3 low energy and
4 high energy. ELA-only hides every biome; low/high filter ELA's corresponding
family while retaining clone entries. Clone tabs ignore the ELA background mode.
Map and overlay presentations temporarily suppress ELA; returning to biomes
restores it. The ELA tab uses biome presentation; requesting a map there fails.

New controls are `setForgeryscopeBranch(''|'microscopy'|'blots'|'lanes')` and
`setElaFamilies({energy:boolean,legacy:boolean})`. Branch filtering affects only
Forgeryscope. Source checks, hidden items, branch, family controls, ELA mode and
D2PRL minimum are global like the native controls. Presentation, opacity and the
separate biome/corroboration relation preferences are stored per tab. Switching
tabs or changing selection controls clears focus, preventing a focus from another
tab from hiding the new tab's results. Opacity alone preserves focus.

The returned view state adds `complete`, `forgeryscopeBranch`, `elaEnergy` and
`elaLegacy`. Export inherits these controls unless explicitly overridden; source
and family selection are no longer separately reimplemented by export.

`generate-automatic-view-reference.py` extracts and executes the actual native
widget methods via Python AST with lightweight control values, including native
inheritance/super dispatch, then calls native `visible`. No Qt event loop or neural
detector is substituted. Seventeen cases qualify selection parity: five ELA
modes, corroboration suppression, relations, branches, family toggles, disabled
ELA, clone/ELA tabs, hidden/focused entries and source checks. Node checks also
cover global controls, focus reset and per-tab restoration. Existing composition,
partial export and D2PRL ownership/export tests pass after this shared-selector
change. Rendering pixels and full multi-detector inference are separate proofs.
