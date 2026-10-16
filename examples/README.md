# Original inputs, edited inputs and edit references

The spiral, Street Photo and microscopy files reproduce the example material from my macOS repository. The three-cell input was supplied for additional web-engine demonstrations. They are inputs and visual references, not browser-analysis screenshots. No reference image is used as input to a detector.

## Spiral

[Original](spiral/original.png) · [Edited input](spiral/edited.png) · [My edit reference](spiral/edit-reference.png)

All three images are 1254 × 1254. The edit reference is the replacement supplied on 4 October 2026, decoded from WebP and saved without additional loss as PNG.

## Street Photo

[Original JPEG](street/original.jpg) · [Edited PNG](street/edited.png) · [My edit reference](street/edit-reference.jpg)

The edited input preserves the TIFF's decoded 4387 × 3510 colour pixels. Smaller previews are provided for the README only.

[The manifest](manifest.json) identifies source paths, the source Git commit and SHA-256 hashes. Existing native output maps and screenshots are not presented as results from the browser implementation.

## Microscopy input

The [supplied figure](microscopy/input.png) is the same input used for my macOS microscopy demonstrations. Its TIFF was converted to RGB8 PNG at the original 3226 × 936 dimensions, without resizing. [Provenance and hashes](microscopy/provenance.json). It is an example input, not an independently established edit-reference mask.

## Three-cell input

The [supplied PNG](three-cells/input.png) is retained byte for byte at 416 × 320 pixels. It is the analysis input for the added clone-method examples. No original counterpart or pixel-level edit-reference mask accompanies this input. [Provenance and hash](three-cells/provenance.json).

## Moss photo

[Original](moss/original.png) · [Edited input](moss/edited.png) · [My edit reference](moss/reference.png)

The three supplied images are 1642 × 1094. PNG copies preserve RGB pixels without source metadata. The visual reference is not used as a detector input.
