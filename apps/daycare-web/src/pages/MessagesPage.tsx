import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChatsCircle, NotePencil, PaperPlaneTilt } from "@phosphor-icons/react";
import { getApiError, messagesApi } from "@barbaari/shared";
import { Alert, Avatar, EmptyState, ErrorState, LoadingState, SearchInput, clockTime, shortDate, useToast } from "@barbaari/shared/web/ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { useShell } from "../hooks/useShell";
import { friendlyError } from "../utils/labels";

function when(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return clockTime(value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return shortDate(value, { weekday: "short" });
}

export function MessagesPage() {
  const { user } = useShell();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => (await messagesApi.conversations()).conversations ?? [], []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeNew, setComposeNew] = useState(false);
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");

  const conversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ((data ?? []) as any[])
      .map((conversation) => {
        const messages = [...(conversation.messages ?? [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
        return { ...conversation, messages, latest: messages[messages.length - 1] };
      })
      .sort((a, b) => String(b.latest?.created_at ?? b.updated_at).localeCompare(String(a.latest?.created_at ?? a.updated_at)))
      .filter((conversation) => !q || `${conversation.subject ?? ""} ${conversation.messages.map((message: any) => message.body).join(" ")}`.toLowerCase().includes(q));
  }, [data, query]);

  useEffect(() => {
    if (!activeId && !composeNew && conversations.length) setActiveId(String(conversations[0].id));
  }, [conversations, activeId, composeNew]);

  const active = composeNew ? null : conversations.find((conversation) => String(conversation.id) === activeId) ?? null;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setActionError("");
    try {
      const response = await messagesApi.send({ conversation_id: active?.id, body });
      setBody("");
      if (composeNew) {
        setComposeNew(false);
        setActiveId(response.message?.conversation_id ? String(response.message.conversation_id) : null);
        toast("New conversation started.");
      }
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bb-messages">
      <aside className="bb-thread-list" aria-label="Conversations">
        <div className="bb-row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 36 }}>Messages</h1>
          <button className="bb-btn bb-btn-primary bb-btn-icon" aria-label="New conversation" onClick={() => { setComposeNew(true); setActiveId(null); setBody(""); }}><NotePencil size={20} /></button>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search conversations" />
        {loading && !data ? <LoadingState rows={4} /> : error ? <ErrorState message={error} onRetry={reload} /> : conversations.length ? (
          <div className="bb-thread-items">
            {conversations.map((conversation) => (
              <button key={conversation.id} className={`bb-thread-item${String(conversation.id) === activeId && !composeNew ? " on" : ""}`} onClick={() => { setComposeNew(false); setActiveId(String(conversation.id)); }}>
                <Avatar name={conversation.subject ?? "Conversation"} seed={conversation.id} size={40} />
                <div>
                  <div className="bb-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "nowrap" }}><strong className="bb-truncate">{conversation.subject ?? `Conversation #${conversation.id}`}</strong><span className="bb-caption" style={{ flex: "none" }}>{when(conversation.latest?.created_at ?? conversation.updated_at)}</span></div>
                  <span className="bb-truncate">{conversation.latest?.body ?? "No messages yet"}</span>
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState compact icon={ChatsCircle} title={query ? "No conversations match" : "No conversations yet"}>{query ? "Try another search." : "Start one with the pencil button."}</EmptyState>}
      </aside>

      <section className="bb-thread" aria-label="Conversation">
        {composeNew || active ? (
          <>
            <header className="bb-thread-head">
              <div className="bb-person"><Avatar name={active?.subject ?? "New"} seed={active?.id ?? "new"} size={44} /><div><strong>{active?.subject ?? "New conversation"}</strong><span>{active ? `${active.messages.length} message${active.messages.length === 1 ? "" : "s"}` : "Your first message starts the conversation"}</span></div></div>
            </header>
            <div className="bb-thread-body">
              {active?.messages.length ? active.messages.map((message: any, index: number) => {
                const mine = user && String(message.sender_id) === String(user.id);
                const previous = active.messages[index - 1];
                const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return (
                  <div key={message.id}>
                    {newDay ? <p className="bb-thread-day">{new Date(message.created_at).toDateString() === new Date().toDateString() ? "Today" : shortDate(message.created_at, { weekday: "long", day: "numeric", month: "long" })}</p> : null}
                    <div className={`bb-bubble${mine ? " mine" : ""}`}><p>{message.body}</p></div>
                    <span className={`bb-bubble-time${mine ? " mine" : ""}`}>{clockTime(message.created_at)}</span>
                  </div>
                );
              }) : <p className="bb-muted" style={{ margin: "auto" }}>No messages yet.</p>}
            </div>
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
            <form className="bb-composer" onSubmit={send}>
              <textarea className="bb-input" rows={1} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" aria-label="Message" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={sending || !body.trim()}><PaperPlaneTilt />Send</button>
            </form>
          </>
        ) : <EmptyState icon={ChatsCircle} title="Choose a conversation">Select a conversation on the left, or start a new one.</EmptyState>}
      </section>
    </div>
  );
}
