# Verified offline show bundle

The offline bundle is the deployable backup artifact for the show Mac. It contains application code, final media, current persisted show state, documentation, tests, exact npm dependencies and the tested arm64 macOS Node runtime. It does not contain development-only `output/`, `tmp/`, Git history or unrelated creator files.

## Build on the primary show Mac

Install/update dependencies while internet is available, place approved videos in `public/assets/video/` and text data in `public/assets/data/`, set the desired recovery cue/calibration state, then run:

```sh
npm run bundle:offline
```

The builder first runs the complete automated test suite. If anything fails, it creates no bundle. Successful output appears in `dist/` as:

```text
wetware-offline-YYYYMMDD-HHMMSS.tar.gz
wetware-offline-YYYYMMDD-HHMMSS.tar.gz.sha256
```

The archive checksum proves that the copy arriving on the backup drive is byte-identical. Inside the archive, `BUNDLE-MANIFEST.json` holds a SHA-256 hash and size for every immutable runtime/media file. `.wetware-state/show-state.json` is intentionally marked mutable because calibration and current cue must continue changing during use.

## Prepare the backup Mac

The embedded runtime built here targets **macOS arm64**. Use an Apple-silicon backup Mac. An Intel Mac needs a bundle built using an x64 Node runtime on an Intel/x64 environment.

1. Copy both the archive and `.sha256` file to the second drive.
2. On the backup Mac, verify the archive before extraction:

   ```sh
   shasum -a 256 -c wetware-offline-YYYYMMDD-HHMMSS.tar.gz.sha256
   ```

3. Extract the archive to a local writable folder—not directly onto a slow removable drive.
4. Double-click **VERIFY-WETWARE.command**. It checks every immutable file using the embedded runtime and runs all tests without internet.
5. Double-click **START-WETWARE.command**. It verifies integrity again, starts the local server and opens the operator page.
6. Connect both projectors and all three iPads, run the order test and technical certification, and confirm the recovered cue/mapping values before treating this Mac as ready.

The command window must remain open while the show runs. Closing it stops that server cleanly.

## Updating a bundle

Never modify a verified bundle in place. If code or media changes, build a new timestamped archive, verify it on the backup Mac, and retain the last known-good archive until the new one passes a full rehearsal.

Calibration/show state is mutable after extraction and therefore excluded from integrity failure. Downloaded rehearsal and certification reports live outside the bundle and should be copied to the rehearsal archive separately.

## What integrity verification can and cannot prove

It proves that packaged code, dependencies, embedded runtime, documentation and media match the primary Mac at build time. It cannot prove projector focus, video content approval, media rights, audio routing, physical iPad order, camera geometry, router quality or performer marks; those remain show-day certification and human checks.
