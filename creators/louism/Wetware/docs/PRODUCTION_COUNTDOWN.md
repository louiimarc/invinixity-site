# Production countdown — 27 August 2026

Official performance: **Thursday, 27 August 2026 · 19:00 WIB · Gedung Teater Bulungan, Jakarta Selatan**.

These are recommended latest-safe technical targets, not claims about venue bookings or crew calls. If an earlier rehearsal is available, move each gate earlier.

| Date | Gate | Evidence required |
|---|---|---|
| Mon 17 Aug | Owner check-in and rights status | Every missing asset has a named deliverer, expected filename, audio decision and rights/permission status |
| Wed 19 Aug | First complete media ingest | Media Preflight reports 8/8 structurally valid; no placeholders renamed around the manifest |
| Thu 20 Aug | Mac/two-projector decode rehearsal | Every video plays from first to last frame on both output browsers; all 43 slideshow images decode; sound and alpha decisions recorded |
| Sat 22 Aug | Physical systems rehearsal | Three iPads, Gamepad, back-wall projector, top-down projector, camera and choreography marks exercised together on the dedicated router |
| Mon 24 Aug | Failure drill and backup lock | Blackout-with-server-stopped, reconnect, cable/router failure and backup-Mac launch rehearsed; fresh verified archive copied twice |
| Wed 26 Aug | Dress and configuration lock | Final mappings photographed, cue triggers logged, technical report saved, no OS/browser updates afterward |
| Thu 27 Aug | Show-day certification | Checklist complete before house opens; TECH CHECK green; operator returns to H0 |

## Current missing asset handoff

| Required filename | Owner / decision |
|---|---|
| Kala face PNG set + `manifest.json` entries | Louis / makeup team — randomized transparent face layers for F3.3 |

Copy video deliveries to `public/assets/video/`, then run Media Preflight, projector decode probe and a fresh offline build. Do not call an asset ready solely because the file exists.

Milo, Roblox, the prepared stone projection and the prepared back-wall outro have been ingested into `public/assets/video/` and wired to their show cues.

The unused `hero-loop.mp4` playback reference and local `Kala.mov` source master were removed during the final structure cleanup so the show bundle carries no duplicate large source videos.

H1 uses the projector-ready `hero.mp4` as the looping, audible audience-entry background. F1.1 preserves the current playback position while fading picture and stereo audio to a four-second blackout.
