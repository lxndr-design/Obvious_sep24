# Space Grotesk

Source: https://github.com/floriankarsten/space-grotesk/blob/master/fonts/ttf/SpaceGrotesk%5Bwght%5D.ttf
Downloaded September 21, 2026. Licensed under SIL OFL 1.1; see OFL.txt.

The TTF is served locally. `src/fonts/space-grotesk.json` contains the same
outlines converted with Three.js TTFLoader (default Light master). Reproduce:

    node scripts/convert-letter-font.mjs public/fonts/SpaceGrotesk.ttf src/fonts/space-grotesk.json

To add a typeface, convert its licensed TTF and register its FontLoader result
in LETTER_FONTS in src/letters.js. The font key is saved per letter object.
