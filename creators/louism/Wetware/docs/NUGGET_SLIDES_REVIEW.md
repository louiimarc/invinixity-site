# Nugget slideshow artwork review

## Audit result

`public/assets/image/nugget-series/` contains the complete web-ready set for F2.4:

- 43 ordered vocabulary artworks;
- all 43 files are 720 × 1280 RGB/RGBA PNGs;
- the ordering matches the rehearsal vocabulary from `KEMEJA` through `TUHAN`.
- `slideshow.json` sits beside the PNG files so the browser resolves every image locally.

The final `TUHAN` frame uses one PNG. Any repeated zoom is performed by the p5 presentation system rather than baked into duplicate image files.

## Direction approval

Louis/direction should retain the final production review for:

- the consistent chicken-nugget character direction;
- the green shape/background inside `33-teater.png`;
- recognizable pop-culture language or imagery, especially `22-anime-isekai.png` and `23-mcu.png`;
- sensitive vocabulary treatments including `15-sex.png`, `20-keset-bule.png`, `24-alkohol.png`, `25-babi.png`, and `43-tuhan-cross.png`;
- the continuous software zoom treatment for the single `43-tuhan-cross.png` asset.

Generated artwork still needs the production's normal creative and rights review.

## Filename notes

Two source filenames contain spelling abbreviations/typos, while the visible cue text remains correct:

- `30-teur-rebus.png` maps to `TELUR REBUS`;
- `32-bekarya.png` maps to `BERKARYA`.

Do not rename these files in place. The production `slideshow.json` can map the correct cue text to the existing filenames, avoiding changes to user-owned output.

## Integration status and approval

Run `npm run slides:audit` at any time. It validates the exact 43-file set, PNG headers, 720 × 1280 dimensions and supported RGB/RGBA color types without changing the manifest.

The current `slideshow.json` is installed beside the 43 images and passes Media Preflight with all 43 dependencies present. Creative/rights approval is still a human gate. If the manifest is deliberately removed for regeneration after that approval, run:

```sh
npm run slides:install -- --approved
```

The guarded installer refuses to run without `--approved` and refuses to overwrite an existing production slideshow. It generates `public/assets/image/nugget-series/slideshow.json` beside the approved PNGs in fixed vocabulary order. Every portrait image uses `contain` so the landscape projector does not crop it.

Then run Media Preflight and exercise all 43 images, including the p5-driven TUHAN animation, in the real projector browser.
