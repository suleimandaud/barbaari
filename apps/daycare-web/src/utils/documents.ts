import { documentsApi } from "@barbaari/shared";

/** Download through the authenticated API (the file is private), then hand it to the browser. */
export async function downloadDocument(row: any) {
  const response = await documentsApi.download(row.id);
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = row.fileName ?? row.original_name ?? `${row.title}.download`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileKind(row: any): "PDF" | "DOC" | "IMG" | "TXT" | "FILE" {
  const mime = String(row?.mimeType ?? row?.mime_type ?? "");
  const name = String(row?.fileName ?? row?.original_name ?? "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (mime.startsWith("image/") || /\.(jpe?g|png)$/.test(name)) return "IMG";
  if (mime.includes("word") || /\.docx?$/.test(name)) return "DOC";
  if (mime.startsWith("text/") || name.endsWith(".txt")) return "TXT";
  return "FILE";
}

export function fileSize(bytes: unknown) {
  const size = Number(bytes ?? 0);
  if (!size) return "";
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

/** Incident summaries store "Details:" and "Action taken:" lines (see IncidentsPage). */
export function splitIncidentSummary(summary?: string | null) {
  const lines = String(summary ?? "").split("\n");
  const title = lines[0] ?? "";
  const details = lines.find((line) => line.startsWith("Details: "))?.slice(9) ?? "";
  const actionTaken = lines.find((line) => line.startsWith("Action taken: "))?.slice(14) ?? "";
  const rest = lines.slice(1).filter((line) => !line.startsWith("Details: ") && !line.startsWith("Action taken: ")).join("\n");
  return { title, details: [details, rest].filter(Boolean).join("\n"), actionTaken };
}
