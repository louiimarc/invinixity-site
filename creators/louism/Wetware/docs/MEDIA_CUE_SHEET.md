# Wetware media cue sheet — working draft

Source scope: PDF pages 100–102, Media/Video sections. Cue numbers are technical working numbers and can be renamed to match the stage manager's book.

| Cue | Section | Trigger / action | Projector | iPads | Progress | Assets / dependency | Status |
|---|---|---|---|---|---:|---|---|
| H0 | Pre-show | Hold until first GO | Blackout | Black | 0 | None | Safe preset; all outputs black before start |
| H1 | Pre-show / Gong 1 | Audience entry begins | `Get Ready With Me` loops full-screen with programme audio | Black | 0 | `hero.mp4`, audible, looping | Ready; runs as pre-show background |
| F1.1 | Fragment I / Gong 3 | GO once | Continue current frame, fade picture and sound to black over 4 seconds, then hold black | Idle | 0 | Same `hero.mp4` playback | Ready; MC opening begins after the fade |
| F2.1 | Fragment II | Fragment begins | Loading UI on floor, stays alive | Idle | 1→49 | Floor mapping preset | Hard-capped from the latest show table |
| F2.2 | Fragment II | Iyas/Milo trigger TBD | Milo ad to screen | Idle | continues | `milo.mp4`, IG Iyas source + permission | Ingested; rights approval pending |
| F2.3 | Fragment II | Objects arrive on table | Live camera objects to screen | Idle | continues | Camera, stand, tested permission | Prototype ready; hardware TBD |
| F2.4 | Fragment II | Slideshow sequence begins | Vocabulary/image slideshow; each word is launched directly from the phone pad in improvised order | Idle | continues | `/nugget/` touch launchpad + validated `slideshow.json` + 43 local images | Technical integration/preflight ready; direction/rights approval pending |
| T1.1 | Transition I | Aquariums are taken | Silent looping `ocean-fishtank.mp4` on back wall | Pure-black Pepper's Ghost layer with bright shared fish | 49→66 | Three charged orientation-locked iPads, 3D-printed housings, diagonal acrylic/mika | Single combined scene; floor loading off; hard-capped from the latest show table |
| F3.1 | Fragment III | Budgeting starts | Spreadsheet 50/30/20 on floor | Idle | 66 | Final spreadsheet values | Loading hidden; section naming differs from latest show table |
| F3.2 | Fragment III | Immediately after spreadsheet | Loading UI on floor, stays alive | Idle | 66→76 | Floor mapping preset | Hard-capped from the latest show table |
| F3.3 | Fragment III | Kala reaches mark | Random transparent face PNG centered on black; frame-rate absolute left-stick positioning with 0.5 smoothing | Idle | continues | `assets/image/kala-face/manifest.json`; H0 origin/uniform-scale calibration | Circular placeholder ready until PNGs arrive |
| T2.1 | Transition II | Stone is pushed into place | Open mask stroke appears as a tracing outline on the back wall; after closure, `transition-2-objects.mov` remains full wall and `transition-2-stone.mov` appears cover-fitted inside the completed mask | Idle | 76 | Operator stone-mask pad; close inside 28 px start target | Both videos ingested; live trace and mask ready |
| F4.1 | Fragment IV | Roblox scene begins | Roblox video to screen | Idle | 76→99.9 | `fragment-4-roblox.mov`, audio/So Asu transition | Ingested; playback approval pending |
| F4.2 | Fragment IV | Loading continuation | Loading UI on floor, stays alive | Idle | 76→99.9 | Floor mapping preset | Hard-capped from the latest show table |
| F4.3 | Fragment IV | Dance / KodeLife trigger | Fullscreen OBS Virtual Camera on back wall; OBS switches to KodeLife capture | Idle | 76→99.9 | F4.3 soundtrack loops with camera feed and stops on next cue | No in-browser shader renderer |
| F5.1 | Fragment V | Final video trigger | Reverse video on back wall | Idle | 99.9 | `fragment-5-reverse.mp4` | Loading hidden; browser-safe MP4 with range streaming |
| END | End | Reverse video and performer exit complete | Black | Black | 99.9 | Show-end hold | Ready; loading has already disappeared before F5.1 |
| CALL | Curtain call | GO after the show-end blackout | Fullscreen `Under Pressure` YouTube player with sound | Black | 99.9 | Internet + `a01QQZyl-_I` | Network-dependent; every actor call must finish before video end |
| EXIT | Post-show | Curtain call complete | Black | Black | 99.9 | Audience-exit decision | Ready |

Only cue-assigned local playback video remains in the public bundle. The curtain-call YouTube cue is deliberately external and is not included in offline media preflight or the offline bundle.

## Slideshow vocabulary

Kemeja; Riasan; Wangi-wangian; Gangguan finansial; Tata bahasa Indonesia; Sekolah chicken nugget; Ijazah chicken nugget; Pengalaman kerja chicken nugget; Relasi chicken nugget; Lapangan kerja chicken nugget; Gelar sarjana chicken nugget (S.Cn); Nikah; Pasangan; Cerai; Sex; Anak skena; Cari uang; Internet; Seluruh dunia; Keset bule; Pengangguran; Anime isekai; MCU; Alkohol; Babi; Protein; Gula; Tepung; Sayur hijau; Teur rebus; Saus; Bekarya; Teater; Sedih; Gokil; Pertanyaan; Motif; Tema; Wacana; Darurat; Life-changing; Gak berarti; Tuhan (repeated zoom).

This sequence follows the spelling and exact start-to-end order in `Struktur Wetware.pdf`, pages 100-101. The dedicated `/nugget/` phone controller presents the list as a two-column Z-pattern launchpad (`1 | 2`, `3 | 4`, and so on). Any word can be fired directly during F2.4 without advancing or rewinding the main theatre cue stack. Nugget controls do not appear in the operator console.

## Information still needed from rehearsal

Use the operator's **REHEARSAL RUN LOG** and add timestamped notes at each spoken/movement/music trigger. The exported cue CSV supplies measured visit durations; see `REHEARSAL_LOG.md`.

For every row, the stage manager/director should supply:

- exact spoken line, movement or music event that calls the cue;
- whether the cue is a hard GO or a slow manual crossfade;
- expected duration and exit condition;
- projector surface/preset and performer spike mark;
- audio source and who owns its level;
- fallback if the trigger or asset fails.
