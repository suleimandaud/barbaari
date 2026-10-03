import type { DragEvent, FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { DownloadSimple, FileDoc, FileImage, FilePdf, FileText, FolderLock, UploadSimple } from "@phosphor-icons/react";
import { childrenApi, documentsApi, getApiError } from "@barbaari/shared";
import { Alert, EmptyState, ErrorState, Field, LoadingState, PageHeader, SearchInput, shortDate, useToast } from "@barbaari/shared/web/ui";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";
import { downloadDocument, fileKind, fileSize } from "../utils/documents";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt";
const kindIcon = { PDF: FilePdf, DOC: FileDoc, IMG: FileImage, TXT: FileText, FILE: FileText } as const;
const typeLabel = (value?: string | null) => value ? value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()) : "General";

export function DocumentsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [documents, children] = await Promise.all([documentsApi.list(), childrenApi.managerList()]);
    return { documents: documents.documents, children: children.children };
  }, []);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [childId, setChildId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!file) {
      setActionError("Please choose a file to upload.");
      return;
    }
    setSaving(true);
    try {
      await documentsApi.upload({ title, type: type || undefined, child_id: childId || undefined, file });
      toast("Document uploaded and saved.");
      setTitle("");
      setType("");
      setChildId("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function download(row: any) {
    setActionError("");
    try {
      await downloadDocument(row);
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace(/\.[^.]+$/, ""));
    }
  }

  const documents = (data?.documents ?? []) as any[];
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) counts.set(typeLabel(document.type), (counts.get(typeLabel(document.type)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [documents]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((document) => (typeFilter === "all" || typeLabel(document.type) === typeFilter)
      && (!q || `${document.title} ${document.childName ?? ""} ${document.fileName ?? ""}`.toLowerCase().includes(q)));
  }, [documents, typeFilter, query]);

  return (
    <main className="bb-page">
      <PageHeader kicker="Forms, health records and center files" title="Documents" actions={<div style={{ width: "min(300px, 100%)" }}><SearchInput value={query} onChange={setQuery} placeholder="Title, child or file name" /></div>} />
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      <div className="bb-docs">
        <nav aria-label="Document types" className="bb-doc-types">
          <p className="bb-overline" style={{ padding: "0 10px 10px" }}>Type</p>
          {[["all", documents.length] as const, ...types].map(([label, count]) => (
            <button key={label} className={typeFilter === label ? "on" : undefined} onClick={() => setTypeFilter(label)}><span>{label === "all" ? "All" : label}</span><span className="bb-num">{count}</span></button>
          ))}
        </nav>
        <section>
          {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : rows.length ? (
            <div className="bb-list">
              {rows.map((row) => {
                const Glyph = kindIcon[fileKind(row)];
                return (
                  <div className="bb-list-row" key={row.id}>
                    <Glyph size={28} color="var(--bb-accent)" aria-hidden />
                    <div className="grow">
                      <div className="bb-row" style={{ gap: 10 }}><strong>{row.title}</strong><span className="bb-tag">{typeLabel(row.type)}</span></div>
                      <span className="sub bb-truncate">{[row.childName ? `${row.childName}${row.childCode ? ` · ${row.childCode}` : ""}` : "Not attached to a child", row.fileName, fileKind(row), fileSize(row.size)].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className="bb-caption">{shortDate(row.created_at)}</span>
                    <button className="bb-btn bb-btn-secondary bb-btn-icon" aria-label={`Download ${row.title}`} onClick={() => download(row)}><DownloadSimple size={20} /></button>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState compact icon={FolderLock} title={documents.length ? "No documents match" : "No documents yet"}>{documents.length ? "Try another type or search." : "Uploaded forms and health records appear here. Files are private to your daycare."}</EmptyState>}
        </section>
        <aside className="bb-panel">
          <h3>Upload a document</h3>
          <form className="bb-stack" onSubmit={submit}>
            <label className={`bb-dropzone${dragging ? " over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <UploadSimple size={30} color="var(--bb-accent)" />
              <span>{file ? file.name : <>Drop a file or <u>browse</u></>}</span>
              <small>PDF, JPG, PNG, DOC, DOCX or TXT · up to 10 MB</small>
              <input ref={fileInputRef} type="file" accept={ACCEPT} className="bb-sr-only" onChange={(event) => { const picked = event.target.files?.[0] ?? null; setFile(picked); if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, "")); }} />
            </label>
            <Field label="Title"><input className="bb-input white" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Medication consent" required /></Field>
            <Field label="Type"><input className="bb-input white" value={type} onChange={(event) => setType(event.target.value)} placeholder="e.g. health, enrollment" /></Field>
            <ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} label="Attach to child (optional)" placeholder="No child" />
            <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving}>{saving ? "Uploading…" : "Upload document"}</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
