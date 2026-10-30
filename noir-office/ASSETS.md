# Asset provenance

All assets were authored for The Noir Office on 2026-10-29. No downloaded art, generated images, fonts or audio are included.

| File in mods/noir | Source and purpose |
| --- | --- |
| fan.svg | Original four-blade fan glyph, tinted by GPUI; native spin only while working. |
| hat.svg | Original fedora on a stand, used instead of coloured program logos. |
| vacant.svg | Original hanging VAC sign, used for confirmed exit history. |
| folder.svg | Original outline file folder. |
| frost.svg | Original transparent diagonal hatch, flat glass approximation. |
| blinds.svg | Original 1600x900 room and venetian blind light. |
| blinds.png | Direct raster of blinds.svg, 1600x900 RGBA, using existing local sharp 0.32.x/libvips. No image editing or downloaded source. |
| preview.svg | Original design illustration used by the layout picker. |

Raster command from this package directory, using an existing installation of sharp 0.32.6:

```sh
node -e 'require("sharp")("mods/noir/blinds.svg").png().toFile("mods/noir/blinds.png");'
```

No runtime dependency on sharp. The shipped app bundles JetBrains Mono, Geist and Geist Mono; this package uses the first and last without copying font binaries. All original SVGs are included so the art can be inspected and rebuilt.
