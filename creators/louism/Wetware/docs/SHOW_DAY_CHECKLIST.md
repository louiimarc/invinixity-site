# Network, rehearsal and show-day checklist

## Equipment baseline

- Mac + power supply + USB-C/HDMI adapter + tested spare adapter
- two projectors + two signal paths/adapters + tested spare cables
- dedicated dual-band router; Mac connected by Ethernet if possible
- three iPads, three chargers/power banks, three labeled mounts
- camera + stable stand/capture interface if not using Mac camera
- gaffer tape, fluorescent spike tape, cable ramps/safety covers
- local backup of the complete project and all media on a second drive
- latest verified offline `.tar.gz` plus its `.sha256` file, extracted and rehearsed on the backup Mac

## Router setup

- Unique SSID, e.g. `WETWARE-SHOW`; strong password known only to crew.
- Use 5 GHz and a fixed, quiet channel after scanning the venue.
- Disable client/AP isolation; devices must be allowed to reach the Mac.
- Disable guest mode, captive portal and automatic firmware updates.
- Confirm the router allows Bonjour/mDNS so the Mac's `.local` hostname resolves from every iPad.
- Internet/WAN is required only for the post-show `Under Pressure` curtain-call cue. The performance through END remains local/offline-capable.

## Day before / venue load-in

- [ ] Copy final videos to `public/assets/video/`, text data to `public/assets/data/`, and verify exact filenames.
- [ ] Run `npm run bundle:offline`, copy the archive/checksum to the second drive, verify/extract it on the backup Mac, and run both `VERIFY-WETWARE.command` and a complete renderer rehearsal there.
- [ ] Run `npm test`.
- [ ] Launch server and bookmark all three fixed iPad URLs.
- [ ] Open the NUGGET PAD URL on the control iPhone, add it to the Home Screen if desired, and confirm it reconnects after screen lock.
- [ ] With the operator and both projector windows open, deliberately stop the server once and confirm BLACKOUT still produces pure black on both outputs through the local emergency path; restart and verify state reconciliation.
- [ ] Run **IPAD ORDER TEST**, arrange the displays as `1 LEFT → 2 CENTER → 3 RIGHT`, and tick the visual-confirmation box.
- [ ] Toggle calibration, then use **BACK WALL CAMERA SETUP** on the back-wall window itself: refresh, select OBS Virtual Camera, confirm `LOCAL ACTIVE`, disable calibration for a clean H0 blackout, then test F2.3 and F4.3.
- [ ] Pair/connect the gamepad, move the left stick and walk the single directional fish across iPad 1 → 2 → 3; confirm its head follows every direction change.
- [ ] While the fish is moving, reload one iPad and confirm it rejoins the active Gamepad position; close the test operator window and confirm control releases to autonomous motion within two seconds.
- [ ] Engage FREEZE during fish movement and confirm Gamepad travel stops; unfreeze and confirm current control resumes.
- [ ] If MIDI will be used, connect it, enable WebMIDI and verify only the intended CC numbers respond.
- [ ] Test Virtual CC sliders as the no-MIDI fallback.
- [ ] Add each iPad page to Home Screen; disable screen auto-lock, then enable and match the rehearsed orientation lock on all three iPads.
- [ ] Label cases and chargers `IPAD 1`, `IPAD 2`, `IPAD 3`; rehearse the fixed left-to-right placement and mark it in choreography.
- [ ] Set iPads to Do Not Disturb; disable automatic updates and background app refresh.
- [ ] Match brightness and color settings; disable True Tone/Night Shift/auto-brightness.
- [ ] Lock all three iPads to the rehearsed iPadOS orientation before inserting them screen-up into the 3D-printed aquarium housings.
- [ ] Clean and seat each diagonal acrylic/mika reflector; confirm black pixels disappear and only the bright fish reflection remains visible.
- [ ] Check reflection direction on each housing; add `reflect=x`, `reflect=y` or `reflect=xy` to its saved URL only if the physical image is reversed.
- [ ] Confirm operator shows BACK WALL + TOP-DOWN FLOOR + iPad 1/2/3 green for at least 30 minutes.
- [ ] Start a rehearsal run log, add notes at uncertain triggers/fallbacks, stop it, and download both JSON and cue CSV before starting another run.
- [ ] Put every renderer in its final fullscreen/standalone mode, run TECH CHECK and save the JSON report with rehearsal notes.
- [ ] Test router with audience phones present or simulate congestion.
- [ ] Run every video fully from local storage and inspect first/last frame and audio.
- [ ] On the actual venue network, run CALL from END and confirm the embedded `Under Pressure` video starts with sound, stays fullscreen/mapped, and has no embedding, consent, ad or buffering interruption.
- [ ] Grant camera permission, then restart the browser and confirm it remains usable.
- [ ] Launch each installed Aquarium Home Screen icon; confirm its unique device name and standalone landscape display.
- [ ] Mark both projector rigs and the standing stone position; record Kala's method separately when direction confirms it.
- [ ] In the operator console, refresh camera inputs, select the iPhone Continuity Camera or built-in camera, and verify its ready status. Camera controls must never appear on a show output.

## Before house opens

- [ ] Restart Mac and iPads; connect only to `WETWARE-SHOW`.
- [ ] Connect all power and prevent exposed cable strain.
- [ ] Start server; open operator, both named projector pages and the three named iPad pages.
- [ ] From operator, open/focus BACK WALL and TOP-DOWN FLOOR separately; drag each window to its matching extended display.
- [ ] In each projector window press `F` to arm and fullscreen it; grant and select camera access only from the operator console.
- [ ] Verify five required renderers are green on operator: two projectors and three iPads.
- [ ] Toggle calibration and align projector/surface presets.
- [ ] Open **LARGE VISUAL KEYSTONE** in the operator console; confirm both projector outputs show checkerboards and both operator previews match their reported window ratios.
- [ ] Save and photograph only the two plane quads: BACK WALL and TOP-DOWN FLOOR.
- [ ] Confirm SCREEN and FLOOR resets fill their complete respective windows; use only slight quad correction for the two physical projection planes.
- [ ] Drag all four corners only in the operator modal, use sliders/nudges for precision, then press **DONE · HIDE CHECKERBOARDS**.
- [ ] Enter T2.1 and confirm the prepared stone projection uses its assigned full projector plane; there is no separate Rock mask or mapping control.
- [ ] Check blackout, theatre GO/BACK, progress slider, pulse and freeze.
- [ ] Enter F2.4 and verify the iPhone nugget launchpad enables, follows two-column Z order (`1 | 2`, `3 | 4`), launches arbitrary words directly, and never changes the theatre cue.
- [ ] Test each iPad by temporarily entering T1.1.
- [ ] Connect the Gamepad, run SWARM LINE TEST through iPad 1 → 2 → 3, stop it, then run TECH CHECK again. Do not open house until required failures are resolved.
- [ ] Return to H0 and confirm every output is black before start.
- [ ] Stop all OS notifications; keep screen saver and sleep disabled.

## Operator emergency order

1. If output is inappropriate or corrupt: **BLACKOUT**.
2. If motion is wrong but composition is usable: **FREEZE**.
3. If one iPad is missing: leave other devices running; reload that device's saved URL.
4. If either projector page is missing: refresh its stable Wall/Floor URL; authoritative state will return automatically.
5. If server is stopped: restart it; the last cue reloads from disk.
6. If network cannot recover: iPads hold their most recent local frame; continue projector cues locally or remain black per stage-manager call.

## Post-show

- [ ] Return to EXIT/black and stop the server.
- [ ] Copy any revised state, cue notes and final media manifest to the backup.
- [ ] Log missed/late cues, disconnects, mapping drift and projector/camera issues.
- [ ] Charge all devices before the next call.
