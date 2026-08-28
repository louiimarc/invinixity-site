# Wetware technical certification

The operator's **RUN TECH CHECK** button captures a time-stamped evidence snapshot. It does not move cues or alter output. Run it only after the console, both projectors and all three iPads are in their final windows/display modes.

## Required gates

The result is **SHOW TECH READY** only when all of these pass:

- exactly one `mac-projector-wall` and one `mac-projector-floor` client with the projector role;
- exactly one `ipad-1`, `ipad-2` and `ipad-3` client with the iPad role;
- no duplicate expected device identities;
- an operator has run the synchronized iPad order pattern and explicitly confirmed `1 LEFT → 2 CENTER → 3 RIGHT`;
- each renderer heartbeat is at most seven seconds old;
- each renderer reports visible output;
- both projectors and all iPads report fullscreen or standalone display mode;
- each renderer's recent WebSocket round-trip time is at most 120 ms;
- operator round-trip time is at most 120 ms;
- all production media in the manifest is present and structurally valid;
- both projector browsers have decoded metadata for every video and every slideshow image during probes no more than 90 seconds old;
- a Gamepad is connected;

WebMIDI remains advisory because Virtual CC is available. Projector mapping is certified through the two operator-controlled checkerboard planes; there is no separate Rock quad or depth-mask system.

## Interpreting failures

- `MISSING`: the expected URL is not connected. Reopen the saved page.
- `DUPLICATES`: two pages claim the same physical screen. Close the extra page before continuing.
- physical iPad order failure: press **IPAD ORDER TEST**, arrange the screens to match the large labels, then tick the confirmation box.
- `HIDDEN / UNKNOWN`: the browser has backgrounded or suspended the renderer.
- `BROWSER`: the renderer has not entered fullscreen/standalone mode. Press `F` in the projector; launch iPads from their Home Screen installation.
- `WAITING FOR PING`: wait one four-second telemetry cycle, then run again.
- RTT above 120 ms: inspect Wi-Fi congestion, client isolation, band selection and distance from the dedicated router.
- media preflight failure: use Media Preflight to see exact missing, empty, malformed or dependency filenames.
- projector media decode failure: inspect the reported asset ID; transcode unsupported/corrupt video or replace an image that the show browser cannot decode. WebM alpha must be tested on the actual show Mac.

## Report JSON

**DOWNLOAD REPORT JSON** saves:

- cue/state revision at check time;
- operator controller availability, RTT and physical iPad-order confirmation;
- named device roles, connections, heartbeat times and bounded display telemetry;
- media manifest results and the projector's bounded runtime decode-probe result;
- every certification check and its required/advisory status.

It intentionally excludes user-agent strings, browser storage and unrelated device information. Attach the report to rehearsal notes with the venue/date in the filename or accompanying log.

## Staleness

A report becomes stale as soon as a renderer connects, disconnects, reconnects, changes resolution, visibility or display mode, the projector media probe changes result, or the Gamepad state changes. The console removes the READY/NOT READY claim and requires a fresh run. A same-result periodic media refresh, heartbeat timestamps and small RTT changes alone do not make a report stale.

Certification is evidence about software/network state. A human still verifies picture framing, projector focus, physical iPad order, sound, performer marks, cable safety and actual media content.
