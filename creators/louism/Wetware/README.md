# Wetware Show Control

Offline-first stage technology for Merpati Performance Laboratory's **Wetware**. One Mac is the authoritative cue server and drives two independent projector renderers: back wall and top-down floor. Three iPads are synchronized p5 clients on the same private local network.

Performance: **Thursday, 27 August 2026 · 19:00 WIB · Gedung Teater Bulungan, Jakarta Selatan**.

## Run

```sh
npm install
npm run dev
```

`npm run dev` restarts the server and refreshes connected clients when source files change. Use `npm start` for performance/show day.

The server prints the local URLs. Open:

- Mac operator: `http://localhost:4173/operator/`
- Back-wall projector: `http://localhost:4173/projector/?output=wall`
- Top-down floor projector: `http://localhost:4173/projector/?output=floor`
- iPads: `http://MAC-NAME.local:4173/ipad/1/`, `/ipad/2/`, and `/ipad/3/`

For show deployment and the backup Mac, build the [verified offline bundle](docs/OFFLINE_BUNDLE.md) while dependencies and approved media are present. The archive includes the tested arm64 Node runtime and npm dependencies, so launching it requires no npm install or internet connection.

Use a dedicated 5 GHz router with no internet dependency. Keep the Mac connected by Ethernet when possible. Open the console first, then use its separate **BACK WALL** and **TOP-DOWN FLOOR** launch buttons. Drag each named window to its matching extended display and press `F` inside each. The console remains visible on the Mac display.

The Mac windows also share a direct emergency channel. **BLACKOUT** and `B` send an explicit black-on/black-off value both through the server and directly from the operator window to both projector windows. If the Node server stops, the button shows `LOCAL` and still blacks or restores both outputs. The local safety state remains latched until a reconnected server acknowledges the same value.

## Current scope

The prototype implements:

- authoritative cue state with automatic reconnect and state replay;
- connected-device health on the operator panel;
- GO, previous, direct cue selection, blackout, freeze and progress override;
- cue-aware production video and validated JSON content, with generative rehearsal fallbacks for hero, slideshow, anatomy, running text and organs;
- two stable projector identities with automatic cue routing: screen content to back wall and mapped stage content to the top-down output;
- exactly two persistent four-corner plane quads: full-window Back Wall and full-window Top-Down Floor;
- three coordinated iPad aquarium segments with shared show time;
- Web Gamepad control of one bright directional fish that travels continuously across iPad 1 → 2 → 3;
- a synchronized 20-second iPad order test for the choreographed LEFT / CENTER / RIGHT placement;
- CC-only WebMIDI mappings plus virtual CC sliders when the MIDI controller is absent;
- projector calibration grid and safe text/edge marks;
- persistent recovery state after a server restart.

Approved webpage artwork lives under `public/assets/image/`; the 43-image nugget series is already wired there. Production playback video lives under `public/assets/video/`, while performer text data lives under `public/assets/data/`. The console's **Media Preflight** checks the manifest, non-empty files, JSON structure and local slideshow images; it changes to READY only when the complete set is valid. See [Production media formats](docs/MEDIA_FORMATS.md).

## Documents

- [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Media cue sheet](docs/MEDIA_CUE_SHEET.md)
- [Production media formats](docs/MEDIA_FORMATS.md)
- [Network and show-day checklist](docs/SHOW_DAY_CHECKLIST.md)
- [Nugget slideshow artwork review](docs/NUGGET_SLIDES_REVIEW.md)
- [Technical certification and rehearsal report](docs/TECHNICAL_CERTIFICATION.md)
- [Rehearsal run logging and cue-duration export](docs/REHEARSAL_LOG.md)
- [Verified offline show bundle and backup-Mac recovery](docs/OFFLINE_BUNDLE.md)
- [Public-reference and dramaturgical alignment](docs/REFERENCE_ALIGNMENT.md)
- [Production countdown to 27 August](docs/PRODUCTION_COUNTDOWN.md)

## Keyboard controls

On the operator page:

- `Space`: GO
- `B`: blackout
- `F`: freeze/unfreeze visual time
- `C`: projector calibration overlay
- `←` / `→`: previous/next cue

On either projector window:

- `F`: enter/exit fullscreen

## Projector surface calibration

The system has exactly two projection-plane quads: `BACK WALL` and `TOP-DOWN FLOOR`. Both fill their complete browser windows by default because each projector is physically rigged perpendicular to its plane; venue correction should be slight. All mapping controls live in the operator console. Its compact previews and large visual-keystone modal copy each projector's reported window ratio, and draggable TL/TR/BR/BL points update the authoritative server state. Sliders and nudge buttons remain available for precision work.

While calibration is active, both projector outputs show only their own checkerboard plane—never mapping handles or setup controls. The operator's Scene Setup panel separately calibrates Kala's idle origin and uniform scale and draws the live stone vector mask during H0.

## Gamepad and WebMIDI

Connect the gamepad to the Mac, focus the operator window, then move the left stick. The operator track shows the shared fish position. One generated neon fish follows that movement vector, mirrors horizontally for left/right travel, uses only a limited upright tilt for vertical movement, and crosses iPad seams as a single continuous object.

## iPad Home Screen apps

Each iPad can install separate Wetware modes as independent Home Screen apps. Open the desired URL once in Safari and choose **Share → Add to Home Screen**. The generated manifest preserves that device identity, launches in standalone landscape mode and supplies a distinct icon:

- Aquarium: `/ipad/1/`, `/ipad/2/`, or `/ipad/3/`. These separate paths give iPadOS three permanent Home Screen identities; keep any approved `reflect` parameter before installing.
After installation, launch the Aquarium icon for the black-background fish renderer; bookmarks and mode-selection pages are not required.

If older Aquarium 2 or 3 icons reopen as Aquarium 1, delete those old Home Screen icons first, revisit the numbered path in Safari, verify the page says the intended iPad number, and add it again. Existing query-style links automatically change their visible URL to the numbered path before installation.

**SWARM LINE TEST** automatically sweeps the same control path through all three screens for setup and troubleshooting. A connected gamepad takes priority.

Before the aquarium rehearsal, press **IPAD ORDER TEST**. The three clients show large `1 LEFT`, `2 CENTER`, and `3 RIGHT` identities while the highlight moves across them in synchronized order. Arrange the physical screens to match, then tick the visual-confirmation box. The pattern automatically stops after 20 seconds and the confirmation is required by **RUN TECH CHECK**. This is the current choreography-based placement method; it makes no claim to self-locate the devices.

The production iPads are orientation-locked in iPadOS and mounted screen-up in the 3D-printed aquarium housings. Their images reflect through diagonal acrylic/mika as a Pepper's Ghost layer: aquarium cues therefore render pure black behind high-brightness fish only. The back-wall projector loops the silent Ocean Fish Tank video. If a particular acrylic mounting reverses the reflected image, append `&reflect=x` to that iPad's URL (`y` and `xy` are also supported); choose this only after a physical reflection test.

Click **ENABLE MIDI INPUT** to request WebMIDI access. Only MIDI Control Change status (`0xBn`) is accepted; Note, Aftertouch, Program Change and Pitch Bend messages are ignored. Defaults:

- CC 1: loading progress, hard-clamped to the active fragment's approved band (0–99.9 overall)
- CC 2: visual intensity
- CC 3: fish swarm speed
- CC 4: fish depth
- CC 20: cue selection, only when the dangerous cue-select checkbox is armed

All CC numbers are editable in the console. The **Virtual CC** sliders exercise intensity, fish speed and depth without MIDI hardware; the existing loading slider and cue stack cover the other two mappings.

Avoid using the venue Wi-Fi. This system is designed to continue if the internet disappears.

## Technical certification

After the projector and all three iPads are in their final display modes, press **RUN TECH CHECK** on the operator console. It validates unique device identities, heartbeat freshness, visibility/fullscreen state, renderer and operator RTT, production media and Gamepad. Download the resulting JSON for rehearsal evidence. Any renderer, display or Gamepad change marks the result stale and requires another run.
