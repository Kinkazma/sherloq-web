export const toolGroups = [
  {
    "en": "General",
    "fr": "Général",
    "items": [
      {
        "en": "Original Image",
        "fr": "Image originale",
        "id": "original"
      },
      {
        "en": "File Digest",
        "fr": "Empreintes du fichier",
        "id": "file.digest"
      },
      {
        "en": "Hex Editor",
        "fr": "Éditeur hexadécimal",
        "id": "file.hex"
      },
      {
        "en": "Similarity Search",
        "fr": "Recherche d’images similaires",
        "id": "file.similarity"
      }
    ]
  },
  {
    "en": "Metadata",
    "fr": "Métadonnées",
    "items": [
      {
        "en": "Header Structure",
        "fr": "Structure du fichier",
        "id": "metadata.structure"
      },
      {
        "en": "EXIF Full Dump",
        "fr": "EXIF — Métadonnées complètes",
        "id": "metadata.exiftool"
      },
      {
        "en": "Thumbnail Analysis",
        "fr": "Analyse de la miniature",
        "id": "metadata.thumbnail"
      },
      {
        "en": "Geolocation data",
        "fr": "Géolocalisation",
        "id": "metadata.location"
      },
      {
        "en": "C2PA Validation",
        "newFeature": "red",
        "fr": "C2PA — Validation de provenance",
        "id": "metadata.c2pa"
      }
    ]
  },
  {
    "en": "Inspection",
    "fr": "Inspection",
    "items": [
      {
        "en": "Enhancing Magnifier",
        "fr": "Loupe améliorée",
        "id": "inspection.magnifier"
      },
      {
        "en": "Channel Histogram",
        "fr": "Histogramme des canaux",
        "id": "inspection.histogram"
      },
      {
        "en": "Global Adjustments",
        "fr": "Réglages globaux",
        "id": "inspection.adjust"
      },
      {
        "en": "Reference Comparison",
        "fr": "Comparaison avec une référence",
        "id": "comparison.image"
      },
      {
        "en": "Complete Automatic Analysis",
        "newFeature": "blue",
        "fr": "Analyse automatique complète",
        "id": "analysis.complete"
      }
    ]
  },
  {
    "en": "Detail",
    "fr": "Détails",
    "items": [
      {
        "en": "Luminance Gradient",
        "fr": "Gradient de luminance",
        "id": "detail.gradient"
      },
      {
        "en": "Echo Edge Filter",
        "fr": "Filtre d’écho des contours",
        "id": "detail.echo"
      },
      {
        "en": "Wavelet Threshold",
        "fr": "Seuillage par ondelettes",
        "id": "detail.wavelets"
      },
      {
        "en": "Frequency Split",
        "fr": "Séparation des fréquences",
        "id": "detail.frequency"
      }
    ]
  },
  {
    "en": "Colors",
    "fr": "Couleurs",
    "items": [
      {
        "en": "RGB/HSV Plots",
        "fr": "RGB/HSV — Nuages de points",
        "id": "colors.plots"
      },
      {
        "en": "Space Conversion",
        "fr": "Conversion d’espace colorimétrique",
        "id": "colors.space"
      },
      {
        "en": "PCA Projection",
        "fr": "PCA — Analyse en composantes principales",
        "id": "colors.pca"
      },
      {
        "en": "Pixel Statistics",
        "fr": "Statistiques des pixels",
        "id": "colors.stats"
      }
    ]
  },
  {
    "en": "Noise",
    "fr": "Bruit",
    "items": [
      {
        "en": "Signal Separation",
        "fr": "Séparation du signal",
        "id": "noise.separation"
      },
      {
        "en": "Min/Max Deviation",
        "fr": "Écarts minimum et maximum",
        "id": "noise.minmax"
      },
      {
        "en": "Bit Plane Values",
        "fr": "Plans de bits",
        "id": "noise.planes"
      },
      {
        "en": "Wavelet Blocking",
        "fr": "Bruit par ondelettes et blocs",
        "id": "noise.blocking"
      },
      {
        "en": "PRNU Identification",
        "fr": "PRNU — Identification du capteur",
        "id": "noise.prnu"
      },
      {
        "en": "Noisesniffer",
        "newFeature": "red",
        "fr": "Noisesniffer",
        "id": "noise.noisesniffer"
      }
    ]
  },
  {
    "en": "JPEG",
    "fr": "JPEG",
    "items": [
      {
        "en": "Quality Estimation",
        "fr": "Estimation de la qualité JPEG",
        "id": "jpeg.quality"
      },
      {
        "en": "Error Level Analysis",
        "fr": "ELA — Analyse du niveau d’erreur",
        "id": "ela.classic"
      },
      {
        "en": "Multiple Compression",
        "newFeature": "red",
        "fr": "Compressions multiples",
        "id": "jpeg.multiple"
      },
      {
        "en": "JPEG Ghost Maps",
        "fr": "JPEG — Cartes fantômes",
        "id": "jpeg.ghosts"
      },
      {
        "en": "ZERO JPEG Grids",
        "newFeature": "red",
        "fr": "ZERO — Grilles JPEG",
        "id": "jpeg.zero"
      }
    ]
  },
  {
    "en": "Tampering",
    "fr": "Retouches",
    "items": [
      {
        "en": "Contrast Enhancement",
        "fr": "Modification du contraste",
        "id": "tampering.contrast"
      },
      {
        "en": "Copy-Move Forgery",
        "fr": "Détection de clones",
        "id": "tampering.copyMove.brisk"
      },
      {
        "en": "Composite Splicing",
        "fr": "Détection de montage",
        "id": "composite"
      },
      {
        "en": "Image Resampling",
        "fr": "Rééchantillonnage de l’image",
        "id": "tampering.resampling"
      },
      {
        "en": "Copy-Move Forgery 2",
        "newFeature": "red",
        "fr": "Détection de clones 2",
        "id": "tampering.copyMove.sparse"
      },
      {
        "en": "Adaptive CFA",
        "newFeature": "red",
        "fr": "CFA — Analyse adaptative de la mosaïque",
        "id": "m2.cfa"
      },
      {
        "en": "Automatic Clone Search",
        "newFeature": "green",
        "fr": "Recherche automatique de clones",
        "id": "analysis.clones"
      }
    ]
  },
  {
    "en": "AI Solutions",
    "fr": "Intelligence artificielle",
    "items": [
      {
        "en": "TruFor",
        "newFeature": "red",
        "fr": "TruFor",
        "id": "m2.trufor"
      },
      {
        "en": "CAT-Net v2",
        "newFeature": "red",
        "fr": "CAT-Net v2",
        "id": "m2.catnet"
      },
      {
        "en": "SAFIRE",
        "newFeature": "red",
        "fr": "SAFIRE",
        "id": "ai.sources.safire"
      },
      {
        "en": "FOCAL",
        "newFeature": "red",
        "fr": "FOCAL",
        "id": "ai.localization.focal"
      },
      {
        "en": "AdaIFL",
        "newFeature": "red",
        "fr": "AdaIFL",
        "id": "ai.localization.adaifl"
      },
      {
        "en": "AI Clone Detection",
        "newFeature": "green",
        "fr": "Détection de clones par IA",
        "id": "ai.clones.d2prl"
      }
    ]
  },
  {
    "en": "Various",
    "fr": "Divers",
    "items": [
      {
        "en": "Median Filtering",
        "fr": "Filtrage médian",
        "id": "various.median"
      },
      {
        "en": "Illuminant Map",
        "newFeature": "red",
        "fr": "Carte de l’illuminant",
        "id": "various.illuminant"
      },
      {
        "en": "Dead/Hot Pixels",
        "newFeature": "red",
        "fr": "Pixels morts ou chauds",
        "id": "pixels.defects"
      },
      {
        "en": "Stereogram Decoder",
        "fr": "Décodage de stéréogramme",
        "id": "various.stereogram"
      }
    ]
  }
];
