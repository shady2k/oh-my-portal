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
| `PageHeader.astro` | Page title, optional eyebrow, description and navigation slot |
| `TypedHeadline.astro` | Complete accessible heading, reserved height, brief typing and square cursor; static without JS or with reduced motion |
| `EditorialNote.astro` | Quiet question or red authored observation, label and body slot |
| `SiteFooter.astro` | Configured author, build year, about, contact and RSS; no invented license |
| `ImageViewer.astro` | One native dialog in Base, opened by image links; close, Escape, backdrop, focus restoration |
| `../ExperimentSketch.astro` | The drawing, authored annotations and image-viewer triggers; original-image fallback |
| `../ExperimentTrail.astro` | Done/current/next stages with published evidence links |
| `../Tag.astro` | Outlined topic; optional count and active state |
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
