#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  CODEBURN PRO — Economisor Dashboard                    ║
 * ║  Tokens économisés + Coûts réels par provider           ║
 * ║  Intégré à Economisor par Novaquantic SAS               ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Usage : node codeburn_pro.js [--html] [--json] [--watch]
 */

const fs   = require("fs");
const path = require("path");
const http = require("http");
const os   = require("os");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Dossiers Claude Code sessions (Windows + Linux/Mac)
  sessionDirs: [
    path.join(os.homedir(), ".claude", "projects"),
    path.join(os.homedir(), ".claude", "sessions"),
    path.join(os.homedir(), "AppData", "Roaming", "Claude", "projects"),
    path.join(process.cwd(), ".claude"),
  ],
  // Dossier stats Economisor
  economisorDir: path.join(os.homedir(), ".economisor"),
  // Pricing Claude Sonnet ($/1M tokens)
  pricing: {
    "claude-sonnet": { input: 3.0,   output: 15.0  },
    "claude-haiku":  { input: 0.25,  output: 1.25  },
    "claude-opus":   { input: 15.0,  output: 75.0  },
    "gpt-4o":        { input: 2.5,   output: 10.0  },
    "gpt-4o-mini":   { input: 0.15,  output: 0.6   },
    "deepseek":      { input: 0.14,  output: 0.28  },
    "gemini":        { input: 1.25,  output: 5.0   },
    "ollama":        { input: 0.0,   output: 0.0   },
    "default":       { input: 3.0,   output: 15.0  },
  },
  eurRate: 0.92,
  port: 4477,
  budgetAlert: 10, // € alerte
};

// ─────────────────────────────────────────────────────────────
// LECTURE SESSIONS CLAUDE CODE
// (Utilise la méthode OpenSwarm costTracker adaptée)
// ─────────────────────────────────────────────────────────────

function extractCostFromJson(output) {
  try {
    const match = output.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const arr = JSON.parse(match[0]);
    for (const item of arr) {
      if (item.type === "result") return extractFromResultEvent(item);
    }
  } catch {}
  return null;
}

function extractCostFromStreamJson(output) {
  try {
    const lines = output.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === "result") return extractFromResultEvent(event);
      } catch {}
    }
  } catch {}
  return null;
}

function extractFromResultEvent(event) {
  if (event.total_cost_usd == null && !event.usage) return null;
  return {
    costUsd:             event.total_cost_usd ?? 0,
    inputTokens:         event.usage?.input_tokens ?? 0,
    outputTokens:        event.usage?.output_tokens ?? 0,
    cacheReadTokens:     event.usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: event.usage?.cache_creation_input_tokens ?? 0,
    durationMs:          event.duration_ms ?? 0,
    model:               event.model ?? "claude-sonnet",
  };
}

function readJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (f.endsWith(".json") || f.endsWith(".jsonl")) {
          results.push(full);
        }
      } catch {}
    }
  };
  walk(dir);
  return results;
}


// Lire les tokens depuis les fichiers jsonl Claude Code
function readTokensFromJsonl(file) {
  let inputTokens = 0, outputTokens = 0, costUsd = 0, model = null;
  try {
    const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.usage) {
          inputTokens  += obj.usage.input_tokens  || 0;
          outputTokens += obj.usage.output_tokens || 0;
          if (!model && obj.model) model = obj.model;
        }
        if (obj.costUSD) costUsd += obj.costUSD;
        if (obj.message?.usage) {
          inputTokens  += obj.message.usage.input_tokens  || 0;
          outputTokens += obj.message.usage.output_tokens || 0;
          if (!model && obj.message.model) model = obj.message.model;
        }
        if (obj.type === "result" && obj.total_cost_usd) costUsd += obj.total_cost_usd;
        if (obj.type === "result" && obj.usage) {
          inputTokens  += obj.usage.input_tokens  || 0;
          outputTokens += obj.usage.output_tokens || 0;
        }
      } catch {}
    }
  } catch {}
  return { inputTokens, outputTokens, costUsd, model };
}

// ─────────────────────────────────────────────────────────────
// LECTURE STATS ECONOMISOR
// ─────────────────────────────────────────────────────────────

function readEconomisorStats() {
  const statsFile = path.join(CONFIG.economisorDir, "session_stats.json");
  if (!fs.existsSync(statsFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(statsFile, "utf-8"));
  } catch {}
  return null;
}

function readLicence() {
  const licenceFile = path.join(CONFIG.economisorDir, "licence", "licence.json");
  if (!fs.existsSync(licenceFile)) return { level: "FREE", economy: 75 };
  try {
    const data = JSON.parse(fs.readFileSync(licenceFile, "utf-8"));
    const economies = { FREE: 75, STARTER: 86, PRO: 96, ULTIMATE: 99 };
    return { level: data.level || "FREE", economy: economies[data.level] || 75 };
  } catch {}
  return { level: "FREE", economy: 75 };
}

// ─────────────────────────────────────────────────────────────
// MOTEUR D'ANALYSE
// ─────────────────────────────────────────────────────────────

function getPrice(model) {
  if (!model) return CONFIG.pricing["default"];
  const m = model.toLowerCase();
  for (const [key, price] of Object.entries(CONFIG.pricing)) {
    if (m.includes(key)) return price;
  }
  return CONFIG.pricing["default"];
}

function calcCostEur(inputTokens, outputTokens, model) {
  const price = getPrice(model);
  const usd = (inputTokens / 1_000_000) * price.input +
              (outputTokens / 1_000_000) * price.output;
  return usd * CONFIG.eurRate;
}

function tokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function analyze() {
  const licence     = readLicence();
  const ecoStats    = readEconomisorStats();

  let totalInput    = 0;
  let totalOutput   = 0;
  let totalCostEur  = 0;
  let totalSessions = 0;
  let byProvider    = {};
  let byDay         = {};
  let cacheHits     = 0;

  // Lire les fichiers de sessions Claude Code
  for (const dir of CONFIG.sessionDirs) {
    const files = readJsonFiles(dir);
    for (const file of files) {
      try {
        // Lire tokens depuis jsonl Claude Code
        const tokenData = readTokensFromJsonl(file);
        
        if (tokenData.inputTokens > 0 || tokenData.outputTokens > 0 || tokenData.costUsd > 0) {
          totalInput   += tokenData.inputTokens;
          totalOutput  += tokenData.outputTokens;
          totalSessions++;

          const model   = tokenData.model || "claude-sonnet";
          const costEur = tokenData.costUsd > 0 
            ? tokenData.costUsd * CONFIG.eurRate 
            : calcCostEur(tokenData.inputTokens, tokenData.outputTokens, model);
          totalCostEur += costEur;

          // Par provider
          const provider = model.includes("claude") ? "Anthropic" :
                           model.includes("gpt")    ? "OpenAI" :
                           model.includes("gemini") ? "Google" :
                           model.includes("deep")   ? "DeepSeek" :
                           model.includes("ollama") ? "Ollama (local)" : "Autre";

          if (!byProvider[provider]) byProvider[provider] = { tokens: 0, costEur: 0, calls: 0 };
          byProvider[provider].tokens  += tokenData.inputTokens + tokenData.outputTokens;
          byProvider[provider].costEur += costEur;
          byProvider[provider].calls++;

          // Par jour
          const day = new Date(fs.statSync(file).mtime).toISOString().slice(0, 10);
          if (!byDay[day]) byDay[day] = { tokens: 0, costEur: 0 };
          byDay[day].tokens  += tokenData.inputTokens + tokenData.outputTokens;
          byDay[day].costEur += costEur;

        }
      } catch {}
    }
  }

  // Calcul économies Economisor
  const totalTokens        = totalInput + totalOutput;
  const economy            = licence.economy / 100;
  const tokensWithout      = economy > 0 ? Math.round(totalTokens / (1 - economy)) : totalTokens;
  const tokensSaved        = tokensWithout - totalTokens;
  const costWithout        = calcCostEur(
    Math.round(tokensWithout * 0.7),
    Math.round(tokensWithout * 0.3),
    "claude-sonnet"
  );
  const costSavedEur       = Math.max(0, costWithout - totalCostEur);
  const roiMultiplier      = totalCostEur > 0 ? (costSavedEur / totalCostEur).toFixed(1) : "∞";

  // Stats Economisor MCP
  const mcpCalls    = ecoStats?.calls        || 0;
  const mcpCacheHits= ecoStats?.cache_hits   || 0;
  const mcpSaved    = ecoStats?.tokens_saved || 0;

  return {
    licence,
    sessions: totalSessions,
    tokens: {
      input:   totalInput,
      output:  totalOutput,
      total:   totalTokens,
      saved:   tokensSaved,
      without: tokensWithout,
    },
    cost: {
      realEur:    totalCostEur,
      withoutEur: costWithout,
      savedEur:   costSavedEur,
      roi:        roiMultiplier,
    },
    byProvider,
    byDay: Object.fromEntries(
      Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30)
    ),
    mcp: {
      calls:     mcpCalls,
      cacheHits: mcpCacheHits,
      tokensSaved: mcpSaved,
    },
    alert: totalCostEur > CONFIG.budgetAlert,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD HTML (design Black Smoke × Liquid Gold)
// ─────────────────────────────────────────────────────────────

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function generateHTML(data) {
  const providerRows = Object.entries(data.byProvider)
    .sort(([, a], [, b]) => b.costEur - a.costEur)
    .map(([name, v]) => `
      <tr>
        <td>${name}</td>
        <td>${formatNum(v.tokens)}</td>
        <td>${v.calls}</td>
        <td>${v.costEur.toFixed(4)}€</td>
      </tr>`).join("");

  const dayRows = Object.entries(data.byDay)
    .map(([day, v]) => `
      <tr>
        <td>${day}</td>
        <td>${formatNum(v.tokens)}</td>
        <td>${v.costEur.toFixed(4)}€</td>
      </tr>`).join("");

  const alertBanner = data.alert ? `
    <div class="alert">⚠️ ALERTE BUDGET — Dépenses > ${CONFIG.budgetAlert}€</div>` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Economisor — CodeBurn Dashboard</title>
  <style>
    :root {
      --bg:     #0B0B0D;
      --bg2:    #13131A;
      --bg3:    #1A1A24;
      --gold:   #D4AF37;
      --gold2:  #F0D060;
      --dim:    #555566;
      --white:  #E0E0F0;
      --green:  #00FF88;
      --red:    #FF4444;
      --blue:   #4488FF;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
      background: var(--bg);
      color: var(--white);
      padding: 0;
      min-height: 100vh;
    }
    header {
      background: var(--bg2);
      border-bottom: 1px solid var(--gold);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo { color: var(--gold); font-size: 20px; font-weight: bold; letter-spacing: 0.1em; }
    .logo span { color: var(--dim); font-size: 12px; margin-left: 8px; }
    .licence-badge {
      margin-left: auto;
      padding: 4px 12px;
      border: 1px solid var(--gold);
      color: var(--gold);
      font-size: 11px;
      letter-spacing: 0.15em;
    }
    .container { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .alert {
      background: #330000;
      border: 1px solid var(--red);
      color: var(--red);
      padding: 12px 20px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: var(--bg2);
      border: 1px solid #2A2A3A;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--gold);
      opacity: 0.5;
    }
    .card.highlight::before { opacity: 1; background: var(--green); }
    .card-label { color: var(--dim); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: bold; color: var(--gold2); }
    .card-value.green { color: var(--green); }
    .card-value.red   { color: var(--red); }
    .card-sub { color: var(--dim); font-size: 11px; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-title {
      color: var(--gold);
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #2A2A3A;
    }
    table { width: 100%; border-collapse: collapse; background: var(--bg2); }
    th {
      background: var(--bg3);
      color: var(--dim);
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 10px 16px;
      text-align: left;
    }
    td { padding: 10px 16px; border-bottom: 1px solid #1A1A2A; font-size: 13px; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg3); }
    .economy-bar {
      background: var(--bg3);
      border: 1px solid #2A2A3A;
      padding: 20px;
      margin-bottom: 24px;
    }
    .bar-wrap { background: #1A1A2A; height: 24px; border-radius: 2px; overflow: hidden; margin: 12px 0; }
    .bar-fill  { height: 100%; background: linear-gradient(90deg, var(--gold), var(--green)); border-radius: 2px; transition: width 1s; }
    .bar-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); }
    .footer { text-align: center; color: var(--dim); font-size: 10px; padding: 20px; letter-spacing: 0.1em; }
    .refresh { color: var(--gold); cursor: pointer; text-decoration: underline; }
  </style>
  <script>
    setTimeout(() => location.reload(), 30000); // Auto-refresh 30s
  </script>
</head>
<body>
  <header>
    <div class="logo">⚡ ECONOMISOR <span>CODEBURN PRO</span></div>
    <div class="licence-badge">${data.licence.level} — ${data.licence.economy}% ÉCONOMIE</div>
  </header>

  <div class="container">
    ${alertBanner}

    <!-- KPIs -->
    <div class="grid">
      <div class="card highlight">
        <div class="card-label">Économisé ce mois</div>
        <div class="card-value green">${data.cost.savedEur.toFixed(2)}€</div>
        <div class="card-sub">vs ${data.cost.withoutEur.toFixed(2)}€ sans Economisor</div>
      </div>
      <div class="card">
        <div class="card-label">Coût réel</div>
        <div class="card-value">${data.cost.realEur.toFixed(4)}€</div>
        <div class="card-sub">${data.sessions} sessions analysées</div>
      </div>
      <div class="card">
        <div class="card-label">Tokens économisés</div>
        <div class="card-value">${formatNum(data.tokens.saved)}</div>
        <div class="card-sub">sur ${formatNum(data.tokens.total)} consommés</div>
      </div>
      <div class="card">
        <div class="card-label">ROI Economisor</div>
        <div class="card-value gold">${data.cost.roi}x</div>
        <div class="card-sub">retour sur investissement</div>
      </div>
    </div>

    <!-- Barre économies -->
    <div class="economy-bar">
      <div class="section-title">Économie Economisor — Niveau ${data.licence.level}</div>
      <div class="bar-wrap">
        <div class="bar-fill" style="width:${data.licence.economy}%"></div>
      </div>
      <div class="bar-label">
        <span>0%</span>
        <span style="color:var(--gold)">${data.licence.economy}% d'économie</span>
        <span>100%</span>
      </div>
    </div>

    <!-- Par provider -->
    <div class="section">
      <div class="section-title">Où part ton argent — Par provider</div>
      <table>
        <thead>
          <tr><th>Provider</th><th>Tokens</th><th>Appels</th><th>Coût €</th></tr>
        </thead>
        <tbody>${providerRows || '<tr><td colspan="4" style="color:var(--dim);text-align:center">Aucune session détectée</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Par jour -->
    <div class="section">
      <div class="section-title">Historique journalier</div>
      <table>
        <thead>
          <tr><th>Date</th><th>Tokens</th><th>Coût €</th></tr>
        </thead>
        <tbody>${dayRows || '<tr><td colspan="3" style="color:var(--dim);text-align:center">Aucun historique</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Stats MCP Economisor -->
    <div class="section">
      <div class="section-title">Stats MCP Economisor (session courante)</div>
      <div class="grid">
        <div class="card">
          <div class="card-label">Appels MCP</div>
          <div class="card-value">${data.mcp.calls}</div>
        </div>
        <div class="card">
          <div class="card-label">Cache hits</div>
          <div class="card-value green">${data.mcp.cacheHits}</div>
        </div>
        <div class="card">
          <div class="card-label">Tokens MCP sauvés</div>
          <div class="card-value">${formatNum(data.mcp.tokensSaved)}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    Généré le ${new Date(data.generatedAt).toLocaleString("fr-FR")} —
    <span class="refresh" onclick="location.reload()">Actualiser</span> —
    Economisor par Novaquantic SAS
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// CLI OUTPUT
// ─────────────────────────────────────────────────────────────

function printCLI(data) {
  console.log("\n⚡ ECONOMISOR — CODEBURN PRO REPORT\n");
  console.log(`Licence : ${data.licence.level} (${data.licence.economy}% économie)`);
  console.log(`Sessions: ${data.sessions}\n`);

  console.log("💰 COÛTS");
  console.log(`  Réel         : ${data.cost.realEur.toFixed(4)}€`);
  console.log(`  Sans Economisor: ${data.cost.withoutEur.toFixed(4)}€`);
  console.log(`  ÉCONOMISÉ    : ${data.cost.savedEur.toFixed(4)}€ (ROI ${data.cost.roi}x)`);

  console.log("\n📊 TOKENS");
  console.log(`  Consommés    : ${formatNum(data.tokens.total)}`);
  console.log(`  Économisés   : ${formatNum(data.tokens.saved)}`);
  console.log(`  Sans Econo   : ${formatNum(data.tokens.without)}`);

  if (Object.keys(data.byProvider).length > 0) {
    console.log("\n🌐 PAR PROVIDER");
    for (const [p, v] of Object.entries(data.byProvider)) {
      console.log(`  ${p.padEnd(20)} ${formatNum(v.tokens).padStart(8)} tokens  ${v.costEur.toFixed(4)}€`);
    }
  }

  if (data.alert) {
    console.log(`\n🚨 ALERTE BUDGET > ${CONFIG.budgetAlert}€`);
  }

  console.log(`\n✅ Dashboard : http://localhost:${CONFIG.port}\n`);
}

// ─────────────────────────────────────────────────────────────
// SERVEUR HTTP DASHBOARD
// ─────────────────────────────────────────────────────────────

function startServer() {
  const server = http.createServer((req, res) => {
    const data = analyze();

    if (req.url === "/api") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data, null, 2));
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generateHTML(data));
    }
  });

  server.listen(CONFIG.port, "127.0.0.1", () => {
    console.log(`\n⚡ CodeBurn Dashboard → http://localhost:${CONFIG.port}\n`);
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

(function main() {
  const args = process.argv.slice(2);
  const data = analyze();

  if (args.includes("--json")) {
    const out = "codeburn_report.json";
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(`✅ ${out} généré`);
    return;
  }

  if (args.includes("--html")) {
    const out = "codeburn_dashboard.html";
    fs.writeFileSync(out, generateHTML(data));
    console.log(`✅ ${out} généré → ouvre dans ton navigateur`);
    return;
  }

  // Par défaut : CLI + serveur dashboard
  printCLI(data);
  startServer();
})();
