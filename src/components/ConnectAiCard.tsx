import { useEffect, useState } from "react";
import { api, type ApiToken } from "../lib/api";
import { SoftCard } from "./ui";

// v169: "Connect your AI" — personal API tokens for the MCP server. A
// founding member creates a token here, pastes it into their own AI client
// once, and that AI can read their projects over /api/mcp. The raw token is
// shown exactly once (only its hash is stored server-side), so the reveal
// panel below is the one and only chance to copy it.

const MCP_URL = "https://app.tasketra.com/api/mcp";

function formatWhen(v: string | null): string {
  if (!v) return "Never";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "Never" : d.toLocaleString();
}

export function ConnectAiCard() {
  const [loading, setLoading] = useState(true);
  const [founding, setFounding] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState<"claude" | "chatgpt">("claude");
  const [endpointCopied, setEndpointCopied] = useState(false);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealCopied, setRevealCopied] = useState(false);

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.getApiTokens();
      setTokens(res.tokens);
      setFounding(res.founding);
      setLoadError("");
    } catch {
      setLoadError("Couldn't load your tokens. Refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function copyText(text: string, done: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      done(true);
      setTimeout(() => done(false), 2000);
    });
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await api.createApiToken(name.trim(), scope);
      setRevealed(res.raw);
      setRevealCopied(false);
      setName("");
      setScope("read");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create that token.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      await api.revokeApiToken(id);
      setConfirmRevokeId(null);
      await load();
    } catch {
      setCreateError("Couldn't revoke that token. Try again.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <SoftCard title="Connect your AI" className="ui-narrow billing-card">
      <p className="muted" style={{ marginTop: 0 }}>
        Connect Claude, ChatGPT, or another AI assistant to your projects. It can read your project
        status, tasks, decisions that are waiting, and risks, and answer questions like "what is
        waiting on me?" This first version is read-only: your AI can look, never change anything.
      </p>

      {/* v169.1: the server address and setup steps only make sense once a
          token can actually be created below, so they render for founding
          members only. Everyone else sees the intro and the founding note. */}
      {!loading && !loadError && founding && (
        <>
      <label htmlFor="f-connectai-endpoint">Server address</label>
      <div className="inline-form">
        <input
          id="f-connectai-endpoint"
          type="text"
          readOnly
          value={MCP_URL}
          onFocus={(e) => e.target.select()}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button type="button" className="btn btn-primary" onClick={() => copyText(MCP_URL, setEndpointCopied)}>
          {endpointCopied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="view-toggle" role="group" aria-label="Setup instructions" style={{ marginTop: 14 }}>
        <button type="button" className={tab === "claude" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("claude")}>
          Claude
        </button>
        <button type="button" className={tab === "chatgpt" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("chatgpt")}>
          ChatGPT
        </button>
      </div>
      {tab === "claude" ? (
        <ol className="muted" style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Create a token below and copy it (you will only see it once).</li>
          <li>In Claude Code, run: <code>claude mcp add --transport http tasketra {MCP_URL} --header "Authorization: Bearer YOUR_TOKEN"</code></li>
          <li>In Claude Desktop, add the same server address and Authorization header in Settings, under Developer / MCP servers.</li>
          <li>Ask Claude about your projects, for example "What decisions are waiting on me in Tasketra?"</li>
        </ol>
      ) : (
        <ol className="muted" style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Create a token below and copy it (you will only see it once).</li>
          <li>In ChatGPT, open Settings, then Apps and connectors, and turn on Developer mode under Advanced settings.</li>
          <li>Create a new app, choose MCP, paste the server address above, and when it asks how the app signs in, use the header option with <code>Authorization: Bearer YOUR_TOKEN</code>.</li>
          <li>Ask ChatGPT about your projects, for example "What is overdue in Tasketra?"</li>
        </ol>
      )}
        </>
      )}

      {loading ? (
        <p className="muted">Loading your tokens...</p>
      ) : loadError ? (
        <div className="form-error">{loadError}</div>
      ) : !founding ? (
        <p className="muted" style={{ marginTop: 14 }}>
          Connecting your AI is rolling out to founding members first. When it opens to everyone,
          this is where your tokens will live.
        </p>
      ) : (
        <>
          {tokens.length > 0 && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {tokens.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{t.name}</strong>
                      <span className={t.scope === "write" ? "pill pill-green" : "pill pill-neutral"}>{t.scope === "write" ? "Read + write" : "Read only"}</span>
                      <code className="muted">{t.token_prefix}…</code>
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      Created {formatWhen(t.created_at)} · Last used {formatWhen(t.last_used_at)}
                    </div>
                  </div>
                  {confirmRevokeId === t.id ? (
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn-link btn-link-danger"
                        disabled={revokingId === t.id}
                        onClick={() => revoke(t.id)}
                      >
                        {revokingId === t.id ? "Revoking..." : "Confirm revoke"}
                      </button>
                      <button type="button" className="btn-link" onClick={() => setConfirmRevokeId(null)}>
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn-link btn-link-danger" onClick={() => setConfirmRevokeId(t.id)}>
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {revealed && (
            <div
              style={{
                marginTop: 14,
                background: "var(--tint)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <strong>Copy your token now.</strong>
              <p className="muted" style={{ margin: "6px 0 10px" }}>
                This is the only time it is shown. If you lose it, revoke it and create a new one.
              </p>
              <div className="inline-form">
                <input
                  aria-label="Your new API token"
                  type="text"
                  readOnly
                  value={revealed}
                  onFocus={(e) => e.target.select()}
                  style={{ flex: 1, minWidth: 260, fontFamily: "monospace" }}
                />
                <button type="button" className="btn btn-primary" onClick={() => copyText(revealed, setRevealCopied)}>
                  {revealCopied ? "Copied!" : "Copy token"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRevealed(null)}>
                  Done
                </button>
              </div>
            </div>
          )}

          <form onSubmit={createToken} style={{ marginTop: 16 }}>
            <label htmlFor="f-connectai-name">New token name</label>
            <input
              id="f-connectai-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Claude"
              maxLength={60}
              required
            />
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="token-scope" checked={scope === "read"} onChange={() => setScope("read")} style={{ marginTop: 3 }} />
                <span>
                  <strong>Read only</strong>
                  <span className="muted" style={{ display: "block" }}>Your AI can read your projects. It cannot change anything.</span>
                </span>
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="token-scope" checked={scope === "write"} onChange={() => setScope("write")} style={{ marginTop: 3 }} />
                <span>
                  <strong>Read + write</strong>
                  <span className="muted" style={{ display: "block" }}>
                    Takes effect when write tools arrive in the next update. Until then this token is read-only too.
                  </span>
                </span>
              </label>
            </div>
            {createError && <div className="form-error">{createError}</div>}
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ marginTop: 10 }}>
              {creating ? "Creating..." : "Create token"}
            </button>
          </form>
        </>
      )}
    </SoftCard>
  );
}
