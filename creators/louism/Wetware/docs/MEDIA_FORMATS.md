# Production media formats

The show reads approved playback video from `public/assets/video/`, text data from `public/assets/data/`, and webpage images from `public/assets/image/`. Keep the paths in `show/assets.js` unchanged unless the cue configuration is updated at the same time. The operator's **MEDIA PREFLIGHT** checks every required file, rejects empty or malformed JSON, and verifies local slideshow images. The projector independently probes every asset once a minute; certification also requires the actual show browser to decode all video metadata and slideshow images.

## Video

- Full-screen video: H.264 in an `.mp4` container, constant frame rate, 1920×1080 or the measured projector raster.
- Mapped video that needs transparency: VP8/VP9 with alpha in `.webm`. Kala faces specifically use transparent PNG layers listed in `assets/image/kala-face/manifest.json`.
- Avoid variable-frame-rate phone exports. Transcode them before show day.
- Preserve audio only for cues marked as audible in the cue sheet. House/anatomy/organ loops are forced silent by the renderer.
- Keep a second tested copy of all production media on another drive.

The projector begins muted so browser autoplay is safe. Press **ARM OUTPUT + FULLSCREEN** once; audible cues can then play sound. A video is rewound only when its cue is entered, not when progress or another live control changes.

## `slideshow.json`

The root may be an array or an object with a `slides` array. A slide can be a string or an object:

```json
{
  "slides": [
    "KEMEJA",
    {
      "text": "TUHAN",
      "image": "43-tuhan-cross.png",
      "background": "#000000",
      "foreground": "#71ff4b",
      "fit": "contain",
      "zoom": true
    }
  ]
}
```

- `text` is optional when `image` exists.
- `image` must be relative to the folder containing `slideshow.json`; remote URLs, data URLs, and parent-directory paths are rejected. The nugget set keeps both the manifest and PNG files in `public/assets/image/nugget-series/`.
- `background` and `foreground` accept six-digit hex colors only.
- `fit` is `cover` by default. Use `contain` for portrait artwork that must remain uncropped on the landscape projector.
- `zoom` applies the repeated zoom treatment used for the final TUHAN slide.
- When an approved nugget image decodes, the projector shows only that artwork: no generated title, counter or `UPDATE PACKAGE` overlay. Slide names and position remain in the operator queue. Text is rendered only as a restrained fallback when an image fails to decode.
- Nugget navigation is nested inside F2.4 and does not change the theatre cue. Use **PREVIOUS NUGGET** / **NEXT NUGGET**, keyboard `[` / `]`, or click an item in the ordered operator queue. The queue is fixed to the script order from PDF pages 100-101. Entering F2.4 starts at KEMEJA; navigation stops at TUHAN instead of wrapping.

## Failure behavior

Hero, pelvis/Kala, and organ cues retain their generative rehearsal visuals if production video is missing or cannot decode. Video-only cues display a conspicuous missing-asset slate. The slideshow retains its current rehearsal text if its JSON is missing or invalid. These fallbacks keep rehearsal moving, but **MEDIA PREFLIGHT** and **RUN TECH CHECK** remain red until every production asset and slideshow dependency is valid.
