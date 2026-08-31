# PlaySpace assets

Assets are grouped by their runtime purpose:

- `audio/` — interface and camera sounds
- `branding/` — PlaySpace and event logos, plus the launcher icon
- `data/` — plain-text labels and name pools
- `examples/fallback/` — built-in Home carousel cards
- `examples/generated/` — flattened posters saved from special sessions
- `fonts/` — runtime typefaces and source glyph SVGs
- `home/` — Home scene decoration and title artwork
- `portraits/` — prepared special-session portraits
- `poster/` — glyph scans, front and back overlays, clean backside backgrounds, and texture artwork used in compositions
- `ui/buttons/` — exported button slices
- `ui/containers/` — exported panel and timer slices
- `ui/icons/` — transparent interaction guides and UI icons

Use lowercase `snake_case` for new asset filenames. Keep externally supplied raw
glyphs in `poster/glyphs/incoming/`. The kiosk renders the complete numbered PNG
set in `poster/glyphs/png/`; `js/text_glyphs.js` explicitly classifies every scan
as Marker, Pastel, Collage, or Airbrush for the four XY-pad corners. The older
partially renamed `poster/glyphs/runtime/` set is retained only as reference.
