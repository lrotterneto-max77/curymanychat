export function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "pine" | "rust" | "amber" }) {
  const toneClass = tone === "pine" ? "text-pine" : tone === "rust" ? "text-rust" : tone === "amber" ? "text-amber" : "text-ink";

  return (
    <div className="rounded border border-border bg-white px-5 py-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`font-serif text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  NOVO: "bg-border text-ink",
  PENDING: "bg-border text-ink",
  QUEUED: "bg-border text-ink",
  SENT: "bg-amber/15 text-amber",
  DELIVERED: "bg-amber/15 text-amber",
  READ: "bg-pine/15 text-pine",
  REPLIED: "bg-pine/15 text-pine",
  QUALIFICADO: "bg-pine/15 text-pine",
  VENDA: "bg-pine/15 text-pine",
  FAILED: "bg-rust/15 text-rust",
  SKIPPED: "bg-rust/15 text-rust",
  PERDIDO: "bg-rust/15 text-rust",
  SEM_INTERESSE: "bg-rust/15 text-rust",
  APPROVED: "bg-pine/15 text-pine",
  PAUSED: "bg-rust/15 text-rust",
  REJECTED: "bg-rust/15 text-rust",
  DRAFT: "bg-border text-ink",
  RUNNING: "bg-amber/15 text-amber",
  DONE: "bg-pine/15 text-pine",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || "bg-border text-ink";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
