# SHERLOQ — original Python implementation

[← Equalization comparison](../README.md)

The original numerical modules are preserved together:

- [sherloq7c.py](sherloq7c.py): independent revelation and microcontrast controls, constrained projection and RGB reconstruction.
- [variant_api.py](variant_api.py): the retained target profile called by the SHERLOQ implementation.
- [sherloq.py](sherloq.py): connected-component graph, contrast objective and numerical solver.

Dependencies are listed in [requirements.txt](requirements.txt). The numerical API accepts RGB uint8, RGB uint16 or normalized floating-point samples; the input is preserved.

```python
from sherloq7c import render_rgb

output, information = render_rgb(image, revelation=1.0, micro=1.0)
```

The controls use values from 0 to 1 in this Python API. In the application they are shown as percentages.

[Current engine implementation](https://github.com/Kinkazma/sherloq-web/tree/main/web/engine-source/vendor/frozen-sherloq7c183) · [Engine entry point](https://github.com/Kinkazma/sherloq-web/blob/main/web/engine-source/src/sherloq7c.js) · [GPLv3](LICENSE).
