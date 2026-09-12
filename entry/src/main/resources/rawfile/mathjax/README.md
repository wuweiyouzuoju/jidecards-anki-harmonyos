# Bundled MathJax

MathJax 3.2.2, Apache-2.0: https://github.com/mathjax/MathJax/tree/3.2.2

`tex-svg-full.js` is the unmodified upstream component. It embeds SVG font paths,
TeX extensions (including mhchem), the menu and assistive MathML components.
The application enables common Anki TeX packages and mhchem, and disables the
context menu to avoid optional network-loaded accessibility modules. Assistive
MathML remains available. No external fonts or CDN are required for card formulas.
The local `input/mml.js` and entity table preserve the previous renderer's MathML
input support alongside TeX input.

mhchemParser 4.1.1 is included with its original embedded copyright/license notice
(Martin Hensel; Apache-2.0).

`LICENSE` is the complete upstream license. `manifest.json` records the fixed npm
archive integrity and distributed file SHA-256 hashes. Reproduce with
`node tools/vendor-mathjax.mjs`; review changes and rerun rendering tests on upgrades.
`card-math.js` is jidecards application code under AGPL-3.0-or-later.
