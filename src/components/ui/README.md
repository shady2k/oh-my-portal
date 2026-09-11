# Field journal UI kit

The brand specification is [design §12](../../../docs/design/portal.md#12-design-system).
Use real components in the catalog and on the site; do not copy their markup to
make a second implementation of a story.

Run `npm run ui`, then open `http://127.0.0.1:4324/_ui/`. The catalog uses the
synthetic examples. Its routes are injected only with `UI_KIT=1`, so normal
production builds contain neither the catalog nor its Markdown twin. A static
catalog can be built with `UI_KIT=1 npm run build:examples`.

| Source | Contract |
| --- | --- |
| `styles/tokens.css` | Palette, local font families, type scale, spacing, frame and reading measure |
| `styles/ui.css` | Reading column, editorial grid, bounded aside, topic row, button and states |
| `layouts/Base.astro` | One 72rem outer frame for header, main and footer on every page |
| `ThemeInit.astro`, `ThemePicker.astro` | Pre-paint choice, system/light/dark segmented radio control, safe persistence and cross-tab sync |
| `PageHeader.astro` | Page title, optional eyebrow, description and navigation slot |
| `TypedHeadline.astro` | Complete accessible heading, reserved height, brief typing and square cursor; static without JS or with reduced motion |
| `EditorialNote.astro` | Quiet note or red-barred authored observation, label and body slot |
| `SiteFooter.astro` | Configured author, build year, about, contact and RSS; no invented license |
| `ImageViewer.astro` | One native dialog in Base, opened by image links; close, Escape, backdrop, focus restoration |
| `PageJump.astro` | ↑ to the site header and ↓ to the neighbours block on an article; each shows only while useful; plain fragment links, instant jump; hidden without JS |
| `../ExperimentSketch.astro` | The drawing, authored annotations and image-viewer triggers; original-image fallback |
| `../ExperimentTrail.astro` | Done/current/next stages with published evidence links |
| `../Tag.astro` | Underlined topic word; optional count and active state |
| `../Listing.astro` | Journal rows, compact or full metadata |
| `../PencilRule.astro`, `../Revision.astro` | Graphite separation and authored before/after comparison |

Titles use no closing full stop; retain meaningful question marks, exclamation
marks and ellipses. Do not modify article prose or machine projections for a
visual convention. The homepage headline strips a single terminal full stop.

Long prose uses `ui-reading` (40rem) inside the shared outer frame. A feature uses
`ui-editorial has-art` and `ui-editorial-aside` (25rem drawing maximum). At 44rem
the feature becomes a single column. Article marginalia have their own reading
layout; a narrow paragraph is intentional, a narrow page shell is not.

Red means an author's mark, an observation or current stage. Structural labels
are quiet. Graphite rules separate groups; they do not frame every component.
Links navigate, buttons act, and both retain visible keyboard focus.

Run `npm run verify`, `npm run build:examples`, then `npm run test:ui -- URL`
against preview. `npm run screenshot -- /tmp/portal-ui URL` captures the main
page types on desktop and mobile. The UI check exercises the dialog with mouse
and keyboard, no-JS fallback, reduced motion, layout stability and common frame.

## Colour themes

`tokens.css` pairs light and dark colours using CSS `light-dark()`. System
preference sets `color-scheme`; explicit `data-theme` overrides it. Without JS,
CSS still follows the system and the unavailable selector stays hidden. A small
head script reads `portal-theme` before painting. Storage failures preserve
in-page switching; selecting the system icon removes the override. Other tabs stay in sync.

Graphite and red annotations keep a light paper surface through local illustration
tokens. Never invert photographs or artwork. Shiki token colours are mapped to
semantic `--syntax-*` variables during the build. Both palettes must keep normal
text and code at 4.5:1 contrast or above; check real computed colours in the browser.
`npm run test:theme -- URL /tmp/theme-shots` checks preferences and writes previews.

The theme control is one native radio group: system (monitor), light (sun), dark
(moon). Arrow keys switch modes, Tab leaves the group, and a red underline marks
the selected segment. Every icon has a text label for assistive technology.
