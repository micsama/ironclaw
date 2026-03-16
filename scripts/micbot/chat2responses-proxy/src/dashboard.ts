import type { ProxyConfig } from "./config.ts";
import type { ProxyStats, RequestTrace } from "./observability.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRequestRow(request: RequestTrace): string {
  const statusClass = request.status === "ok" ? "ok" : request.status === "error" ? "error" : "pending";
  const preview = request.error || request.bodyPreview || "";
  const previewHtml = preview ? `<pre>${escapeHtml(preview)}</pre>` : "<span class=\"muted\">No preview</span>";

  return `
    <article class="request ${statusClass}">
      <div class="request-head">
        <div>
          <strong>#${escapeHtml(request.id)}</strong>
          <span class="pill">${escapeHtml(request.status)}</span>
          <span class="pill">${escapeHtml(request.model)}</span>
        </div>
        <div class="muted">${escapeHtml(request.startedAt)}</div>
      </div>
      <div class="meta">
        <span>route: ${escapeHtml(request.route)}</span>
        <span>messages: ${request.requestMessages}</span>
        <span>tools: ${request.requestTools}</span>
        <span>auth: ${escapeHtml(request.authMode)}</span>
        <span>upstream: ${request.upstreamStatus ?? "-"}</span>
        <span>elapsed: ${request.elapsedMs ?? "-"} ms</span>
      </div>
      <div class="target">${escapeHtml(request.upstreamTarget)}</div>
      <div class="preview">${previewHtml}</div>
    </article>
  `;
}

export function renderDashboard(input: {
  config: ProxyConfig;
  stats: ProxyStats;
  recentRequests: RequestTrace[];
}): string {
  const requestCards = input.recentRequests.length > 0
    ? input.recentRequests.map(renderRequestRow).join("\n")
    : `<div class="empty">No requests yet. Trigger IronClaw once and refresh this page.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Micbot Proxy Dashboard</title>
  <style>
    :root {
      --bg: #f3ede4;
      --paper: #fffaf2;
      --ink: #1e1b18;
      --muted: #6f665b;
      --line: #d7c8b5;
      --accent: #0f766e;
      --accent-soft: #d8f3ef;
      --danger: #a11d33;
      --danger-soft: #ffe1e7;
      --pending: #8a5a00;
      --pending-soft: #ffe9b3;
      --shadow: 0 18px 40px rgba(60, 34, 14, 0.08);
      --mono: "SFMono-Regular", "Menlo", "Monaco", monospace;
      --sans: "Avenir Next", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.10), transparent 25%),
        radial-gradient(circle at top right, rgba(161,29,51,0.08), transparent 22%),
        linear-gradient(180deg, #f7f1e7 0%, var(--bg) 100%);
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 32px 20px 56px;
    }
    .hero {
      display: grid;
      gap: 14px;
      margin-bottom: 24px;
    }
    .eyebrow {
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: clamp(32px, 6vw, 64px);
      line-height: 0.95;
    }
    .lead {
      max-width: 760px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .card {
      background: rgba(255,250,242,0.88);
      border: 1px solid rgba(215,200,181,0.85);
      border-radius: 18px;
      padding: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .card h2 {
      margin: 0 0 10px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .metric {
      font-size: 34px;
      font-weight: 800;
    }
    .label {
      font-size: 14px;
      color: var(--muted);
    }
    .endpoint {
      font-family: var(--mono);
      word-break: break-all;
      font-size: 13px;
      line-height: 1.5;
      background: #f7efe1;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 26px 0 12px;
      gap: 12px;
    }
    .section-head h2 {
      margin: 0;
      font-size: 22px;
    }
    .section-head .muted {
      font-size: 13px;
    }
    .request-list {
      display: grid;
      gap: 12px;
    }
    .request {
      border-radius: 16px;
      padding: 16px;
      border: 1px solid var(--line);
      background: var(--paper);
      box-shadow: var(--shadow);
    }
    .request.ok { border-color: #b4ddd8; }
    .request.error { border-color: #efb7c2; }
    .request.pending { border-color: #f1d58e; }
    .request-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 10px;
    }
    .pill {
      display: inline-flex;
      margin-left: 8px;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .request.error .pill:first-of-type {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .request.pending .pill:first-of-type {
      background: var(--pending-soft);
      color: var(--pending);
    }
    .target {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 12px;
      word-break: break-all;
    }
    .preview pre {
      margin: 0;
      font-family: var(--mono);
      font-size: 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #201b16;
      color: #f9f4ec;
      border-radius: 12px;
      padding: 12px;
    }
    .muted {
      color: var(--muted);
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 16px;
      padding: 28px;
      text-align: center;
      color: var(--muted);
      background: rgba(255,250,242,0.75);
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Micbot Bridge</div>
      <h1>Chat to Responses<br/>Proxy Dashboard</h1>
      <div class="lead">
        Watch incoming IronClaw traffic, inspect upstream status codes, and check recent conversion failures without tailing terminal logs.
      </div>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Listening</h2>
        <div class="endpoint">http://${escapeHtml(input.config.host)}:${input.config.port}/v1</div>
      </article>
      <article class="card">
        <h2>Upstream</h2>
        <div class="endpoint">${escapeHtml(input.config.responsesEndpointUrl)}</div>
      </article>
      <article class="card">
        <h2>Requests</h2>
        <div class="metric">${input.stats.totalRequests}</div>
        <div class="label">total forwarded chat requests</div>
      </article>
      <article class="card">
        <h2>Failures</h2>
        <div class="metric">${input.stats.failedRequests}</div>
        <div class="label">failed upstream or conversion requests</div>
      </article>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Success</h2>
        <div class="metric">${input.stats.completedRequests}</div>
        <div class="label">completed with 2xx upstream status</div>
      </article>
      <article class="card">
        <h2>Models</h2>
        <div class="metric">${input.stats.modelsRequests}</div>
        <div class="label">times /v1/models was requested</div>
      </article>
      <article class="card">
        <h2>Started</h2>
        <div class="endpoint">${escapeHtml(input.stats.startedAt)}</div>
      </article>
      <article class="card">
        <h2>Configured Models</h2>
        <div class="endpoint">${escapeHtml(input.config.models.join(", "))}</div>
      </article>
    </section>

    <section>
      <div class="section-head">
        <h2>Recent Requests</h2>
        <div class="muted">Refresh the page to update. API: <code>/api/requests</code></div>
      </div>
      <div class="request-list">
        ${requestCards}
      </div>
    </section>
  </main>
</body>
</html>`;
}
