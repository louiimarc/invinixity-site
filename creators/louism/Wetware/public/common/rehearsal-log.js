const ENTRY_TYPES = new Set(["session-start", "session-stop", "cue-enter", "action", "state", "note", "connection"]);
const MAX_ENTRIES = 5000;

export function createRehearsalLog({ title = "Wetware rehearsal", startedAt = Date.now() } = {}) {
  const at = safeTime(startedAt);
  return {
    format: "wetware-rehearsal-log",
    version: 1,
    sessionId: `wetware-${at}`,
    title: cleanText(title, 120) || "Wetware rehearsal",
    startedAt: at,
    endedAt: null,
    active: true,
    entries: []
  };
}

export function normalizeRehearsalLog(candidate) {
  if (!candidate || candidate.format !== "wetware-rehearsal-log" || candidate.version !== 1) return null;
  const startedAt = safeTime(candidate.startedAt);
  if (!startedAt) return null;
  return {
    format: "wetware-rehearsal-log",
    version: 1,
    sessionId: cleanText(candidate.sessionId, 80) || `wetware-${startedAt}`,
    title: cleanText(candidate.title, 120) || "Wetware rehearsal",
    startedAt,
    endedAt: candidate.endedAt == null ? null : safeTime(candidate.endedAt),
    active: Boolean(candidate.active) && candidate.endedAt == null,
    entries: (Array.isArray(candidate.entries) ? candidate.entries : []).slice(-MAX_ENTRIES).map(normalizeEntry).filter(Boolean)
  };
}

export function appendRehearsalEntry(log, candidate) {
  const normalized = normalizeRehearsalLog(log);
  const entry = normalizeEntry(candidate);
  if (!normalized || !normalized.active || !entry) return normalized;
  normalized.entries = [...normalized.entries, entry].slice(-MAX_ENTRIES);
  if (entry.type === "session-stop") {
    normalized.active = false;
    normalized.endedAt = entry.at;
  }
  return normalized;
}

export function buildRehearsalReport(log, now = Date.now()) {
  const normalized = normalizeRehearsalLog(log);
  if (!normalized) return null;
  const endedAt = normalized.endedAt || safeTime(now);
  const cueVisits = cueVisitSummary(normalized.entries, endedAt);
  return {
    ...normalized,
    summary: {
      durationMs: Math.max(0, endedAt - normalized.startedAt),
      entryCount: normalized.entries.length,
      cueVisitCount: cueVisits.length,
      cueVisits
    }
  };
}

export function rehearsalCueCsv(log, now = Date.now()) {
  const report = buildRehearsalReport(log, now);
  if (!report) return "";
  const rows = [["cue_number", "cue_id", "label", "entered_at", "exited_at", "duration_seconds", "trigger", "notes"]];
  for (const visit of report.summary.cueVisits) rows.push([
    visit.cueNumber,
    visit.cueId,
    visit.label,
    new Date(visit.enteredAt).toISOString(),
    new Date(visit.exitedAt).toISOString(),
    (visit.durationMs / 1000).toFixed(3),
    visit.trigger,
    visit.notes.join(" | ")
  ]);
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function cueVisitSummary(entries, endedAt) {
  const visits = [];
  const cueEntries = entries.filter((entry) => entry.type === "cue-enter");
  for (let index = 0; index < cueEntries.length; index += 1) {
    const entry = cueEntries[index];
    const exitedAt = Math.max(entry.at, cueEntries[index + 1]?.at || endedAt);
    visits.push({
      cueId: entry.cueId,
      cueNumber: entry.cueNumber,
      label: entry.label,
      enteredAt: entry.at,
      exitedAt,
      durationMs: exitedAt - entry.at,
      trigger: entry.detail,
      notes: entries.filter((item) => item.type === "note" && item.at >= entry.at && item.at < exitedAt).map((item) => item.note)
    });
  }
  return visits;
}

function normalizeEntry(candidate) {
  if (!candidate || !ENTRY_TYPES.has(candidate.type)) return null;
  const at = safeTime(candidate.at);
  if (!at) return null;
  return {
    type: candidate.type,
    at,
    cueId: cleanText(candidate.cueId, 80),
    cueNumber: cleanText(candidate.cueNumber, 30),
    label: cleanText(candidate.label, 160),
    revision: Math.max(0, Math.round(Number(candidate.revision) || 0)),
    detail: cleanText(candidate.detail, 200),
    note: cleanText(candidate.note, 500)
  };
}

function safeTime(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, limit);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
