# Artwork sources

Original artwork drawn for Verida in the approved palette, so no third-party licence applies. These SVG files are the editable originals. The app uses the exports and never bundles this folder.

| Folder | Exported to | Export |
| --- | --- | --- |
| `illustrations` | `assets/illustrations/*.webp` | 480 × 480, transparent |
| `scenes` | `assets/scenes/*.webp` | 1× the SVG's size, opaque |
| `icons` | `assets/*.png` | 1024 × 1024. `icon` and `android-icon-background` are opaque, the other layers transparent, and `favicon` is 48 × 48 |

To change a picture, edit its SVG, open it in a browser to export it at the size above, and keep the file name. A new illustration or scene also needs adding to the lists in `src/design-system/components/art.tsx`.
