# Parallel development

Baseline: source manifest 0.29.0. Fixtures are shared outside Git; hashes remain
in source-manifest.json. Generated build directories and releases are excluded.
Model weights are external assets, not source files. This local repository has
no publishing remote. Use one worktree per engine owner and integrate coherent
commits on integration/browser. Do not run release-manifest generators for every
small patch; update them at coordinated delivery boundaries.
