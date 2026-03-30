/**
 * TODO: Simple status dashboard for the PoC.
 * - Display last successful RSS ingestion time (read from persisted JSON or in-memory store once implemented).
 * - Optionally surface last digest send time and link to health if `/api/status` is added later.
 * - Keep layout minimal — this is operator-facing, not a full admin UI.
 */

export default function HomePage() {
  // TODO: Replace with real last-run timestamps from storage once ingestion/digest pipelines exist.
  const lastIngestAt: string | null = null;
  const lastDigestAt: string | null = null;

  return (
    <main
      style={{
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "2rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Wise Group Media Monitor
      </h1>
      <p style={{ color: "var(--muted)", margin: "0 0 1.5rem" }}>
        PoC status — ingestion and digest schedules run via secured API routes.
      </p>
      <dl
        style={{
          display: "grid",
          gap: "0.75rem",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          background: "#fff",
        }}
      >
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase" }}>
            Last ingestion
          </dt>
          <dd style={{ margin: "0.25rem 0 0", fontFamily: "ui-monospace, monospace" }}>
            {lastIngestAt ?? "—"}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase" }}>
            Last digest
          </dt>
          <dd style={{ margin: "0.25rem 0 0", fontFamily: "ui-monospace, monospace" }}>
            {lastDigestAt ?? "—"}
          </dd>
        </div>
      </dl>
    </main>
  );
}
