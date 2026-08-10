import type { Task } from "./api";

function formatDate(dateStr: string): string {
  // due_date comes back from the API as either a plain date (YYYY-MM-DD) or
  // a full ISO timestamp (YYYY-MM-DDT00:00:00.000Z) depending on the driver
  // -- slicing to the date portion first keeps this an all-day event either
  // way, instead of leaving stray T/colons/Z characters in the ICS value.
  return dateStr.slice(0, 10).replace(/-/g, "");
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function tasksToICS(tasks: Task[], projectName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tasketra//Project Task Export//EN",
  ];

  for (const t of tasks.filter((t) => t.due_date)) {
    // ICS all-day DTEND is exclusive, so it's always due_date + 1 day, whether
    // the task spans multiple days (start_date set) or is a single-day event.
    const startStr = t.start_date || t.due_date!;
    const endExclusive = addDays(t.due_date!, 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@tasketra.app`,
      `SUMMARY:${escapeICS(t.title)} (${projectName})`,
      `DTSTART;VALUE=DATE:${formatDate(startStr)}`,
      `DTEND;VALUE=DATE:${formatDate(endExclusive)}`,
      `DESCRIPTION:${escapeICS(`Owner: ${t.owner_name || "unassigned"} -- Status: ${t.status}`)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeICS(text: string): string {
  return text.replace(/[,;]/g, (m) => `\\${m}`);
}

export function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
