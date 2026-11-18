Synthetic CC0 test image: 96 × 257, RGB16 codes `(617*x+233*y)%65536`,
`(991*x+487*y)%65536`, `(313*x+1259*y)%65536`.

Encoded with libavif 1.4.2:

```sh
avifenc -j 1 -s 10 -q 100 -d 10 -y 420 --cicp 1/13/6 seams.png seams-420.avif
```

The height crosses two complete 128-row bands and a final one-row band. The
qualification compares independent full-grid and bounded-band projections,
including transfer of the preview buffer to its receiver.
