import { messagesApi } from "@barbaari/shared";
import { ResourcePage } from "./ResourcePage";

export function MessagesPage() {
  return <ResourcePage eyebrow="Communication" title="Messages" loader={async () => (await messagesApi.conversations()).conversations} columns={[
    { header: "Conversation", render: (row: any) => row.subject ?? `#${row.id}` },
    { header: "Messages", render: (row: any) => row.messages?.length ?? 0 },
    { header: "Latest", render: (row: any) => row.messages?.at?.(-1)?.body ?? "No messages" },
    { header: "Updated", render: (row: any) => new Date(row.updated_at).toLocaleString() }
  ]} form={{
    submitLabel: "Send message",
    fields: [{ name: "conversation_id", label: "Conversation ID optional" }, { name: "body", label: "Message" }],
    onSubmit: (values) => messagesApi.send({ conversation_id: values.conversation_id || undefined, body: values.body }).then(() => undefined)
  }} />;
}
