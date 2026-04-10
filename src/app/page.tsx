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
type DbEntityRecipient = { id: number; email: string; enabled: boolean };

/** Full entity config as returned by /api/entity-config */
type DbEntityConfig = {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  keywords: DbKeyword[];
  recipients: DbEntityRecipient[];
};

/** Admin recipient as returned by /api/entities */
type DbAdminRecipient = { id: number; email: string; enabled: boolean };

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
/*  Admin recipient row (toggle + delete)                              */
/* ------------------------------------------------------------------ */

function AdminRecipientRow({
  rc,
  onToggle,
  onDelete,
}: {
  rc: DbAdminRecipient;
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

  /* --- Entity config (keywords + descriptions + entity recipients) --- */
  const [entityConfigs, setEntityConfigs] = useState<DbEntityConfig[] | null>(null);
  const [entityConfigLoading, setEntityConfigLoading] = useState(false);
  const [entityConfigError, setEntityConfigError] = useState<string | null>(null);

  // Per-entity expanded state
  const [ecExpanded, setEcExpanded] = useState<Record<number, boolean>>({});

  // Description editing
  const [descDraft, setDescDraft] = useState<Record<number, string>>({});
  const [descSaving, setDescSaving] = useState<number | null>(null);

  // Keyword editing
  const [kwNewInput, setKwNewInput] = useState<Record<number, string>>({});
  const [kwBusy, setKwBusy] = useState<number | null>(null);

  // Entity recipient editing
  const [erNewInput, setErNewInput] = useState<Record<number, string>>({});
  const [erEmailError, setErEmailError] = useState<Record<number, string>>({});
  const [erBusy, setErBusy] = useState<number | null>(null);

  /* --- Admin recipients (entity_id IS NULL) --- */
  const [adminRecipients, setAdminRecipients] = useState<DbAdminRecipient[]>([]);
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
    } catch { /* unavailable */ }
  }, []);

  const persistSecret = useCallback((value: string) => {
    setCronSecret(value);
    try {
      sessionStorage.setItem(CRON_SECRET_SESSION_KEY, value);
    } catch { /* ignore */ }
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

  useEffect(() => { loadStatus(); }, [loadStatus]);

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
      if (!res.ok || !data.ok) { setSettingsError(data.error ?? `HTTP ${res.status}`); return; }
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
      if (!res.ok || !data.ok) setSettingsError(data.error ?? `HTTP ${res.status}`);
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
  /*  Entity config (keywords + descriptions + entity recipients)      */
  /* ---------------------------------------------------------------- */

  const loadEntityConfig = useCallback(async () => {
    if (!cronSecret.trim()) return;
    setEntityConfigLoading(true);
    setEntityConfigError(null);
    try {
      const res = await fetch(`/api/entity-config?${authParams(cronSecret)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        entities?: DbEntityConfig[];
        error?: string;
      };
      if (!res.ok || !data.ok) { setEntityConfigError(data.error ?? `HTTP ${res.status}`); return; }
      setEntityConfigs(data.entities!);
      // Initialise description drafts from loaded data
      const drafts: Record<number, string> = {};
      for (const e of data.entities!) drafts[e.id] = e.description;
      setDescDraft(drafts);
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntityConfigLoading(false);
    }
  }, [cronSecret]);

  /** Load admin recipients from /api/entities */
  const loadAdminRecipients = useCallback(async () => {
    if (!cronSecret.trim()) return;
    try {
      const res = await fetch(`/api/entities?${authParams(cronSecret)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        adminRecipients?: DbAdminRecipient[];
        error?: string;
      };
      if (res.ok && data.ok) setAdminRecipients(data.adminRecipients ?? []);
    } catch { /* ignore */ }
  }, [cronSecret]);

  /* --- Description --- */

  const saveDescription = async (entityId: number) => {
    if (!cronSecret.trim()) return;
    setDescSaving(entityId);
    setEntityConfigError(null);
    try {
      const res = await fetch(`/api/entity-config?${authParams(cronSecret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, field: "description", value: descDraft[entityId] ?? "" }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      } else {
        await loadEntityConfig();
      }
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescSaving(null);
    }
  };

  /* --- Keywords --- */

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
        setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      } else {
        setKwNewInput((p) => ({ ...p, [entityId]: "" }));
        await loadEntityConfig();
      }
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setKwBusy(null);
    }
  };

  const deleteKeyword = async (kwId: number, entityId: number) => {
    if (!cronSecret.trim()) return;
    try {
      const res = await fetch(`/api/keywords/${kwId}?${authParams(cronSecret)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      await loadEntityConfig();
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    }
    void entityId; // used for context only
  };

  /* --- Entity recipients --- */

  const addEntityRecipient = async (entityId: number) => {
    const email = (erNewInput[entityId] ?? "").trim();
    if (!email || !cronSecret.trim()) return;
    if (!EMAIL_RE.test(email)) {
      setErEmailError((p) => ({ ...p, [entityId]: "Invalid email format" }));
      return;
    }
    setErEmailError((p) => ({ ...p, [entityId]: "" }));
    setErBusy(entityId);
    try {
      const res = await fetch(`/api/recipients?${authParams(cronSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      } else {
        setErNewInput((p) => ({ ...p, [entityId]: "" }));
        await loadEntityConfig();
      }
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setErBusy(null);
    }
  };

  const deleteEntityRecipient = async (rcId: number) => {
    if (!cronSecret.trim()) return;
    if (!window.confirm("Delete this recipient?")) return;
    try {
      const res = await fetch(`/api/recipients/${rcId}?${authParams(cronSecret)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      await loadEntityConfig();
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    }
  };

  /* --- Admin recipients --- */

  const addAdminRecipient = async () => {
    const email = (rcNewInput[ADMIN_KEY] ?? "").trim();
    if (!email || !cronSecret.trim()) return;
    if (!EMAIL_RE.test(email)) {
      setRcEmailError((p) => ({ ...p, [ADMIN_KEY]: "Invalid email format" }));
      return;
    }
    setRcEmailError((p) => ({ ...p, [ADMIN_KEY]: "" }));
    setRcBusy(ADMIN_KEY);
    try {
      const res = await fetch(`/api/recipients?${authParams(cronSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: null, email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      } else {
        setRcNewInput((p) => ({ ...p, [ADMIN_KEY]: "" }));
        await loadAdminRecipients();
      }
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setRcBusy(null);
    }
  };

  const toggleAdminRecipient = async (rcId: number, enabled: boolean) => {
    if (!cronSecret.trim()) return;
    try {
      const res = await fetch(`/api/recipients/${rcId}?${authParams(cronSecret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      await loadAdminRecipients();
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteAdminRecipient = async (rcId: number) => {
    if (!cronSecret.trim()) return;
    if (!window.confirm("Delete this admin recipient?")) return;
    try {
      const res = await fetch(`/api/recipients/${rcId}?${authParams(cronSecret)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) setEntityConfigError(data.error ?? `HTTP ${res.status}`);
      await loadAdminRecipients();
    } catch (e) {
      setEntityConfigError(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Ingest                                                           */
  /* ---------------------------------------------------------------- */

  const runIngest = async () => {
    if (!cronSecret.trim()) { setIngestResult({ error: "Enter CRON_SECRET first." }); return; }
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
  /*  Digest                                                           */
  /* ---------------------------------------------------------------- */

  const previewDigest = async () => {
    if (!cronSecret.trim()) { setPreviewError("Enter CRON_SECRET first."); setPreviewHtml(null); return; }
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
      if (!res.ok || !data.ok) { setPreviewError(data.error ?? `HTTP ${res.status}`); return; }
      setPreviewHtml(data.previewHtml ?? null);
      setPreviewRecipient(data.previewRecipient ?? null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendDigest = async () => {
    if (!cronSecret.trim()) { setSendResult({ error: "Enter CRON_SECRET first." }); return; }
    const n = adminRecipients.filter((r) => r.enabled).length;
    if (n === 0) { setSendResult({ error: "No enabled admin recipients. Add one in the Admin Recipients section." }); return; }
    if (!window.confirm(`Send aggregated admin digest to ${n} admin recipient${n === 1 ? "" : "s"}?`)) return;
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
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const chipDeleteBtn: CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#9ca3af",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
  };

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
        <label htmlFor="cron-secret" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
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
            disabled={!cronSecret.trim() || settingsLoading || entityConfigLoading}
            onClick={() => { loadSettings(); loadEntityConfig(); loadAdminRecipients(); }}
            style={{
              ...btnPrimary,
              opacity: cronSecret.trim() ? 1 : 0.5,
              cursor: cronSecret.trim() ? "pointer" : "not-allowed",
            }}
          >
            {(settingsLoading || entityConfigLoading) && <Spinner />}
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
                <dd style={{ margin: "4px 0 0", ...(mono ? { fontFamily: "ui-monospace, monospace" } : {}) }}>
                  {(val as string | number) ?? "—"}
                </dd>
              </div>
            ))}
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Emails sent (last digest)</dt>
              <dd style={{ margin: "4px 0 0" }}>
                {status?.digestEmailsSent ?? "—"}
                {status?.digestRecipientCount != null && (
                  <span style={{ color: "var(--muted)" }}> / {status.digestRecipientCount} targeted</span>
                )}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Recipients</dt>
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
          {cronSecret.trim() && (
            <a
              href={`/api/articles?secret=${encodeURIComponent(cronSecret.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnSecondary, textDecoration: "none", color: "#111827" }}
            >
              View raw articles
            </a>
          )}
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
        {settingsLoading && <p style={{ margin: 0, color: "var(--muted)" }}><Spinner /> Loading settings…</p>}
        {settingsError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{settingsError}</p>}

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
                  width: 44, height: 24, borderRadius: 12, border: "none",
                  background: cronEnabled ? "#22c55e" : "#d1d5db",
                  position: "relative",
                  cursor: settingsSaving === "cron_enabled" ? "wait" : "pointer",
                  transition: "background 0.2s", flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: cronEnabled ? 22 : 2,
                  width: 20, height: 20, borderRadius: "50%", background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
                }} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Cron jobs {cronEnabled ? "enabled" : "disabled"}
              </span>
              {settingsSaving === "cron_enabled" && <Spinner size={16} />}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: "24rem", marginBottom: 12 }}>
              {(["cron_ingest_time", "cron_digest_time"] as const).map((key) => {
                const label = key === "cron_ingest_time" ? "Ingest time" : "Digest time";
                const val = key === "cron_ingest_time" ? ingestTime : digestTime;
                const setter = key === "cron_ingest_time" ? setIngestTime : setDigestTime;
                return (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</label>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" value={val} onChange={(e) => setter(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                      <button
                        type="button"
                        disabled={settingsSaving === key}
                        onClick={() => saveSetting(key, val)}
                        style={{ ...btnSecondary, whiteSpace: "nowrap", fontSize: 12, padding: "5px 8px" }}
                      >
                        {settingsSaving === key ? <Spinner size={14} /> : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Timezone</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", maxWidth: "24rem" }}>
                <input type="text" value={cronTimezone} onChange={(e) => setCronTimezone(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
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
              The on/off toggle takes effect immediately. Times shown here are stored in the database for
              reference. The actual Vercel cron schedule is a static expression in{" "}
              <code style={{ fontSize: 11 }}>vercel.json</code>; changing it requires a redeployment.
            </p>
          </>
        )}
      </section>

      {/* ============================================================ */}
      {/*  ENTITY CONFIGURATION                                         */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.25rem 0" }}>Entity Configuration</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 0.85rem", lineHeight: 1.5 }}>
          Configure each entity&apos;s service description (used in AI scoring prompts), keywords
          (used for article matching), and entity-specific digest recipients.
        </p>

        {!entityConfigs && !entityConfigLoading && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Click &ldquo;Load config&rdquo; above to view entity configuration.
          </p>
        )}
        {entityConfigLoading && <p style={{ margin: 0, color: "var(--muted)" }}><Spinner /> Loading…</p>}
        {entityConfigError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{entityConfigError}</p>}

        {entityConfigs?.map((ent) => {
          const open = ecExpanded[ent.id] ?? false;
          const kwCount = ent.keywords.length;
          const rcCount = ent.recipients.filter((r) => r.enabled).length;
          const rcTotal = ent.recipients.length;
          const busy = kwBusy === ent.id || erBusy === ent.id || descSaving === ent.id;

          return (
            <div
              key={ent.id}
              style={{ border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, overflow: "hidden" }}
            >
              {/* Section header */}
              <button
                type="button"
                onClick={() => setEcExpanded((p) => ({ ...p, [ent.id]: !open }))}
                style={{ ...sectionHeaderBtn, background: open ? "#f3f4f6" : "#fafafa" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {open ? "▼" : "▶"} {ent.name}
                  <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)" }}>
                    {kwCount} keyword{kwCount !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)" }}>
                    · {rcCount}/{rcTotal} recipient{rcTotal !== 1 ? "s" : ""}
                  </span>
                </span>
                {busy && <Spinner size={14} />}
              </button>

              {open && (
                <div style={{ padding: 14, background: "#fff", display: "grid", gap: 20 }}>

                  {/* ---- Service Description ---- */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Service Description</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Used in AI scoring prompts</span>
                    </div>
                    <textarea
                      value={descDraft[ent.id] ?? ent.description}
                      onChange={(e) => setDescDraft((p) => ({ ...p, [ent.id]: e.target.value }))}
                      rows={3}
                      style={{
                        ...inputStyle,
                        width: "100%",
                        resize: "vertical",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        disabled={descSaving === ent.id}
                        onClick={() => saveDescription(ent.id)}
                        style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}
                      >
                        {descSaving === ent.id ? <><Spinner size={13} /> Saving…</> : "Save description"}
                      </button>
                      {(descDraft[ent.id] ?? ent.description) !== ent.description && descSaving !== ent.id && (
                        <span style={{ fontSize: 11, color: "#d97706" }}>Unsaved changes</span>
                      )}
                    </div>
                  </div>

                  {/* ---- Keywords ---- */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Keywords</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Trigger article matching</span>
                    </div>
                    {ent.keywords.length === 0 && (
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>No keywords configured.</p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {ent.keywords.map((kw) => (
                        <span key={kw.id} style={chipStyle}>
                          {kw.keyword}
                          <button
                            type="button"
                            title="Delete keyword"
                            onClick={() => deleteKeyword(kw.id, ent.id)}
                            style={chipDeleteBtn}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        value={kwNewInput[ent.id] ?? ""}
                        placeholder="Add keyword…"
                        onChange={(e) => setKwNewInput((p) => ({ ...p, [ent.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(ent.id); } }}
                        style={{ ...inputStyle, minWidth: "12rem" }}
                      />
                      <button
                        type="button"
                        disabled={kwBusy === ent.id || !(kwNewInput[ent.id] ?? "").trim()}
                        onClick={() => addKeyword(ent.id)}
                        style={{
                          ...btnPrimary,
                          fontSize: 12, padding: "5px 10px",
                          opacity: (kwNewInput[ent.id] ?? "").trim() ? 1 : 0.5,
                          cursor: (kwNewInput[ent.id] ?? "").trim() && kwBusy !== ent.id ? "pointer" : "not-allowed",
                        }}
                      >
                        {kwBusy === ent.id ? <Spinner size={13} /> : null}
                        Add
                      </button>
                    </div>
                  </div>

                  {/* ---- Entity Recipients ---- */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Entity Recipients</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Receive filtered digest for this entity only</span>
                    </div>
                    {ent.recipients.length === 0 && (
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>No recipients configured.</p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {ent.recipients.map((rc) => (
                        <span
                          key={rc.id}
                          style={{
                            ...chipStyle,
                            opacity: rc.enabled ? 1 : 0.5,
                            borderColor: rc.enabled ? "#d1d5db" : "#e5e7eb",
                          }}
                        >
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{rc.email}</span>
                          <button
                            type="button"
                            title="Delete recipient"
                            onClick={() => deleteEntityRecipient(rc.id)}
                            style={chipDeleteBtn}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="email"
                        value={erNewInput[ent.id] ?? ""}
                        placeholder="email@example.com"
                        onChange={(e) => {
                          setErNewInput((p) => ({ ...p, [ent.id]: e.target.value }));
                          if (erEmailError[ent.id]) setErEmailError((p) => ({ ...p, [ent.id]: "" }));
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntityRecipient(ent.id); } }}
                        style={{ ...inputStyle, minWidth: "14rem" }}
                      />
                      <button
                        type="button"
                        disabled={erBusy === ent.id || !(erNewInput[ent.id] ?? "").trim()}
                        onClick={() => addEntityRecipient(ent.id)}
                        style={{
                          ...btnPrimary,
                          fontSize: 12, padding: "5px 10px",
                          opacity: (erNewInput[ent.id] ?? "").trim() ? 1 : 0.5,
                          cursor: (erNewInput[ent.id] ?? "").trim() && erBusy !== ent.id ? "pointer" : "not-allowed",
                        }}
                      >
                        {erBusy === ent.id ? <Spinner size={13} /> : null}
                        Add
                      </button>
                    </div>
                    {erEmailError[ent.id] && (
                      <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{erEmailError[ent.id]}</p>
                    )}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ============================================================ */}
      {/*  ADMIN RECIPIENTS                                             */}
      {/* ============================================================ */}

      <section style={panelStyle}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.25rem 0" }}>Admin Recipients</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 0.85rem", lineHeight: 1.5 }}>
          Admin recipients receive the full aggregated digest (all entities) via the Digest section below.
        </p>

        {!entityConfigs && !entityConfigLoading && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Click &ldquo;Load config&rdquo; above to view admin recipients.
          </p>
        )}

        {entityConfigs && (
          <div style={{ border: "1.5px solid #a78bfa", borderRadius: 6, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setRcExpanded((p) => ({ ...p, [ADMIN_KEY]: !(p[ADMIN_KEY] ?? false) }))}
              style={{
                ...sectionHeaderBtn,
                background: rcExpanded[ADMIN_KEY] ? "#ede9fe" : "#f5f3ff",
              }}
            >
              <span>
                {rcExpanded[ADMIN_KEY] ? "▼" : "▶"} Admin
                <span style={{ fontWeight: 400, fontSize: 11, color: "#7c3aed", marginLeft: 6 }}>
                  (receives all entities)
                </span>
                <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>
                  {adminRecipients.filter((r) => r.enabled).length}/{adminRecipients.length} recipient
                  {adminRecipients.length !== 1 ? "s" : ""}
                </span>
              </span>
            </button>
            {rcExpanded[ADMIN_KEY] && (
              <div style={{ padding: 12, background: "#fff" }}>
                {adminRecipients.length === 0 && (
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>No admin recipients configured.</p>
                )}
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  {adminRecipients.map((rc) => (
                    <AdminRecipientRow
                      key={rc.id}
                      rc={rc}
                      onToggle={toggleAdminRecipient}
                      onDelete={deleteAdminRecipient}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="email"
                    value={rcNewInput[ADMIN_KEY] ?? ""}
                    placeholder="email@example.com"
                    onChange={(e) => {
                      setRcNewInput((p) => ({ ...p, [ADMIN_KEY]: e.target.value }));
                      if (rcEmailError[ADMIN_KEY]) setRcEmailError((p) => ({ ...p, [ADMIN_KEY]: "" }));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAdminRecipient(); } }}
                    style={{ ...inputStyle, minWidth: "14rem" }}
                  />
                  <button
                    type="button"
                    disabled={rcBusy === ADMIN_KEY || !(rcNewInput[ADMIN_KEY] ?? "").trim()}
                    onClick={addAdminRecipient}
                    style={{
                      ...btnPrimary,
                      opacity: (rcNewInput[ADMIN_KEY] ?? "").trim() ? 1 : 0.5,
                      cursor: (rcNewInput[ADMIN_KEY] ?? "").trim() && rcBusy !== ADMIN_KEY ? "pointer" : "not-allowed",
                    }}
                  >
                    {rcBusy === ADMIN_KEY && <Spinner size={14} />}
                    Add
                  </button>
                </div>
                {rcEmailError[ADMIN_KEY] && (
                  <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{rcEmailError[ADMIN_KEY]}</p>
                )}
              </div>
            )}
          </div>
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
          <pre style={{
            marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 6,
            fontSize: 12, overflow: "auto", maxHeight: 280, border: "1px solid var(--border)",
          }}>
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
          Preview and send the aggregated admin digest (all entities, all scored articles) to enabled{" "}
          <strong>Admin</strong> recipients. Entity recipients receive their filtered digests via the
          automated cron job.
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
              padding: "8px 14px", fontSize: 13,
              cursor: sendLoading ? "wait" : "pointer",
              borderRadius: 6, border: "1px solid #b45309",
              background: "#fff7ed", color: "#9a3412",
            }}
          >
            {sendLoading && <Spinner />}
            Send to admin recipients
          </button>
        </div>
        {previewRecipient && (
          <p style={{ fontSize: 13, margin: "0 0 8px", color: "var(--muted)" }}>
            Preview recipient:{" "}
            <span style={{ fontFamily: "ui-monospace, monospace", color: "#111" }}>{previewRecipient}</span>
          </p>
        )}
        {previewError && <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 8px" }}>{previewError}</p>}
        {previewHtml && (
          <iframe
            title="Digest preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
            style={{
              width: "100%", minHeight: 420,
              border: "1px solid var(--border)", borderRadius: 6, background: "#fff",
            }}
          />
        )}
        {sendResult && (
          <pre style={{
            marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 6,
            fontSize: 12, overflow: "auto", maxHeight: 220, border: "1px solid var(--border)",
          }}>
            {JSON.stringify(sendResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
