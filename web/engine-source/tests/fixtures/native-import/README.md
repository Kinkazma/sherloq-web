Generated 32×24 unsigned 16-bit fixtures, with no personal image content.
RGB channels are `(1171*x+101*y) mod 65536`,
`(389*x+2017*y+7) mod 65536`, and `(201*x+7919*y+3) mod 65536`.
The stored expected RGB16 bytes are little endian.

The PNG cases include plain RGB16, Adam7, a linear gAMA declaration, and an
embedded exact LibRaw linear ProPhoto D65 ICC profile. TIFF cases cover strips,
tiles with orientation6, unassociated alpha0, gray alpha, gray ICC and synthetic
CMYK ICC. The synthetic CMYK profile is the project fixture documented under
`../icc16`; it does not characterize an actual printing condition. Source RGB16
samples must remain exact while display color conversion is allowed separately.
