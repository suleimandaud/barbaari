import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { childrenApi, documentsApi, getApiError } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, friendlyError } from "../utils/labels";

export function DocumentsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [documents, children] = await Promise.all([documentsApi.list(), childrenApi.managerList()]);
    return { documents: documents.documents, children: children.children };
  }, []);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [childId, setChildId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      if (!file) {
        setActionError("Please choose a file to upload.");
        setSaving(false);
        return;
      }
      await documentsApi.upload({ title, type: type || undefined, child_id: childId || undefined, file });
      setSuccess("Document uploaded and saved.");
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
    setSuccess("");
    setActionError("");
    try {
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
      setSuccess("Document download started.");
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Files" title="Documents" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Upload document">
        <form className="form-grid" onSubmit={submit}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" required />
          <input value={type} onChange={(event) => setType(event.target.value)} placeholder="Type, e.g. health, enrollment" />
          <div className="full"><ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} placeholder="Attach to child (optional)" /></div>
          <label className="field-stack full"><span>File</span><input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
          <button className="primary" disabled={saving}>{saving ? "Uploading..." : "Upload document"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.documents ?? []} columns={[
          { header: "Title", render: (row: any) => row.title },
          { header: "Type", render: (row: any) => row.type ?? "General" },
          { header: "Child", render: (row: any) => row.childName ? <><strong>{row.childName}</strong><br /><small>ID: {row.childCode ?? "No child code"}</small></> : row.child?.name ? <><strong>{row.child.name}</strong><br /><small>ID: {childCode(row.child)}</small></> : "Not attached" },
          { header: "File", render: (row: any) => <><strong>{row.fileName ?? row.original_name ?? "Stored file"}</strong><br /><small>{row.mimeType ?? row.mime_type ?? "Unknown type"} · {row.size ? `${Math.round(Number(row.size) / 1024)} KB` : "Size unknown"}</small></> },
          { header: "Created", render: (row: any) => row.created_at ? new Date(row.created_at).toLocaleDateString() : "" },
          { header: "Actions", render: (row: any) => <button className="action-link" onClick={() => download(row)}>Download</button> }
        ]} />
      )}
    </section>
  );
}
