/** Broker -> Lead Velocity message box (table broker_messages, migration 20261013220000). Pure helpers, no imports. */
export type MsgTopic = "question" | "note" | "change_request" | "problem";
export type MsgStatus = "sent" | "seen" | "answered";
export const MSG_TOPICS: { id: MsgTopic; label: string }[] = [
  { id: "question", label: "Question" }, { id: "note", label: "Note" },
  { id: "change_request", label: "Change request" }, { id: "problem", label: "Something's wrong" },
];
export const MSG_TOPIC_LABEL = Object.fromEntries(MSG_TOPICS.map((t) => [t.id, t.label])) as Record<MsgTopic, string>;
export const MSG_STATUS_LABEL: Record<MsgStatus, string> = { sent: "Sent", seen: "Seen", answered: "Answered" };
export interface BrokerMessage {
  id: string; broker_id: string; topic: MsgTopic; body: string; item_kind: "intro_card" | "ad" | null; item_id: string | null;
  status: MsgStatus; seen_at: string | null; reply: string | null; replied_at: string | null; created_at: string;
}
export const MSG_ITEM_LABEL = { intro_card: "Intro card", ad: "Ad" } as const;
