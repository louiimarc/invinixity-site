# Rehearsal run log

The operator's **REHEARSAL RUN LOG** turns a live run into evidence for completing the cue sheet. It uses server-synchronized timestamps and records only show-control metadata:

- cue entry and exit times;
- GO, BACK, direct selection, progress, pulse, freeze, calibration and blackout actions;
- authoritative state changes and state revision;
- operator online/offline events;
- notes typed by the operator at the current cue.

It does not capture user-agent strings, browsing activity, camera, audio, MIDI content, Gamepad identity history or performer media.

## During rehearsal

1. Give the run a useful name containing venue/date/run number.
2. Press **START NEW LOG** before the first cue under study. The current cue is recorded as the first visit.
3. Operate the show normally.
4. At a useful moment, type the spoken line, movement, music event, late call, fallback or direction change and press **ADD NOTE AT CURRENT CUE**.
5. Press **STOP LOG** at the end of the run.
6. Download both JSON and cue CSV before starting a new log.

An active log is recovered from browser storage after an accidental operator-page refresh. Starting a new log intentionally replaces the previous local log, so download completed evidence first. **CLEAR LOCAL LOG** is disabled while recording and removes only the stopped browser-local log; it does not delete downloaded exports or change show state.

## Exports

The JSON is the complete bounded event record plus a derived `summary.cueVisits` array. Each visit contains entry/exit epoch, duration in milliseconds, entry trigger and notes written during that visit.

The CSV is designed for the stage manager or spreadsheet workflow. It contains one row per cue visit:

```text
cue_number,cue_id,label,entered_at,exited_at,duration_seconds,trigger,notes
```

Repeated visits remain separate rows. This is important when comparing attempts or returning to an earlier cue.

## Updating the cue sheet

After rehearsal, use the CSV and notes to replace every `TBD` in `MEDIA_CUE_SHEET.md` with:

- exact spoken, movement or music trigger;
- hard GO versus manual fade;
- observed duration range and exit condition;
- failure fallback and who calls it.

Measured timings describe a rehearsal, not an automated timeline. The live system remains manually cued unless the director explicitly approves automation.
