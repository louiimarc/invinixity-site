# Kala face images

Put transparent PNG makeup faces in this folder, then add their filenames to `manifest.json`, for example:

```json
{
  "images": ["face-01.png", "face-02.png", "face-03.png"]
}
```

The projector chooses one at cue entry, automatically chooses another every three seconds, and also changes immediately on operator **PULSE / EFFECT**. Immediate repeats are avoided. When the list is empty, the calibrated oval placeholder is used.
