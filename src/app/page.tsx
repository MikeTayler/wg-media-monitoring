"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

const CRON_SECRET_SESSION_KEY = "wg-media-monitor-cron-secret";
const SOLO_TEST_SESSION_KEY = "wg-media-monitor-solo-test";

type StatusPayload = {
  ok: boolean;
  lastIngestionAt: string | null;
  articleCount: number | null;
  lastDigestAt: string | null;
  digestRecipientCount: number | null;
  digestEmailsSent: number | null;
  configuredRecipientCount: number | null;
  soloTestRecipientEmail: string | null;
  recentErrors: Array<{ at: string; source: string; message: string }>;
  error?: string;
};

type IngestPayload = {
  ok?: boolean;
  totalUnique?: number;
  bySource?: Record<string, number>;
  errors?: Record<string, string>;
  error?: string;
};

type DigestPayload = {
  ok?: boolean;
  dryRun?: boolean;
  soloTest?: boolean;
  previewHtml?: string;
  previewRecipient?: string;
  stats?: {
    articlesProcessed: number;
    keywordMatchPairs: number;
    digestEntriesAfterScoring: number;
    emailsSent: number;
    recipientsTargeted: number;
  };
  error?: string;
};

type KeywordEntityRow = {
  id: string;
  name: string;
  aliases: string[];
  keywords: string[];
  hasKeywordOverride: boolean;
};

type KeywordsGetPayload = {
  ok: boolean;
  entities?: KeywordEntityRow[];
  error?: string;
};

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 22,
        height: 22,
        border: "3px solid #e5e7eb",
        borderTopColor: "#2563eb",
        borderRadius: "50%",
        animation: "wgm-spin 0.75s linear infinite",
        verticalAlign: "middle",
        marginRight: 8,
      }}
    />
  );
}

export default function AdminDashboardPage() {
  const [cronSecret, setCronSecret] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestPayload | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewRecipient, setPreviewRecipient] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<DigestPayload | null>(null);

  const [soloTestOnly, setSoloTestOnly] = useState(false);

  const [kwEntities, setKwEntities] = useState<KeywordEntityRow[] | null>(null);
  const [kwDraft, setKwDraft] = useState<Record<string, string[]>>({});
  const [kwNewInput, setKwNewInput] = useState<Record<string, string>>({});
  const [kwExpanded, setKwExpanded] = useState<Record<string, boolean>>({});
  const [kwLoading, setKwLoading] = useState(false);
  const [kwError, setKwError] = useState<string | null>(null);
  const [kwSavingId, setKwSavingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CRON_SECRET_SESSION_KEY);
      if (saved) setCronSecret(saved);
      const solo = sessionStorage.getItem(SOLO_TEST_SESSION_KEY);
      if (solo === "1") setSoloTestOnly(true);
    } catch {
      /* sessionStorage unavailable */
    }
  }, []);

  const persistSecret = useCallback((value: string) => {
    setCronSecret(value);
    try {
      sessionStorage.setItem(CRON_SECRET_SESSION_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSoloTest = useCallback((checked: boolean) => {
    setSoloTestOnly(checked);
    try {
      if (checked) sessionStorage.setItem(SOLO_TEST_SESSION_KEY, "1");
      else sessionStorage.removeItem(SOLO_TEST_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = (await res.json()) as StatusPayload;
      setStatus(data);
      if (!res.ok) {
        setStatusError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const loadKeywords = useCallback(async () => {
    if (!cronSecret.trim()) {
      setKwError("Enter CRON_SECRET first.");
      return;
    }
    setKwLoading(true);
    setKwError(null);
    try {
      const q = new URLSearchParams({ secret: cronSecret.trim() });
      const res = await fetch(`/api/keywords?${q}`, { cache: "no-store" });
      const data = (await res.json()) as KeywordsGetPayload;
      if (!res.ok || !data.ok || !data.entities) {
        setKwError(data.error ?? `HTTP ${res.status}`);
        setKwEntities(null);
        return;
      }
      setKwEntities(data.entities);
      setKwDraft(
        Object.fromEntries(data.entities.map((e) => [e.id, [...e.keywords]]))
      );
    } catch (e) {
      setKwError(e instanceof Error ? e.message : String(e));
      setKwEntities(null);
    } finally {
      setKwLoading(false);
    }
  }, [cronSecret]);

  const saveEntityKeywords = async (entityId: string) => {
    if (!cronSecret.trim()) {
      setKwError("Enter CRON_SECRET first.");
      return;
    }
    const keywords = kwDraft[entityId];
    if (!keywords) return;
    setKwSavingId(entityId);
    setKwError(null);
    try {
      const q = new URLSearchParams({ secret: cronSecret.trim() });
      const res = await fetch(`/api/keywords?${q}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, keywords }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setKwError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await loadKeywords();
    } catch (e) {
      setKwError(e instanceof Error ? e.message : String(e));
    } finally {
      setKwSavingId(null);
    }
  };

  const runIngest = async () => {
    if (!cronSecret.trim()) {
      setIngestResult({ error: "Enter CRON_SECRET first." });
      return;
    }
    setIngestLoading(true);
    setIngestResult(null);
    try {
      const q = new URLSearchParams({ secret: cronSecret.trim() });
      const res = await fetch(`/api/ingest?${q}`, { method: "GET" });
      const data = (await res.json()) as IngestPayload;
      setIngestResult(data);
      await loadStatus();
    } catch (e) {
      setIngestResult({
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIngestLoading(false);
    }
  };

  const previewDigest = async () => {
    if (!cronSecret.trim()) {
      setPreviewError("Enter CRON_SECRET first.");
      setPreviewHtml(null);
      setPreviewRecipient(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewHtml(null);
    setPreviewRecipient(null);
    try {
      const q = new URLSearchParams({
        secret: cronSecret.trim(),
        dry_run: "true",
      });
      if (soloTestOnly) q.set("solo_test", "true");
      const res = await fetch(`/api/digest?${q}`, { method: "GET" });
      const data = (await res.json()) as DigestPayload;
      if (!res.ok || !data.ok) {
        setPreviewError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setPreviewHtml(data.previewHtml ?? null);
      setPreviewRecipient(data.previewRecipient ?? null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendDigest = async () => {
    if (!cronSecret.trim()) {
      setSendResult({ error: "Enter CRON_SECRET first." });
      return;
    }
    const soloEmail = status?.soloTestRecipientEmail;
    const n = status?.configuredRecipientCount ?? 0;
    const ok = soloTestOnly
      ? window.confirm(
          `Send test digest only to ${soloEmail ?? "the solo-test address"}?`
        )
      : window.confirm(
          `Send digest to ${n} recipient${n === 1 ? "" : "s"}?`
        );
    if (!ok) return;

    setSendLoading(true);
    setSendResult(null);
    try {
      const q = new URLSearchParams({ secret: cronSecret.trim() });
      if (soloTestOnly) q.set("solo_test", "true");
      const res = await fetch(`/api/digest?${q}`, { method: "GET" });
      const data = (await res.json()) as DigestPayload;
      setSendResult(data);
      await loadStatus();
    } catch (e) {
      setSendResult({
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSendLoading(false);
    }
  };

  const panelStyle: CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "1rem 1.25rem",
    background: "#fff",
    marginBottom: "1.25rem",
  };

  return (
    <main
      style={{
        maxWidth: "52rem",
        margin: "0 auto",
        padding: "1.5rem 1rem 3rem",
      }}
    >
      <h1
        style={{
          fontSize: "1.35rem",
          fontWeight: 600,
          margin: "0 0 0.35rem 0",
        }}
      >
        Wise Group Media Monitor
      </h1>
      <p style={{ color: "var(--muted)", margin: "0 0 1.25rem", fontSize: 14 }}>
        Internal admin — PoC. Enter the cron secret once per browser tab; it is
        kept in <strong>sessionStorage</strong> only.
      </p>

      <section style={panelStyle}>
        <label
          htmlFor="cron-secret"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}
        >
          CRON_SECRET
        </label>
        <input
          id="cron-secret"
          type="password"
          autoComplete="off"
          value={cronSecret}
          onChange={(e) => persistSecret(e.target.value)}
          placeholder="Paste secret for ingest / digest actions"
          style={{
            width: "100%",
            maxWidth: "28rem",
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        />
      </section>

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Status</h2>
        {statusLoading ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p>
        ) : statusError ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>{statusError}</p>
        ) : status?.ok === false ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>{status.error}</p>
        ) : (
          <dl
            style={{
              display: "grid",
              gap: "0.65rem",
              margin: 0,
              fontSize: 14,
            }}
          >
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Last ingestion
              </dt>
              <dd style={{ margin: "4px 0 0", fontFamily: "ui-monospace, monospace" }}>
                {status?.lastIngestionAt ?? "—"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Article count (last ingest)
              </dt>
              <dd style={{ margin: "4px 0 0" }}>{status?.articleCount ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Last digest
              </dt>
              <dd style={{ margin: "4px 0 0", fontFamily: "ui-monospace, monospace" }}>
                {status?.lastDigestAt ?? "—"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Emails sent (last digest)
              </dt>
              <dd style={{ margin: "4px 0 0" }}>
                {status?.digestEmailsSent ?? "—"}
                {status?.digestRecipientCount != null && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}
                    / {status.digestRecipientCount} targeted
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Configured recipients (current)
              </dt>
              <dd style={{ margin: "4px 0 0" }}>
                {status?.configuredRecipientCount ?? "—"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Recent errors (24h)
              </dt>
              <dd style={{ margin: "6px 0 0" }}>
                {status?.recentErrors && status.recentErrors.length > 0 ? (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem",
                      fontSize: 13,
                      color: "#374151",
                    }}
                  >
                    {status.recentErrors.map((err, i) => (
                      <li key={`${err.at}-${i}`} style={{ marginBottom: 6 }}>
                        <span style={{ color: "var(--muted)" }}>{err.at}</span>{" "}
                        <strong>{err.source}</strong>: {err.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: "var(--muted)" }}>None</span>
                )}
              </dd>
            </div>
          </dl>
        )}
        <button
          type="button"
          onClick={() => loadStatus()}
          style={{
            marginTop: 12,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "#f9fafb",
          }}
        >
          Refresh status
        </button>
      </section>

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Keywords</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 10px", maxWidth: "40rem" }}>
          Edit entity keywords for testing without redeploying. Overrides live in{" "}
          <code style={{ fontSize: 12 }}>/tmp/keyword-overrides.json</code> and are lost on server
          cold start — fine for PoC.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => loadKeywords()}
            disabled={kwLoading}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              cursor: kwLoading ? "wait" : "pointer",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "#f9fafb",
            }}
          >
            {kwLoading && <Spinner />}
            {kwEntities ? "Refresh" : "Load keyword config"}
          </button>
        </div>
        {kwError && (
          <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 8px" }}>{kwError}</p>
        )}
        {kwEntities &&
          kwEntities.map((ent) => {
            const open = kwExpanded[ent.id] ?? false;
            const draft = kwDraft[ent.id] ?? ent.keywords;
            const newVal = kwNewInput[ent.id] ?? "";
            return (
              <div
                key={ent.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  marginBottom: 8,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setKwExpanded((prev) => ({
                      ...prev,
                      [ent.id]: !open,
                    }))
                  }
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    background: open ? "#f3f4f6" : "#fafafa",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>
                    {open ? "▼" : "▶"} {ent.name}{" "}
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 12,
                        color: ent.hasKeywordOverride ? "#b45309" : "var(--muted)",
                      }}
                    >
                      {ent.hasKeywordOverride ? "(override)" : "(base)"}
                    </span>
                  </span>
                </button>
                {open && (
                  <div style={{ padding: "12px", background: "#fff" }}>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
                      Aliases: {ent.aliases.join(", ")}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {draft.map((kw, idx) => (
                        <button
                          key={`${ent.id}-${idx}-${kw}`}
                          type="button"
                          title="Click to remove"
                          onClick={() =>
                            setKwDraft((prev) => ({
                              ...prev,
                              [ent.id]: (prev[ent.id] ?? []).filter((_, i) => i !== idx),
                            }))
                          }
                          style={{
                            fontSize: 13,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                            cursor: "pointer",
                          }}
                        >
                          {kw} ×
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <input
                        type="text"
                        value={newVal}
                        placeholder="Add keyword…"
                        onChange={(e) =>
                          setKwNewInput((prev) => ({
                            ...prev,
                            [ent.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = newVal.trim();
                            if (!t) return;
                            setKwDraft((prev) => {
                              const cur = prev[ent.id] ?? [];
                              if (cur.includes(t)) return prev;
                              return { ...prev, [ent.id]: [...cur, t] };
                            });
                            setKwNewInput((prev) => ({ ...prev, [ent.id]: "" }));
                          }
                        }}
                        style={{
                          padding: "6px 10px",
                          fontSize: 14,
                          minWidth: "12rem",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const t = newVal.trim();
                          if (!t) return;
                          setKwDraft((prev) => {
                            const cur = prev[ent.id] ?? [];
                            if (cur.includes(t)) return prev;
                            return { ...prev, [ent.id]: [...cur, t] };
                          });
                          setKwNewInput((prev) => ({ ...prev, [ent.id]: "" }));
                        }}
                        style={{
                          padding: "6px 12px",
                          fontSize: 13,
                          cursor: "pointer",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "#fff",
                        }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEntityKeywords(ent.id)}
                        disabled={kwSavingId === ent.id}
                        style={{
                          padding: "6px 14px",
                          fontSize: 13,
                          cursor: kwSavingId === ent.id ? "wait" : "pointer",
                          borderRadius: 6,
                          border: "1px solid #2563eb",
                          background: "#2563eb",
                          color: "#fff",
                        }}
                      >
                        {kwSavingId === ent.id && <Spinner />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </section>

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Ingest</h2>
        <button
          type="button"
          onClick={runIngest}
          disabled={ingestLoading}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            cursor: ingestLoading ? "wait" : "pointer",
            borderRadius: 6,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#fff",
          }}
        >
          {ingestLoading && <Spinner />}
          Run ingestion
        </button>
        {ingestResult && (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f9fafb",
              borderRadius: 6,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 280,
              border: "1px solid var(--border)",
            }}
          >
            {JSON.stringify(ingestResult, null, 2)}
          </pre>
        )}
      </section>

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Digest</h2>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 14,
            fontSize: 14,
            cursor: "pointer",
            maxWidth: "36rem",
          }}
        >
          <input
            type="checkbox"
            checked={soloTestOnly}
            onChange={(e) => persistSoloTest(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            Send digest only to me (testing)
            {status?.soloTestRecipientEmail ? (
              <>
                :{" "}
                <span
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                >
                  {status.soloTestRecipientEmail}
                </span>
              </>
            ) : null}
            <span style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              Uses the full digest (all entity sections). Uncheck to send to all configured
              recipients.
            </span>
          </span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={previewDigest}
            disabled={previewLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              cursor: previewLoading ? "wait" : "pointer",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            {previewLoading && <Spinner />}
            Preview digest
          </button>
          <button
            type="button"
            onClick={sendDigest}
            disabled={sendLoading}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              cursor: sendLoading ? "wait" : "pointer",
              borderRadius: 6,
              border: "1px solid #b45309",
              background: "#fff7ed",
              color: "#9a3412",
            }}
          >
            {sendLoading && <Spinner />}
            Send digest
          </button>
        </div>
        {previewRecipient && (
          <p style={{ fontSize: 13, margin: "0 0 8px", color: "var(--muted)" }}>
            Preview recipient:{" "}
            <span style={{ fontFamily: "ui-monospace, monospace", color: "#111" }}>
              {previewRecipient}
            </span>
          </p>
        )}
        {previewError && (
          <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 8px" }}>{previewError}</p>
        )}
        {previewHtml && (
          <iframe
            title="Digest preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            style={{
              width: "100%",
              minHeight: 420,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "#fff",
            }}
          />
        )}
        {sendResult && (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f9fafb",
              borderRadius: 6,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 220,
              border: "1px solid var(--border)",
            }}
          >
            {JSON.stringify(sendResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
