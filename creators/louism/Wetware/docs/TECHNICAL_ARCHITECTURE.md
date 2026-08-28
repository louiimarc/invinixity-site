# Wetware technical architecture

## Design principle

The Mac is the only authority. Two projector pages and three iPads render the same cue state but never advance themselves. This makes every device recoverable: after a refresh or network interruption it reconnects, identifies itself, and receives the complete current state.

The exception is a deliberately narrow local safety path among the three required Mac windows: operator, back-wall projector and top-down projector. A same-origin `BroadcastChannel` carries only explicit emergency blackout values, allowing the operator to black or restore both projectors even while the Node server is unavailable. Persisted show state remains server-authoritative.

```text
                       dedicated 5 GHz router
                    (internet is not required)

  iPad 1 / aquarium 1 ─┐
  iPad 2 / aquarium 2 ─┼── WebSocket ── Mac show server
  iPad 3 / aquarium 3 ─┘                    │
                                           ├── operator page (Mac display)
                                           ├── back-wall page (wall projector display)
                                           └── top-down page (floor projector display)
```

## System roles

### Mac operator

- owns GO/BACK, direct cue selection, progress override, blackout, freeze, calibration and pulse;
- displays whether both named projectors and all three named iPads are connected;
- persists the most recent state so a server restart returns to the same cue;
- is the only client allowed by the server to change show state.
- opens/focuses separately named back-wall and top-down projector browser windows while remaining on the Mac screen;
- polls a locally connected Gamepad and broadcasts an ephemeral world-space fish position;
- accepts WebMIDI Control Change only, with editable mappings and a separately armed cue-selection mapping.

### Projector renderers

- use stable identities `mac-projector-wall` and `mac-projector-floor`;
- run p5 full-screen on their matching extended displays;
- expose one full-window plane quad per projector; Floor content routes top-down, while screen content and the vertical stone monolith route to the front-throw/back-wall output;
- hold pure black when the selected cue belongs to the other output;
- renders generative modes and local video/camera sources;
- keeps calibration separate from the cue so it can be toggled during focus;
- holds black if blackout is active, regardless of the selected cue.

### Independent Mac emergency blackout

The operator sends `SET_EMERGENCY_BLACKOUT true/false` directly to both projectors at the same time as the authoritative server action. Each projector treats it as a latched override, hiding its main canvas and auxiliary face layer. It does not clear the override merely because a reconnect initially replays stale server state.

On reconnect, the operator writes the explicit value to the server. Both Mac windows clear the local override only after authoritative state matches it. Emergency messages are schema-checked, contain no arbitrary command or media data, and are not accepted from network clients.

### iPad renderers

- use stable identities `ipad-1`, `ipad-2`, `ipad-3` in their URLs;
- render adjacent thirds of one 3000-unit aquarium world;
- render pure black except for high-brightness fish so diagonal acrylic/mika produces a clean Pepper's Ghost reflection;
- share cue state and visual time; small frame differences do not change the composition;
- show a quiet waiting state outside aquarium cues.
- render one shared world-space fish; each device clips the world to its own adjacent third while the sprite overlaps seams, allowing continuous gamepad travel across physical screens.

## Live input model

Gamepad, MIDI motion and the pre-show iPad identity pattern are ephemeral `INPUT` messages, not persisted cue state. This prevents a high-rate controller stream or a setup overlay from writing to disk. Only the operator role may originate them. The identity pattern carries a server-time start epoch, animates synchronously on all clients and expires locally after 20 seconds even if the stop message is lost.

The server retains only the latest sanitized live values in memory and includes that snapshot when a renderer reconnects. A refreshed iPad therefore rejoins the current fish position, MIDI intensity/speed/depth and any still-active order test without waiting for another knob movement. A server restart sends an empty authoritative snapshot, which resets renderer controls to safe defaults rather than retaining stale browser values.

Active Gamepad control has a 1.5-second lease refreshed by the operator. If the operator window, controller stream or network disappears, the server broadcasts an inactive Gamepad state on a 250 ms safety check and the aquariums return to autonomous motion. MIDI values remain in memory until replaced or the server restarts. FREEZE snapshots the visible aquarium controls as well as show time, so a moving or stuck stick cannot continue moving the fish while frozen.

The Gamepad left stick integrates a normalized fish position `(x, y)` where `x=0…⅓` belongs to iPad 1, `⅓…⅔` to iPad 2 and `⅔…1` to iPad 3. The fish rotates toward the shortest wrapped movement vector, so its direction stays correct when crossing from iPad 3 back to iPad 1.

For the current production, device position is choreographic rather than sensed: when the aquarium cue begins, performers place the screens left-to-right as `ipad-1`, `ipad-2`, `ipad-3`, using labeled cases and rehearsed marks. The synchronized order test makes each identity and intended position unambiguous, but the operator must visually confirm the physical order before certification. Automatic self-location remains a later phase.

Each iPad is orientation-locked by iPadOS, mounted screen-up in a fixed 3D-printed housing and viewed through diagonal acrylic/mika. The projector carries the environmental sea, bubbles and seaweed; the reflected iPad layer carries fish only. Optional `reflect=x`, `reflect=y` or `reflect=xy` URL parameters correct mounting-dependent reflection reversal after a physical test without changing the choreography identity.

Future self-location can replace each client's fixed world interval with a measured transform. Viable research paths are camera-readable fiducials on the iPad/aquarium assembly, overhead computer vision, or external ranging hardware. Wi-Fi/WebSocket connectivity by itself does not provide stage position accurately enough. This is explicitly deferred until the fixed-position show is reliable.

WebMIDI input is filtered by status nibble: only `0xB0–0xBF` Control Change messages pass. CC 1 controls persistent progress; other mapped values are ephemeral. Cue select on CC 20 is disabled until explicitly armed. Virtual sliders generate the same intensity/speed/depth messages when MIDI hardware is unavailable.

## State model

The complete broadcast state is small and idempotent:

| Field | Purpose |
|---|---|
| `cueId`, `cueIndex` | current dramatic/media cue |
| `progress` | the continuous installation/loading motif, hard-clamped to the active cue's table-approved band between 0 and 99.9 |
| `blackout` | global fail-safe black output |
| `frozen` | freezes generative visual time without disconnecting devices |
| `calibration` | projector-only alignment grid |
| `pulse` | repeatable trigger for visual/text variations; no longer advances nugget slides |
| `nuggetIndex` | persistent 0-42 direct selection from the dedicated `/nugget/` phone launchpad, accepted only during F2.4 |
| `revision`, `updatedAt` | state ordering and diagnostics |

There is no distributed consensus and no cue timeline on an iPad. A newly connected device receives the full state in `WELCOME`, so reconnecting never depends on replaying missed messages.

## Projection planes and targets

Quad keystone is deliberately limited to two physical planes:

1. `BACK WALL PLANE` – full-window front-throw/back-wall output;
2. `TOP-DOWN FLOOR PLANE` – full-window output perpendicular to the ground.

Each plane stores four normalized coordinates in top-left, top-right, bottom-right, bottom-left order and defaults to the complete browser window. Correction should remain slight. Editing happens only in the operator console and never depends on an object target.

Bebe/body mapping is removed. Kala and the standing stone no longer own separate homography, scanner, depth or mask systems. Their content uses the appropriate full projector plane.

The former single-projector `FLOOR` trapezoid (`0.08,0.56` through `1,0.98`) is migrated once to the full-window rectangle when old show state is loaded. Any other measured floor quad is preserved as an intentional venue adjustment.

Wetware keeps projection-mapping manipulation entirely inside the operator console. Compact previews and a larger modal reproduce each projector's reported window aspect ratio. Draggable corner handles update normalized points through the Mac server, remain separated in preview space, and persist with the complete show state. Projector outputs expose no mapping controls; during calibration, both show only their mapped checkerboard planes.

Kala tracking/placement remains unresolved and is intentionally not represented as a misleading quad. F3.3A broken-pelvis/Bebe is canceled.

## Visual language

The reference material suggests a coherent system rather than unrelated effects:

- black, electric blue, thermal orange/magenta and acid green;
- detector rectangles, labels, percentages and installation/error language;
- bodies presented as scanned, inherited or involuntarily updated systems;
- analog/documentary material contaminated by computational overlays;
- RT/R2 advances and LT/L2 reverses, but neither can cross the active fragment's hard minimum/maximum; the final maximum is 99.9%.

## Failure behavior

| Failure | Intended response |
|---|---|
| One iPad disconnects | Other devices continue; operator sees MISSING; refresh/reopen saved URL |
| Projector browser disconnects | Current rendered frame continues locally; refresh reconnects to current cue |
| Server restarts | Last state reloads from `.wetware-state/show-state.json` |
| Video asset missing | Projector shows an explicit missing-asset slate during rehearsal |
| Camera permission absent | Camera cue shows `ARM CAMERA ON PROJECTOR` |
| Router loses internet | No impact; all runtime assets are local |
| Visual becomes unsafe/wrong | Operator presses BLACKOUT; server broadcasts global black |

The operator Media Preflight checks ten named local assets and their sizes. Missing content is therefore a visible NOT READY condition before house open, not a discovery made on the cue.

## Certification telemetry

Every client reports a small bounded telemetry record after its four-second ping: final raster size, device pixel ratio, fullscreen/standalone mode, visibility, orientation, secure-context state, local page identity and measured round-trip time. The wall projector also reports only its bounded camera-ready label/error status. The server rejects unbounded values and does not collect user-agent strings. The operator combines these records with media preflight and Gamepad state into a repeatable technical certification and downloadable rehearsal report.

Exactly one back-wall projector, one top-down floor projector and one of each named iPad are required. Duplicate identities, stale heartbeats, hidden/windowed renderers, RTT above 120 ms, missing media or Gamepad absence fail certification. A topology/display/controller change invalidates the previous report instead of leaving a misleading green state.

## Remaining production integrations

- measured projector resolution, throw, lens position and all surface corners;
- actual video and image assets with playback/audio decisions;
- camera model/input and capture geometry;
- lighting interaction, especially surface visibility and camera exposure;
- rehearsal timings and precise GO lines;
- decision on fixed-position mapping versus live tracking.
