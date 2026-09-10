# Local typefaces

IBM Plex assets are vendored from Fontsource 5.3.0, with upstream files unchanged:

- [IBM Plex Sans Variable](https://fontsource.org/fonts/ibm-plex-sans/install):
  Latin and Cyrillic weight-axis WOFF2, normal and italic, weights 100–700.
- [IBM Plex Mono](https://fontsource.org/fonts/ibm-plex-mono/install):
  Latin and Cyrillic WOFF2, normal style, weights 400 and 700.

The eight Plex files total **204,688 bytes**. Browsers request only the faces and
Unicode subsets used by the current page. Regular Sans plus regular Mono in both
scripts total **98,288 bytes**; italics and bold Mono load when needed.

Sources: `@fontsource-variable/ibm-plex-sans@5.3.0` and
`@fontsource/ibm-plex-mono@5.3.0` npm archives. Both archives were verified against
the registry's SHA-512 integrity metadata before selecting the WOFF2 files.
Licenses are preserved in `OFL-IBMPlex-sans.txt` and `OFL-IBMPlex-mono.txt`.

`src/styles/fonts.css` keeps upstream Unicode ranges and uses `font-display:
swap`. Astro fingerprints these local assets; readers make no font requests to
a CDN. Tokens retain system fallbacks. Scripts outside these Latin/Cyrillic
subsets use those fallbacks.

Caveat remains the existing handwriting face for illustration annotations;
its license is in `OFL-Caveat.txt`.
