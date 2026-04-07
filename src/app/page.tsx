"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

const CRON_SECRET_SESSION_KEY = "wg-media-monitor-cron-secret";

/* ------------------------------------------------------------------ */
/*  Type definitions for API payloads                                  */
/* ------------------------------------------------------------------ */

type StatusPayload = {
  ok: boolean;
  lastIngestionAt: string | null;
  articleCount: number | null;
  lastDigestAt: string | null;
  digestRecipientCount: number | null;
  digestEmailsSent: number | null;
  configuredRecipientCount: number | null;
  adminRecipientCount: number | null;
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
  adminOnly?: boolean;
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

type SettingsMap = Record<string, string>;

type DbKeyword = { id: number; keyword: string };
type DbRecipient = { id: number; email: string; enabled: boolean };
type DbEntity = {
  id: number;
  name: string;
  enabled: boolean;
  keywords: DbKeyword[];
  recipients: DbRecipient[];
};

/* ------------------------------------------------------------------ */
/*  Shared UI helpers                                                  */
/* ------------------------------------------------------------------ */

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2.5px solid #e5e7eb",
        borderTopColor: "#2563eb",
        borderRadius: "50%",
        animation: "wgm-spin 0.75s linear infinite",
        verticalAlign: "middle",
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  background: "#fff",
  marginBottom: "1.25rem",
};

const btnSecondary: CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "#f9fafb",
};

const btnPrimary: CSSProperties = {
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
  borderRadius: 6,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
};

const btnDanger: CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 5,
  border: "1px solid #fca5a5",
  background: "#fef2f2",
  color: "#b91c1c",
};

const inputStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--border)",
  borderRadius: 6,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 13,
  padding: "3px 8px 3px 10px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
};

const sectionHeaderBtn: CSSProperties = {
  width: "100%",
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ADMIN_KEY = "__admin__";

function authParams(secret: string) {
  return new URLSearchParams({ secret: secret.trim() });
}

/* ------------------------------------------------------------------ */
/*  Recipient row component (shared between admin and entity groups)   */
/* ------------------------------------------------------------------ */

function RecipientRow({
  rc,
  onToggle,
  onDelete,
}: {
  rc: DbRecipient;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        padding: "4px 0",
        opacity: rc.enabled ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={rc.enabled}
        title={rc.enabled ? "Disable" : "Enable"}
        onClick={() => onToggle(rc.id, !rc.enabled)}
        style={{
          width: 34,
          height: 18,
          borderRadius: 9,
          border: "none",
          background: rc.enabled ? "#22c55e" : "#d1d5db",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1.5,
            left: rc.enabled ? 17 : 1.5,
            width: 15,
            height: 15,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }}
        />
      </button>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {rc.email}
      </span>
      <button type="button" onClick={() => onDelete(rc.id)} style={btnDanger}>
        Delete
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminDashboardPage() {
  /* --- Auth --- */
  const [cronSecret, setCronSecret] = useState("");

  /* --- Status --- */
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  /* --- Ingest --- */
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestPayload | null>(null);

  /* --- Digest --- */
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewRecipient, setPreviewRecipient] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<DigestPayload | null>(null);

  /* --- Cron settings --- */
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState<string | null>(null);
  const [cronEnabled, setCronEnabled] = useState(false);
  const [ingestTime, setIngestTime] = useState("05:45");
  const [digestTime, setDigestTime] = useState("06:30");
  const [cronTimezone, setCronTimezone] = useState("Pacific/Auckland");

  /* --- Entities (keywords + recipients) --- */
  const [entities, setEntities] = useState<DbEntity[] | null>(null);
  const [adminRecipients, setAdminRecipients] = useState<DbRecipient[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [kwExpanded, setKwExpanded] = useState<Record<number, boolean>>({});
  const [kwNewInput, setKwNewInput] = useState<Record<number, string>>({});
  const [kwBusy, setKwBusy] = useState<number | null>(null);
  const [rcExpanded, setRcExpanded] = useState<Record<string, boolean>>({});
  const [rcNewInput, setRcNewInput] = useState<Record<string, string>>({});
  const [rcBusy, setRcBusy] = useState<string | null>(null);
  const [rcEmailError, setRcEmailError] = useState<Record<string, string>>({});

  /* ---------------------------------------------------------------- */
  /*  Initialise from sessionStorage                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CRON_SECRET_SESSION_KEY);
      if (saved) setCronSecret(saved);
    } catch {
      /* unavailable */
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

  /* ---------------------------------------------------------------- */
  /*  Status                                                           */
  /* ---------------------------------------------------------------- */

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = (await res.json()) as StatusPayload;
      setStatus(data);
      if (!res.ok) setStatusError(data.error ?? `HTTP ${res.status}`);
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

  /* ---------------------------------------------------------------- */
  /*  Settings (cron control)                                          */
  /* ---------------------------------------------------------------- */

  const loadSettings = useCallback(async () => {
    if (!cronSecret.trim()) return;
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/settings?${authParams(cronSecret)}`, { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; settings?: SettingsMap; error?: string };
      if (!res.ok || !data.ok) {
        setSettingsError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const s = data.settings!;
      setSettings(s);
      setCronEnabled(s.cron_enabled === "true");
      setIngestTime(s.cron_ingest_time ?? "05:45");
      setDigestTime(s.cron_digest_time ?? "06:30");
      setCronTimezone(s.cron_timezone ?? "Pacific/Auckland");
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsLoading(false);
    }
  }, [cronSecret]);

  const saveSetting = async (key: string, value: string) => {
    if (!cronSecret.trim()) return;
    setSettingsSaving(key);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/settings?${authParams(cronSecret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSettingsError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsSaving(null);
    }
  };

  const toggleCronEnabled = async () => {
    const next = !cronEnabled;
    setCronEnabled(next);
    await saveSetting("cron_enabled", next ? "true" : "false");
  };

  /* ---------------------------------------------------------------- */
  /*  Entities (keywords + recipients)                                 */
  /* ---------------------------------------------------------------- */

  const loadEntities = useCallback(async () => {
    if (!cronSecret.trim()) return;
    setEntitiesLoading(true);
    setEntitiesError(null);
    try {
      const res = await fetch(`/api/entities?${authParams(cronSecret)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        entities?: DbEntity[];
        adminRecipients?: DbRecipient[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setEntitiesError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setEntities(data.entities!);
      setAdminRecipients(data.adminRecipients ?? []);
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntitiesLoading(false);
    }
  }, [cronSecret]);

  /* --- Keyword actions --- */

  const addKeyword = async (entityId: number) => {
    const kw = (kwNewInput[entityId] ?? "").trim();
    if (!kw || !cronSecret.trim()) return;
    setKwBusy(entityId);
    try {
      const res = await fetch(`/api/keywords?${authParams(cronSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, keyword: kw }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEntitiesError(data.error ?? `HTTP ${res.status}`);
      } else {
        setKwNewInput((p) => ({ ...p, [entityId]: "" }));
        await loadEntities();
      }
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    } finally {
      setKwBusy(null);
    }
  };

  const deleteKeyword = async (kwId: number) => {
    if (!cronSecret.trim()) return;
    try {
      const res = await fetch(`/api/keywords/${kwId}?${authParams(cronSecret)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntitiesError(data.error ?? `HTTP ${res.status}`);
      await loadEntities();
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    }
  };

  /* --- Recipient actions (works for both admin and entity) --- */

  const addRecipient = async (groupKey: string) => {
    const email = (rcNewInput[groupKey] ?? "").trim();
    if (!email || !cronSecret.trim()) return;
    if (!EMAIL_RE.test(email)) {
      setRcEmailError((p) => ({ ...p, [groupKey]: "Invalid email format" }));
      return;
    }
    setRcEmailError((p) => ({ ...p, [groupKey]: "" }));
    setRcBusy(groupKey);
    const entityId = groupKey === ADMIN_KEY ? null : Number(groupKey);
    try {
      const res = await fetch(`/api/recipients?${authParams(cronSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEntitiesError(data.error ?? `HTTP ${res.status}`);
      } else {
        setRcNewInput((p) => ({ ...p, [groupKey]: "" }));
        await loadEntities();
      }
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    } finally {
      setRcBusy(null);
    }
  };

  const toggleRecipient = async (rcId: number, enabled: boolean) => {
    if (!cronSecret.trim()) return;
    try {
      const res = await fetch(`/api/recipients/${rcId}?${authParams(cronSecret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntitiesError(data.error ?? `HTTP ${res.status}`);
      await loadEntities();
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteRecipient = async (rcId: number) => {
    if (!cronSecret.trim()) return;
    if (!window.confirm("Delete this recipient?")) return;
    try {
      const res = await fetch(`/api/recipients/${rcId}?${authParams(cronSecret)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntitiesError(data.error ?? `HTTP ${res.status}`);
      await loadEntities();
    } catch (e) {
      setEntitiesError(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Ingest                                                           */
  /* ---------------------------------------------------------------- */

  const runIngest = async () => {
    if (!cronSecret.trim()) {
      setIngestResult({ error: "Enter CRON_SECRET first." });
      return;
    }
    setIngestLoading(true);
    setIngestResult(null);
    try {
      const res = await fetch(`/api/ingest?${authParams(cronSecret)}`, { method: "GET" });
      const data = (await res.json()) as IngestPayload;
      setIngestResult(data);
      await loadStatus();
    } catch (e) {
      setIngestResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setIngestLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Digest (admin only — dashboard is a testing tool)                */
  /* ---------------------------------------------------------------- */

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
      const q = authParams(cronSecret);
      q.set("dry_run", "true");
      q.set("admin_only", "true");
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
    const n = adminRecipients.filter((r) => r.enabled).length;
    if (n === 0) {
      setSendResult({ error: "No enabled admin recipients. Add one in the Recipients section." });
      return;
    }
    const ok = window.confirm(
      `Send aggregated admin digest to ${n} admin recipient${n === 1 ? "" : "s"}?`
    );
    if (!ok) return;

    setSendLoading(true);
    setSendResult(null);
    try {
      const q = authParams(cronSecret);
      q.set("admin_only", "true");
      const res = await fetch(`/api/digest?${q}`, { method: "GET" });
      const data = (await res.json()) as DigestPayload;
      setSendResult(data);
      await loadStatus();
    } catch (e) {
      setSendResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSendLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Recipient group renderer                                         */
  /* ---------------------------------------------------------------- */

  function renderRecipientGroup(
    groupKey: string,
    label: string,
    recipients: DbRecipient[],
    subtitle?: string,
    highlight?: boolean
  ) {
    const open = rcExpanded[groupKey] ?? false;
    const newVal = rcNewInput[groupKey] ?? "";
    const busy = rcBusy === groupKey;
    const emailErr = rcEmailError[groupKey];
    const enabledCount = recipients.filter((r) => r.enabled).length;

    return (
      <div
        key={groupKey}
        style={{
          border: highlight ? "1.5px solid #a78bfa" : "1px solid var(--border)",
          borderRadius: 6,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setRcExpanded((p) => ({ ...p, [groupKey]: !open }))}
          style={{
            ...sectionHeaderBtn,
            background: highlight
              ? open ? "#ede9fe" : "#f5f3ff"
              : open ? "#f3f4f6" : "#fafafa",
          }}
        >
          <span>
            {open ? "▼" : "▶"} {label}
            {subtitle && (
              <span style={{ fontWeight: 400, fontSize: 11, color: "#7c3aed", marginLeft: 6 }}>
                {subtitle}
              </span>
            )}
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>
              {enabledCount}/{recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
            </span>
          </span>
        </button>
        {open && (
          <div style={{ padding: 12, background: "#fff" }}>
            {recipients.length === 0 && (
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
                No recipients configured.
              </p>
            )}
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {recipients.map((rc) => (
                <RecipientRow
                  key={rc.id}
                  rc={rc}
                  onToggle={toggleRecipient}
                  onDelete={deleteRecipient}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="email"
                value={newVal}
                placeholder="email@example.com"
                onChange={(e) => {
                  setRcNewInput((p) => ({ ...p, [groupKey]: e.target.value }));
                  if (rcEmailError[groupKey]) setRcEmailError((p) => ({ ...p, [groupKey]: "" }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient(groupKey);
                  }
                }}
                style={{ ...inputStyle, minWidth: "14rem" }}
              />
              <button
                type="button"
                disabled={busy || !newVal.trim()}
                onClick={() => addRecipient(groupKey)}
                style={{
                  ...btnPrimary,
                  opacity: newVal.trim() ? 1 : 0.5,
                  cursor: newVal.trim() && !busy ? "pointer" : "not-allowed",
                }}
              >
                {busy && <Spinner size={14} />}
                Add
              </button>
            </div>
            {emailErr && (
              <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{emailErr}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 600, margin: "0 0 0.35rem 0" }}>
        Wise Group Media Monitor
      </h1>
      <p style={{ color: "var(--muted)", margin: "0 0 1.25rem", fontSize: 14 }}>
        Internal admin — PoC. Enter the cron secret once per browser tab; it is kept in{" "}
        <strong>sessionStorage</strong> only.
      </p>

      {/* ============================================================ */}
      {/*  CRON SECRET                                                  */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <label
          htmlFor="cron-secret"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}
        >
          CRON_SECRET
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            id="cron-secret"
            type="password"
            autoComplete="off"
            value={cronSecret}
            onChange={(e) => persistSecret(e.target.value)}
            placeholder="Paste secret for all admin actions"
            style={{ ...inputStyle, width: "100%", maxWidth: "28rem", fontSize: 14, padding: "8px 10px" }}
          />
          <button
            type="button"
            disabled={!cronSecret.trim() || settingsLoading || entitiesLoading}
            onClick={() => {
              loadSettings();
              loadEntities();
            }}
            style={{
              ...btnPrimary,
              opacity: cronSecret.trim() ? 1 : 0.5,
              cursor: cronSecret.trim() ? "pointer" : "not-allowed",
            }}
          >
            {(settingsLoading || entitiesLoading) && <Spinner />}
            Load config
          </button>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATUS                                                       */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Status</h2>
        {statusLoading ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p>
        ) : statusError ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>{statusError}</p>
        ) : status?.ok === false ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>{status.error}</p>
        ) : (
          <dl style={{ display: "grid", gap: "0.65rem", margin: 0, fontSize: 14 }}>
            {[
              ["Last ingestion", status?.lastIngestionAt, true],
              ["Article count (last ingest)", status?.articleCount],
              ["Last digest", status?.lastDigestAt, true],
            ].map(([label, val, mono]) => (
              <div key={label as string}>
                <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{label as string}</dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    ...(mono ? { fontFamily: "ui-monospace, monospace" } : {}),
                  }}
                >
                  {(val as string | number) ?? "—"}
                </dd>
              </div>
            ))}
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Emails sent (last digest)
              </dt>
              <dd style={{ margin: "4px 0 0" }}>
                {status?.digestEmailsSent ?? "—"}
                {status?.digestRecipientCount != null && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}/ {status.digestRecipientCount} targeted
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Recipients
              </dt>
              <dd style={{ margin: "4px 0 0" }}>
                {status?.configuredRecipientCount ?? "—"} entity
                {(status?.configuredRecipientCount ?? 0) !== 1 ? "s" : ""}
                {", "}
                {status?.adminRecipientCount ?? "—"} admin
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Recent errors (24h)</dt>
              <dd style={{ margin: "6px 0 0" }}>
                {status?.recentErrors && status.recentErrors.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: 13, color: "#374151" }}>
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
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => loadStatus()} style={btnSecondary}>
            Refresh status
          </button>
          {cronSecret.trim() ? (
            <a
              href={`/api/articles?secret=${encodeURIComponent(cronSecret.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnSecondary, textDecoration: "none", color: "#111827" }}
            >
              View raw articles
            </a>
          ) : null}
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CRON CONTROL                                                 */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Cron Control</h2>

        {!settings && !settingsLoading && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Click &ldquo;Load config&rdquo; above to view cron settings.
          </p>
        )}

        {settingsLoading && (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            <Spinner /> Loading settings…
          </p>
        )}

        {settingsError && (
          <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{settingsError}</p>
        )}

        {settings && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button
                type="button"
                role="switch"
                aria-checked={cronEnabled}
                onClick={toggleCronEnabled}
                disabled={settingsSaving === "cron_enabled"}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  border: "none",
                  background: cronEnabled ? "#22c55e" : "#d1d5db",
                  position: "relative",
                  cursor: settingsSaving === "cron_enabled" ? "wait" : "pointer",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: cronEnabled ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                  }}
                />
              </button>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Cron jobs {cronEnabled ? "enabled" : "disabled"}
              </span>
              {settingsSaving === "cron_enabled" && <Spinner size={16} />}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: "24rem", marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                  Ingest time
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="time"
                    value={ingestTime}
                    onChange={(e) => setIngestTime(e.target.value)}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <button
                    type="button"
                    disabled={settingsSaving === "cron_ingest_time"}
                    onClick={() => saveSetting("cron_ingest_time", ingestTime)}
                    style={{ ...btnSecondary, whiteSpace: "nowrap", fontSize: 12, padding: "5px 8px" }}
                  >
                    {settingsSaving === "cron_ingest_time" ? <Spinner size={14} /> : "Save"}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                  Digest time
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="time"
                    value={digestTime}
                    onChange={(e) => setDigestTime(e.target.value)}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <button
                    type="button"
                    disabled={settingsSaving === "cron_digest_time"}
                    onClick={() => saveSetting("cron_digest_time", digestTime)}
                    style={{ ...btnSecondary, whiteSpace: "nowrap", fontSize: 12, padding: "5px 8px" }}
                  >
                    {settingsSaving === "cron_digest_time" ? <Spinner size={14} /> : "Save"}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Timezone
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", maxWidth: "24rem" }}>
                <input
                  type="text"
                  value={cronTimezone}
                  onChange={(e) => setCronTimezone(e.target.value)}
                  style={{ ...inputStyle, width: "100%" }}
                />
                <button
                  type="button"
                  disabled={settingsSaving === "cron_timezone"}
                  onClick={() => saveSetting("cron_timezone", cronTimezone)}
                  style={{ ...btnSecondary, whiteSpace: "nowrap", fontSize: 12, padding: "5px 8px" }}
                >
                  {settingsSaving === "cron_timezone" ? <Spinner size={14} /> : "Save"}
                </button>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0", maxWidth: "40rem", lineHeight: 1.5 }}>
              The on/off toggle takes effect immediately — disabled crons return early without
              running. Times shown here are stored in the database for reference. The actual Vercel
              cron schedule is a static expression in <code style={{ fontSize: 11 }}>vercel.json</code>;
              changing it requires a redeployment.
            </p>
          </>
        )}
      </section>

      {/* ============================================================ */}
      {/*  KEYWORDS                                                     */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Keywords</h2>

        {!entities && !entitiesLoading && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Click &ldquo;Load config&rdquo; above to view keywords.
          </p>
        )}
        {entitiesLoading && (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            <Spinner /> Loading…
          </p>
        )}
        {entitiesError && (
          <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{entitiesError}</p>
        )}

        {entities?.map((ent) => {
          const open = kwExpanded[ent.id] ?? false;
          const newVal = kwNewInput[ent.id] ?? "";
          const busy = kwBusy === ent.id;
          return (
            <div
              key={ent.id}
              style={{ border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, overflow: "hidden" }}
            >
              <button
                type="button"
                onClick={() => setKwExpanded((p) => ({ ...p, [ent.id]: !open }))}
                style={{ ...sectionHeaderBtn, background: open ? "#f3f4f6" : "#fafafa" }}
              >
                <span>
                  {open ? "▼" : "▶"} {ent.name}
                  <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>
                    {ent.keywords.length} keyword{ent.keywords.length !== 1 ? "s" : ""}
                  </span>
                </span>
              </button>
              {open && (
                <div style={{ padding: 12, background: "#fff" }}>
                  {ent.keywords.length === 0 && (
                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
                      No keywords configured.
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {ent.keywords.map((kw) => (
                      <span key={kw.id} style={chipStyle}>
                        {kw.keyword}
                        <button
                          type="button"
                          title="Delete keyword"
                          onClick={() => deleteKeyword(kw.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: "0 2px",
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={newVal}
                      placeholder="Add keyword…"
                      onChange={(e) => setKwNewInput((p) => ({ ...p, [ent.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeyword(ent.id);
                        }
                      }}
                      style={{ ...inputStyle, minWidth: "12rem" }}
                    />
                    <button
                      type="button"
                      disabled={busy || !newVal.trim()}
                      onClick={() => addKeyword(ent.id)}
                      style={{
                        ...btnPrimary,
                        opacity: newVal.trim() ? 1 : 0.5,
                        cursor: newVal.trim() && !busy ? "pointer" : "not-allowed",
                      }}
                    >
                      {busy && <Spinner size={14} />}
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ============================================================ */}
      {/*  RECIPIENTS                                                   */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Recipients</h2>

        {!entities && !entitiesLoading && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Click &ldquo;Load config&rdquo; above to view recipients.
          </p>
        )}
        {entitiesLoading && (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            <Spinner /> Loading…
          </p>
        )}

        {entities && (
          <>
            {renderRecipientGroup(
              ADMIN_KEY,
              "Admin",
              adminRecipients,
              "(receives all entities)",
              true
            )}
            {entities.map((ent) =>
              renderRecipientGroup(String(ent.id), ent.name, ent.recipients)
            )}
          </>
        )}
      </section>

      {/* ============================================================ */}
      {/*  INGEST                                                       */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Ingest</h2>
        <button
          type="button"
          onClick={runIngest}
          disabled={ingestLoading}
          style={{ ...btnPrimary, cursor: ingestLoading ? "wait" : "pointer" }}
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

      {/* ============================================================ */}
      {/*  DIGEST (admin only)                                          */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem 0" }}>Digest</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px", maxWidth: "40rem", lineHeight: 1.5 }}>
          Preview and send the aggregated admin digest (all entities, all scored articles) to
          enabled <strong>Admin</strong> recipients. Entity recipients receive their filtered
          digests via the automated cron job.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={previewDigest}
            disabled={previewLoading}
            style={{ ...btnSecondary, cursor: previewLoading ? "wait" : "pointer" }}
          >
            {previewLoading && <Spinner />}
            Preview admin digest
          </button>
          <button
            type="button"
            onClick={sendDigest}
            disabled={sendLoading}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              cursor: sendLoading ? "wait" : "pointer",
              borderRadius: 6,
              border: "1px solid #b45309",
              background: "#fff7ed",
              color: "#9a3412",
            }}
          >
            {sendLoading && <Spinner />}
            Send to admin recipients
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
