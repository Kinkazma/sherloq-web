export default {
  "ela.biomes": {
    "params": {
      "quality": 0,
      "block": 32,
      "threshold": 2,
      "minimum": 3,
      "ghost": true,
      "allGrids": false,
      "background": true
    },
    "exports": [
      "json",
      "npz"
    ]
  },
  "ela.energy": {
    "params": {
      "quality": 0,
      "block": 32,
      "minimum": 3,
      "profile": "standard",
      "histogramLow": 10,
      "histogramHigh": 990,
      "shadow": 50,
      "highlight": 50
    },
    "exports": [
      "json",
      "npz"
    ]
  },
  "metadata.exiftool": {
    "params": {
      "mode": "dump"
    },
    "exports": [
      "json"
    ]
  },
  "metadata.c2pa": {
    "params": {
      "trustAnchors": null
    },
    "exports": [
      "json"
    ]
  },
  "metadata.structure": {
    "params": {},
    "exports": [
      "json"
    ]
  },
  "metadata.location": {
    "params": {},
    "exports": [
      "json"
    ]
  },
  "metadata.thumbnail": {
    "params": {},
    "exports": [
      "json"
    ]
  },
  "file.hex": {
    "params": {
      "offset": 0,
      "length": 256
    },
    "exports": [
      "json"
    ]
  },
  "colors.pca": {
    "params": {
      "component": 0,
      "mode": "distance",
      "invert": false,
      "equalize": false
    },
    "exports": [
      "json"
    ]
  },
  "colors.space": {
    "params": {
      "space": "rgb",
      "channel": 0
    },
    "exports": [
      "json"
    ]
  },
  "noise.separation": {
    "params": {
      "mode": 0,
      "radius": 1,
      "sigma": 3,
      "grayscale": false,
      "denoised": false,
      "levels": 32
    },
    "exports": [
      "json"
    ]
  },
  "detail.gradient": {
    "params": {
      "intensity": 95,
      "mode": 2,
      "invert": false,
      "equalize": false
    },
    "exports": [
      "json"
    ]
  },
  "inspection.adjust": {
    "params": {
      "brightness": 0,
      "saturation": 0,
      "hue": 0,
      "gamma": 10,
      "shadows": 0,
      "highlights": 0,
      "sweep": 127,
      "width": 255,
      "sharpen": 0,
      "threshold": 255,
      "equalize": 0,
      "invert": false
    },
    "exports": [
      "json"
    ]
  },
  "detail.echo": {
    "params": {
      "radius": 2,
      "contrast": 85,
      "grayscale": false
    },
    "exports": [
      "json"
    ]
  },
  "subimages.detect": {
    "params": {},
    "exports": [
      "json"
    ]
  },
  "tampering.copyMove.brisk": {
    "params": {
      "response": 90,
      "matching": 20,
      "distance": 15,
      "minimum": 5,
      "showPoints": false,
      "hideLines": false,
      "maskImageId": null
    },
    "exports": [
      "json"
    ]
  },
  "tampering.copyMove.akaze": {
    "params": {
      "response": 90,
      "matching": 20,
      "distance": 15,
      "minimum": 5,
      "showPoints": false,
      "hideLines": false,
      "maskImageId": null
    },
    "exports": [
      "json"
    ]
  },
  "tampering.copyMove.orb": {
    "params": {
      "response": 90,
      "matching": 20,
      "distance": 15,
      "minimum": 5,
      "showPoints": false,
      "hideLines": false,
      "maskImageId": null
    },
    "exports": [
      "json"
    ]
  },
  "tampering.resampling": {
    "params": {
      "stage": "probability",
      "size": 3,
      "regions": null,
      "fourierRegions": [],
      "fourier": {
        "rect": null,
        "window": "hanning",
        "upsample": true,
        "center": false,
        "highpass": "simple",
        "gamma": 4,
        "rescale": true
      }
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "tampering.resampling.fourier": {
    "params": {
      "rect": null,
      "window": "hanning",
      "upsample": true,
      "center": false,
      "highpass": "simple",
      "gamma": 4,
      "rescale": true
    },
    "exports": [
      "json"
    ]
  },
  "various.median": {
    "params": {
      "modelId": "",
      "variance": 5,
      "threshold": 0.4,
      "showScore": false,
      "speckle": true
    },
    "exports": [
      "json"
    ]
  },
  "noise.noisesniffer": {
    "params": {
      "blockSize": 3,
      "cellSize": 100,
      "samplesPerBin": 20000,
      "lowFrequencyFraction": 0.1,
      "lowNoiseFraction": 0.5,
      "view": "regions"
    },
    "exports": [
      "json",
      "npz"
    ]
  },
  "noise.prnu": {
    "params": {
      "databaseId": null
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "comparison.image": {
    "params": {
      "referenceImageId": null,
      "view": "normal",
      "metrics": false,
      "equalized": false,
      "grayscale": false
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "detail.frequency": {
    "params": {
      "split": 15,
      "smooth": 25,
      "threshold": 0,
      "filter": 0
    },
    "exports": [
      "json"
    ]
  },
  "noise.blocking": {
    "params": {
      "block": 8
    },
    "exports": [
      "json"
    ]
  },
  "detail.wavelets": {
    "params": {
      "wavelet": "db1",
      "threshold": 0,
      "level": 0,
      "mode": "soft"
    },
    "exports": [
      "json"
    ]
  },
  "colors.plots": {
    "params": {
      "scale": null,
      "x": 3,
      "y": 4,
      "z": 5,
      "colored": false,
      "alpha": 1,
      "kind": "2d",
      "layout": "legacy"
    },
    "exports": [
      "json"
    ]
  },
  "file.digest": {
    "params": {
      "imageHashes": true
    },
    "exports": [
      "json"
    ]
  },
  "inspection.magnifier": {
    "params": {
      "mode": "contrast",
      "percent": 20,
      "channel": false,
      "bounds": null
    },
    "exports": [
      "json"
    ]
  },
  "various.illuminant": {
    "params": {
      "block": 128,
      "method": 1,
      "linear": true,
      "exclude": true,
      "mode": 0
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "tampering.contrast": {
    "params": {
      "block": 64,
      "mode": 2
    },
    "exports": [
      "json"
    ]
  },
  "various.stereogram": {
    "params": {
      "mode": 0
    },
    "exports": [
      "json"
    ]
  },
  "jpeg.zero": {
    "params": {
      "missing": true,
      "view": 0
    },
    "exports": [
      "json",
      "npz"
    ]
  },
  "jpeg.ghosts": {
    "params": {
      "low": 50,
      "high": 90,
      "step": 5,
      "x": 0,
      "y": 0,
      "grayscale": true,
      "includeOriginal": false
    },
    "exports": [
      "json"
    ]
  },
  "jpeg.multiple": {
    "params": {},
    "exports": [
      "json"
    ]
  },
  "jpeg.recompression": {
    "params": {},
    "exports": [
      "json",
      "csv"
    ]
  },
  "jpeg.quality": {
    "params": {
      "modelId": null
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "inspection.histogram": {
    "params": {
      "channel": 3,
      "start": 0,
      "end": 255
    },
    "exports": [
      "json",
      "csv"
    ]
  },
  "colors.stats": {
    "params": {
      "mode": "min",
      "inclusive": false
    },
    "exports": [
      "json"
    ]
  },
  "noise.planes": {
    "params": {
      "channel": 0,
      "bit": 0,
      "filter": 0
    },
    "exports": [
      "json"
    ]
  },
  "noise.minmax": {
    "params": {
      "channel": 0,
      "minimum": 1,
      "maximum": 0,
      "filter": 0
    },
    "exports": [
      "json"
    ]
  },
  "pixels.defects": {
    "params": {
      "radius": 1,
      "threshold": 32,
      "spread": 32,
      "kind": 0,
      "mode": 0
    },
    "exports": [
      "json",
      "csv"
    ]
  }
};
