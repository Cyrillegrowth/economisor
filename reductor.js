#!/usr/bin/env node
'use strict';

// Charger .env automatiquement
try { require('dotenv').config(); } catch {}

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const VERSION = '2.0.0';
const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, '.reductor-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'responses.json');
const METRICS_FILE = path.join(CACHE_DIR, 'metrics.json');

const CONFIG = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  apiKey: process.env.REDUCTOR_GATEWAY_API_KEY || '',
  defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-4.1-mini',
  defaultAnthropicModel: process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  defaultGeminiModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash',
  defaultOpenRouterModel: process.env.DEFAULT_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  defaultDeepSeekModel: process.env.DEFAULT_DEEPSEEK_MODEL || 'deepseek-chat',
  defaultOllamaModel: process.env.DEFAULT_OLLAMA_MODEL || 'llama3.1:8b',
  defaultNimModel: process.env.DEFAULT_NIM_MODEL || 'meta/llama-3.1-8b-instruct',
  openaiKey: process.env.OPENAI_API_KEY || '',
  nimKey: process.env.NIM_API_KEY || '',
  nimBaseUrl: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  deepseekKey: process.env.DEEPSEEK_API_KEY || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  maxPromptChars: Number(process.env.MAX_PROMPT_CHARS || 28000),
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 6 * 60 * 60 * 1000),
  enableCompression: (process.env.ENABLE_PROMPT_COMPRESSION || 'true') === 'true',
  enablePersistentCache: (process.env.ENABLE_PERSISTENT_CACHE || 'true') === 'true',
  enableMetricsPersist: (process.env.ENABLE_METRICS_PERSIST || 'true') === 'true',
  requestsPerMinute: Number(process.env.REQUESTS_PER_MINUTE || 120),
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 120000),
  defaultBudget: process.env.DEFAULT_BUDGET || 'balanced',
  logLevel: process.env.LOG_LEVEL || 'info'
};

const PROVIDER_PROFILES = {
  openai: { cost: 3, speed: 4, quality: 4 },
  anthropic: { cost: 4, speed: 3, quality: 5 },
  gemini: { cost: 2, speed: 5, quality: 4 },
  openrouter: { cost: 3, speed: 4, quality: 4 },
  deepseek: { cost: 1, speed: 4, quality: 3 },
  ollama: { cost: 0, speed: 3, quality: 2 },
  nim: { cost: 0, speed: 5, quality: 3 }
};

function log(level, message, extra) {
  const levels = ['error', 'warn', 'info', 'debug'];
  if (levels.indexOf(level) > levels.indexOf(CONFIG.logLevel)) return;
  const payload = { ts: new Date().toISOString(), level, message };
  if (extra !== undefined) payload.extra = extra;
  process.stderr.write(JSON.stringify(payload) + '\n');
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function sha256(input) { return crypto.createHash('sha256').update(String(input)).digest('hex'); }
// Comptage tokens précis via tiktoken
let _encoder = null;
function getEncoder() {
  if (!_encoder) {
    try {
      const { get_encoding } = require('tiktoken');
      _encoder = get_encoding('cl100k_base');
    } catch { _encoder = null; }
  }
  return _encoder;
}

function approximateTokens(text) {
  const enc = getEncoder();
  if (enc) {
    try { return enc.encode(String(text || '')).length; } catch {}
  }
  return Math.ceil(String(text || '').length / 4);
}

function countTokensFromMessages(messages, tools) {
  const enc = getEncoder();
  if (!enc) return messages.reduce((t, m) => t + approximateTokens(normalizeContentToText(m.content)) + 4, 0);
  let total = 0;
  for (const msg of messages) {
    const text = normalizeContentToText(msg.content);
    try { total += enc.encode(text).length + 4; } catch { total += Math.ceil(text.length / 4) + 4; }
  }
  if (tools && tools.length) total += tools.length * 5;
  return Math.max(1, total);
}
function now() { return Date.now(); }

class PersistentCache {
  constructor(file, ttlMs) {
    this.file = file;
    this.ttlMs = ttlMs;
    this.map = new Map();
    if (CONFIG.enablePersistentCache) this.load();
  }
  load() {
    ensureDir(CACHE_DIR);
    const data = readJson(this.file, {});
    for (const [k, v] of Object.entries(data)) {
      if (v && now() - v.ts < this.ttlMs) this.map.set(k, v);
    }
  }
  save() {
    if (!CONFIG.enablePersistentCache) return;
    ensureDir(CACHE_DIR);
    const out = {};
    for (const [k, v] of this.map.entries()) if (now() - v.ts < this.ttlMs) out[k] = v;
    fs.writeFileSync(this.file, JSON.stringify(out, null, 2));
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (now() - hit.ts >= this.ttlMs) { this.map.delete(key); return null; }
    return hit.value;
  }
  set(key, value) { this.map.set(key, { ts: now(), value }); this.save(); }
}

const cache = new PersistentCache(CACHE_FILE, CONFIG.cacheTtlMs);
const rateBuckets = new Map();
const metrics = loadMetrics();

function loadMetrics() {
  const base = readJson(METRICS_FILE, null);
  return base || {
    startedAt: new Date().toISOString(),
    requests: 0,
    cacheHits: 0,
    providerCalls: {},
    providerFailures: {},
    providerLatencyMs: {},
    estimatedTokensIn: 0,
    estimatedTokensOut: 0,
    lastErrors: []
  };
}
function saveMetrics() {
  if (!CONFIG.enableMetricsPersist) return;
  ensureDir(CACHE_DIR);
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}
function bump(obj, key, delta = 1) { obj[key] = (obj[key] || 0) + delta; }

function normalizeContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item.text === 'string') return item.text;
      if (item && item.type === 'text' && typeof item.text === 'string') return item.text;
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content.text === 'string') return content.text;
  return JSON.stringify(content || '');
}

// ─── OPTIMISATIONS LOCALES (5 fast-path handlers) ────────────────────────────

function extractTextFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  return messages.map((m) => normalizeContentToText(m.content)).join('\n');
}

function isQuotaCheckRequest(body) {
  if (body.max_tokens !== 1) return false;
  if (!Array.isArray(body.messages) || body.messages.length !== 1) return false;
  if (body.messages[0].role !== 'user') return false;
  const text = normalizeContentToText(body.messages[0].content).toLowerCase();
  return text.includes('quota');
}

function isTitleGenerationRequest(body) {
  if (!body.system || body.tools?.length) return false;
  const sys = normalizeContentToText(body.system).toLowerCase();
  return sys.includes('new conversation topic') && sys.includes('title');
}

function isPrefixDetectionRequest(body) {
  if (!Array.isArray(body.messages) || body.messages.length !== 1) return [false, ''];
  if (body.messages[0].role !== 'user') return [false, ''];
  const content = normalizeContentToText(body.messages[0].content);
  if (content.includes('<policy_spec>') && content.includes('Command:')) {
    const idx = content.lastIndexOf('Command:') + 'Command:'.length;
    return [true, content.slice(idx).trim()];
  }
  return [false, ''];
}

function extractCommandPrefix(command) {
  const trimmed = command.trim();
  const match = trimmed.match(/^([a-zA-Z0-9_\-./]+)/);
  return match ? match[1] : trimmed.split(' ')[0] || '';
}

function isSuggestionModeRequest(body) {
  if (!Array.isArray(body.messages)) return false;
  return body.messages.some((m) => m.role === 'user' && normalizeContentToText(m.content).includes('[SUGGESTION MODE:'));
}

function isFilepathExtractionRequest(body) {
  if (!Array.isArray(body.messages) || body.messages.length !== 1) return [false, '', ''];
  if (body.messages[0].role !== 'user') return [false, '', ''];
  if (body.tools?.length) return [false, '', ''];
  const content = normalizeContentToText(body.messages[0].content);
  if (!content.includes('Command:') || !content.includes('Output:')) return [false, '', ''];
  const contentLow = content.toLowerCase();
  const sysText = body.system ? normalizeContentToText(body.system).toLowerCase() : '';
  const hasFilepaths = contentLow.includes('filepaths') || contentLow.includes('<filepaths>');
  const sysHasExtract = sysText.includes('extract any file paths') || sysText.includes('file paths that this command');
  if (!hasFilepaths && !sysHasExtract) return [false, '', ''];
  try {
    const cmdStart = content.indexOf('Command:') + 'Command:'.length;
    const outMarker = content.indexOf('Output:', cmdStart);
    if (outMarker === -1) return [false, '', ''];
    const command = content.slice(cmdStart, outMarker).trim();
    let output = content.slice(outMarker + 'Output:'.length).trim();
    for (const marker of ['<', '\n\n']) { if (output.includes(marker)) output = output.split(marker)[0].trim(); }
    return [true, command, output];
  } catch { return [false, '', '']; }
}

function extractFilepathsFromOutput(output) {
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
  const paths = lines.filter((l) => l.match(/^[a-zA-Z0-9_./:~\\-]/));
  return paths.join('\n');
}

function makeOptimizedResponse(model, text, inputTokens = 100, outputTokens = 5) {
  const id = `msg_opt_${sha256(String(now())).slice(0, 16)}`;
  return { provider: 'local', model, text, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens }, meta: { estimated_cost_usd: 0, optimized: true }, id };
}

function tryOptimizations(body) {
  // 1. Quota mock
  if (isQuotaCheckRequest(body)) {
    log('info', 'OPT: quota mock');
    metrics.requests += 1;
    bump(metrics.providerCalls, 'local');
    return makeOptimizedResponse(body.model, 'Quota check passed.', 10, 5);
  }
  // 2. Prefix detection
  const [isPrefix, cmd] = isPrefixDetectionRequest(body);
  if (isPrefix) {
    log('info', 'OPT: prefix detection');
    metrics.requests += 1;
    bump(metrics.providerCalls, 'local');
    return makeOptimizedResponse(body.model, extractCommandPrefix(cmd), 100, 5);
  }
  // 3. Title skip
  if (isTitleGenerationRequest(body)) {
    log('info', 'OPT: title skip');
    metrics.requests += 1;
    bump(metrics.providerCalls, 'local');
    return makeOptimizedResponse(body.model, 'Conversation', 100, 5);
  }
  // 4. Suggestion skip
  if (isSuggestionModeRequest(body)) {
    log('info', 'OPT: suggestion skip');
    metrics.requests += 1;
    bump(metrics.providerCalls, 'local');
    return makeOptimizedResponse(body.model, '', 100, 1);
  }
  // 5. Filepath mock
  const [isFP, , output] = isFilepathExtractionRequest(body);
  if (isFP) {
    log('info', 'OPT: filepath mock');
    metrics.requests += 1;
    bump(metrics.providerCalls, 'local');
    return makeOptimizedResponse(body.model, extractFilepathsFromOutput(output), 100, 10);
  }
  return null;
}

// ─── FIN OPTIMISATIONS ────────────────────────────────────────────────────────

function compactText(text) {
  let out = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!CONFIG.enableCompression) return out;
  const seen = new Set();
  out = out.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  }).join('\n');
  if (out.length > CONFIG.maxPromptChars) out = out.slice(0, CONFIG.maxPromptChars) + '\n...[truncated by REDUCTOR GATEWAY X+ ULTIMATE]';
  return out;
}

function compressMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({ role: m.role || 'user', content: compactText(normalizeContentToText(m.content)) }));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function writeJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,x-api-key',
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function sseHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*'
  });
}
function sseData(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }

function requireAuth(req, res) {
  if (!CONFIG.apiKey) return true;
  const got = req.headers['x-api-key'] || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (got === CONFIG.apiKey) return true;
  writeJson(res, 401, { error: { message: 'Unauthorized' } });
  return false;
}

function enforceRateLimit(req, res) {
  const ip = req.socket.remoteAddress || 'local';
  const slot = Math.floor(now() / 60000);
  const key = `${ip}:${slot}`;
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  if (count > CONFIG.requestsPerMinute) {
    writeJson(res, 429, { error: { message: 'Rate limit exceeded' } });
    return false;
  }
  return true;
}

function providerAvailability() {
  return {
    openai: !!CONFIG.openaiKey,
    anthropic: !!CONFIG.anthropicKey,
    gemini: !!CONFIG.geminiKey,
    openrouter: !!CONFIG.openrouterKey,
    deepseek: !!CONFIG.deepseekKey,
    ollama: !!CONFIG.ollamaBaseUrl,
    nim: !!CONFIG.nimKey
  };
}

function chooseProvider({ requestedProvider, budget = CONFIG.defaultBudget }) {
  const available = providerAvailability();
  if (requestedProvider && available[requestedProvider]) return requestedProvider;
  const candidates = Object.keys(available).filter((p) => available[p]);
  if (!candidates.length) throw new Error('No provider configured');
  const bias = budget === 'cheap' ? ['ollama', 'nim', 'deepseek', 'gemini', 'openrouter', 'openai', 'anthropic']
    : budget === 'quality' ? ['anthropic', 'openai', 'gemini', 'openrouter', 'deepseek', 'nim', 'ollama']
    : ['gemini', 'openai', 'nim', 'deepseek', 'openrouter', 'anthropic', 'ollama'];
  for (const p of bias) if (candidates.includes(p)) return p;
  return candidates[0];
}

function fallbackOrder(primary, budget) {
  const order = [];
  const all = ['openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'ollama', 'nim'];
  const avail = providerAvailability();
  const preferred = [primary, chooseProvider({ budget })].concat(all);
  for (const p of preferred) if (avail[p] && !order.includes(p)) order.push(p);
  return order;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function estimateCost(provider, usage) {
  const total = usage?.total_tokens || 0;
  const factor = { openai: 0.000003, anthropic: 0.000005, gemini: 0.0000015, openrouter: 0.000003, deepseek: 0.000001, ollama: 0, nim: 0 };
  return +(total * (factor[provider] || 0)).toFixed(6);
}

function normalizeTextResult(provider, model, text, usageData, meta = {}) {
  const promptTokens = usageData?.prompt_tokens || usageData?.input_tokens || usageData?.promptTokenCount || usageData?.prompt_eval_count || 0;
  const completionTokens = usageData?.completion_tokens || usageData?.output_tokens || usageData?.candidatesTokenCount || usageData?.eval_count || approximateTokens(text);
  const totalTokens = usageData?.total_tokens || usageData?.totalTokenCount || promptTokens + completionTokens;
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens };
  return { provider, model, text, usage, meta: { ...meta, estimated_cost_usd: estimateCost(provider, usage) } };
}

function modelForProvider(provider, requestedModel) {
  if (requestedModel) return requestedModel;
  return {
    openai: CONFIG.defaultModel,
    anthropic: CONFIG.defaultAnthropicModel,
    gemini: CONFIG.defaultGeminiModel,
    openrouter: CONFIG.defaultOpenRouterModel,
    deepseek: CONFIG.defaultDeepSeekModel,
    ollama: CONFIG.defaultOllamaModel,
    nim: CONFIG.defaultNimModel
  }[provider];
}

async function callProvider({ provider, model, messages, temperature, max_tokens, stream }) {
  const compressedMessages = compressMessages(messages);
  const inputText = compressedMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  metrics.estimatedTokensIn += approximateTokens(inputText);
  const cacheKey = sha256(JSON.stringify({ provider, model, temperature, max_tokens, inputText }));
  if (!stream) {
    const hit = cache.get(cacheKey);
    if (hit) {
      metrics.cacheHits += 1;
      return { ...hit, cached: true };
    }
  }
  const started = now();
  bump(metrics.providerCalls, provider);
  let out;
  try {
    if (provider === 'openai') out = await callOpenAI({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'anthropic') out = await callAnthropic({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'gemini') out = await callGemini({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'openrouter') out = await callOpenRouter({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'deepseek') out = await callDeepSeek({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'ollama') out = await callOllama({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else if (provider === 'nim') out = await callNim({ model, messages: compressedMessages, temperature, max_tokens, stream });
    else throw new Error(`Unsupported provider: ${provider}`);
  } catch (err) {
    bump(metrics.providerFailures, provider);
    throw err;
  } finally {
    metrics.providerLatencyMs[provider] = Math.round(((metrics.providerLatencyMs[provider] || 0) + (now() - started)) / 2);
    saveMetrics();
  }
  if (!stream) {
    cache.set(cacheKey, out);
    metrics.estimatedTokensOut += out.usage?.completion_tokens || 0;
  }
  return out;
}

async function tryProviders(args) {
  const order = fallbackOrder(args.provider, args.budget);
  let lastErr;
  for (const p of order) {
    try {
      return await callProvider({ ...args, provider: p, model: modelForProvider(p, args.model) });
    } catch (err) {
      lastErr = err;
      metrics.lastErrors.unshift({ ts: new Date().toISOString(), provider: p, message: err.message, status: err.status || 0 });
      metrics.lastErrors = metrics.lastErrors.slice(0, 20);
      log('warn', 'provider failed, trying fallback', { provider: p, message: err.message });
    }
  }
  throw lastErr || new Error('No provider succeeded');
}

async function callOpenAI({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.openaiKey) throw new Error('OPENAI_API_KEY missing');
  const body = { model, messages, temperature, max_tokens, stream: !!stream };
  if (!stream) {
    const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${CONFIG.openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = data.choices?.[0]?.message?.content || '';
    return normalizeTextResult('openai', model, text, data.usage);
  }
  return { streamUrl: 'https://api.openai.com/v1/chat/completions', headers: { Authorization: `Bearer ${CONFIG.openaiKey}`, 'Content-Type': 'application/json' }, body, transport: 'sse-openai' };
}

async function callAnthropic({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.anthropicKey) throw new Error('ANTHROPIC_API_KEY missing');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const body = {
    model, max_tokens: max_tokens || 1024, temperature, stream: !!stream,
    system: system || undefined,
    messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  };
  if (!stream) {
    const data = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': CONFIG.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = (data.content || []).map((c) => c.text || '').join('');
    return normalizeTextResult('anthropic', model, text, data.usage);
  }
  return { streamUrl: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': CONFIG.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, transport: 'sse-anthropic' };
}

async function callGemini({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.geminiKey) throw new Error('GEMINI_API_KEY missing');
  const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: max_tokens || 1024 } };
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  if (!stream) {
    const data = await fetchJson(`${base}:generateContent?key=${encodeURIComponent(CONFIG.geminiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = (data.candidates || []).flatMap((c) => c.content?.parts || []).map((p) => p.text || '').join('');
    return normalizeTextResult('gemini', model, text, data.usageMetadata || null);
  }
  return { streamUrl: `${base}:streamGenerateContent?alt=sse&key=${encodeURIComponent(CONFIG.geminiKey)}`, headers: { 'content-type': 'application/json' }, body, transport: 'sse-gemini' };
}

async function callOpenRouter({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.openrouterKey) throw new Error('OPENROUTER_API_KEY missing');
  const body = { model, messages, temperature, max_tokens, stream: !!stream };
  if (!stream) {
    const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${CONFIG.openrouterKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = data.choices?.[0]?.message?.content || '';
    return normalizeTextResult('openrouter', model, text, data.usage);
  }
  return { streamUrl: 'https://openrouter.ai/api/v1/chat/completions', headers: { Authorization: `Bearer ${CONFIG.openrouterKey}`, 'Content-Type': 'application/json' }, body, transport: 'sse-openai' };
}

async function callDeepSeek({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.deepseekKey) throw new Error('DEEPSEEK_API_KEY missing');
  const body = { model, messages, temperature, max_tokens, stream: !!stream };
  if (!stream) {
    const data = await fetchJson('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${CONFIG.deepseekKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = data.choices?.[0]?.message?.content || '';
    return normalizeTextResult('deepseek', model, text, data.usage);
  }
  return { streamUrl: 'https://api.deepseek.com/chat/completions', headers: { Authorization: `Bearer ${CONFIG.deepseekKey}`, 'Content-Type': 'application/json' }, body, transport: 'sse-openai' };
}

async function callOllama({ model, messages, temperature, max_tokens, stream }) {
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  const body = { model, prompt, stream: !!stream, options: { temperature, num_predict: max_tokens || 1024 } };
  const base = CONFIG.ollamaBaseUrl.replace(/\/$/, '');
  if (!stream) {
    const data = await fetchJson(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return normalizeTextResult('ollama', model, data.response || '', data);
  }
  return { streamUrl: `${base}/api/generate`, headers: { 'Content-Type': 'application/json' }, body, transport: 'ndjson-ollama' };
}

async function callNim({ model, messages, temperature, max_tokens, stream }) {
  if (!CONFIG.nimKey) throw new Error('NIM_API_KEY missing');
  const base = CONFIG.nimBaseUrl.replace(/\/$/, '');
  // Filtrer les messages system pour NIM
  const nimMessages = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  if (nimMessages.length === 0) nimMessages.push({ role: 'user', content: messages.map((m) => m.content).join('\n') });
  const body = {
    model,
    messages: nimMessages,
    temperature: temperature ?? 1,
    top_p: 1,
    max_tokens: max_tokens || 4096,
    stream: !!stream
  };
  if (!stream) {
    const data = await fetchJson(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CONFIG.nimKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = data.choices?.[0]?.message?.content || '';
    return normalizeTextResult('nim', model, text, data.usage);
  }
  return { streamUrl: `${base}/chat/completions`, headers: { Authorization: `Bearer ${CONFIG.nimKey}`, 'Content-Type': 'application/json' }, body, transport: 'sse-openai' };
}

function openAIEnvelope(result, requestModel) {
  return {
    id: `chatcmpl_${sha256(String(now())).slice(0, 24)}`,
    object: 'chat.completion',
    created: Math.floor(now() / 1000),
    model: requestModel || result.model,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: result.text } }],
    usage: result.usage,
    reductor: { provider: result.provider, cached: !!result.cached, estimated_cost_usd: result.meta?.estimated_cost_usd || 0 }
  };
}
function anthropicEnvelope(result) {
  return {
    id: `msg_${sha256(String(now())).slice(0, 24)}`,
    type: 'message', role: 'assistant', model: result.model,
    content: [{ type: 'text', text: result.text }], stop_reason: 'end_turn',
    usage: { input_tokens: result.usage?.prompt_tokens || 0, output_tokens: result.usage?.completion_tokens || 0 },
    reductor: { provider: result.provider, cached: !!result.cached, estimated_cost_usd: result.meta?.estimated_cost_usd || 0 }
  };
}
function geminiEnvelope(result) {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text: result.text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: result.usage?.prompt_tokens || 0, candidatesTokenCount: result.usage?.completion_tokens || 0, totalTokenCount: result.usage?.total_tokens || 0 },
    reductor: { provider: result.provider, cached: !!result.cached, estimated_cost_usd: result.meta?.estimated_cost_usd || 0 }
  };
}

async function streamToOpenAISSE(res, upstreamSpec, model) {
  sseHeaders(res);
  const upstream = await fetch(upstreamSpec.streamUrl, { method: 'POST', headers: upstreamSpec.headers, body: JSON.stringify(upstreamSpec.body) });
  if (!upstream.ok || !upstream.body) { sseData(res, { error: { message: `Upstream error ${upstream.status}` } }); res.end('data: [DONE]\n\n'); return; }
  const decoder = new TextDecoder();
  let buffer = '';

  const emit = (token, finish = null) => {
    sseData(res, { id: `chatcmpl_${sha256(String(now())).slice(0, 24)}`, object: 'chat.completion.chunk', created: Math.floor(now() / 1000), model, choices: [{ index: 0, delta: token ? { content: token } : {}, finish_reason: finish }] });
  };

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (upstreamSpec.transport === 'ndjson-ollama') {
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) emit(data.response, null);
          if (data.done) { emit('', 'stop'); res.end('data: [DONE]\n\n'); return; }
        } catch {}
      }
      continue;
    }

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const eventBlock = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = eventBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      for (const d of dataLines) {
        if (!d || d === '[DONE]') { emit('', 'stop'); res.end('data: [DONE]\n\n'); return; }
        try {
          const obj = JSON.parse(d);
          if (upstreamSpec.transport === 'sse-openai') {
            const tok = obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.message?.content || '';
            if (tok) emit(tok, null);
            if (obj.choices?.[0]?.finish_reason) { emit('', obj.choices[0].finish_reason); res.end('data: [DONE]\n\n'); return; }
          } else if (upstreamSpec.transport === 'sse-anthropic') {
            if (obj.type === 'content_block_delta' && obj.delta?.text) emit(obj.delta.text, null);
            if (obj.type === 'message_stop') { emit('', 'stop'); res.end('data: [DONE]\n\n'); return; }
          } else if (upstreamSpec.transport === 'sse-gemini') {
            const tok = (obj.candidates || []).flatMap((c) => c.content?.parts || []).map((p) => p.text || '').join('');
            if (tok) emit(tok, null);
          }
        } catch {}
      }
    }
  }
  emit('', 'stop');
  res.end('data: [DONE]\n\n');
}

async function handleChatLike(reqBody, mode, res) {
  // Fast-path optimisations locales
  const optimized = tryOptimizations(reqBody);
  if (optimized) {
    saveMetrics();
    if (mode === 'openai') return writeJson(res, 200, openAIEnvelope(optimized, optimized.model));
    if (mode === 'anthropic') return writeJson(res, 200, anthropicEnvelope(optimized));
    if (mode === 'gemini') return writeJson(res, 200, geminiEnvelope(optimized));
    return writeJson(res, 200, optimized);
  }
  const provider = reqBody.provider || reqBody.metadata?.provider || null;
  const budget = reqBody.budget || reqBody.metadata?.budget || CONFIG.defaultBudget;
  const model = reqBody.model || null;
  const temperature = reqBody.temperature;
  const max_tokens = reqBody.max_tokens || reqBody.max_completion_tokens || reqBody.maxOutputTokens;

  let messages;
  if (mode === 'openai') messages = reqBody.messages || [];
  else if (mode === 'anthropic') {
    const system = reqBody.system ? [{ role: 'system', content: reqBody.system }] : [];
    messages = system.concat((reqBody.messages || []).map((m) => ({ role: m.role, content: normalizeContentToText(m.content) })));
  } else if (mode === 'gemini') {
    const prompt = (reqBody.contents || []).flatMap((c) => c.parts || []).map((p) => p.text || '').join('\n');
    messages = [{ role: 'user', content: prompt }];
  } else messages = [];

  if (reqBody.stream) {
    const primary = chooseProvider({ requestedProvider: provider, budget });
    try {
      const upstreamSpec = await callProvider({ provider: primary, model: modelForProvider(primary, model), messages, temperature, max_tokens, stream: true });
      await streamToOpenAISSE(res, upstreamSpec, modelForProvider(primary, model));
    } catch (err) {
      writeJson(res, err.status || 502, { error: { message: err.message, details: err.data || null } });
    }
    return;
  }

  const result = await tryProviders({ provider, budget, model, messages, temperature, max_tokens, stream: false });
  metrics.requests += 1;
  saveMetrics();
  if (mode === 'openai') return writeJson(res, 200, openAIEnvelope(result, model));
  if (mode === 'anthropic') return writeJson(res, 200, anthropicEnvelope(result));
  if (mode === 'gemini') return writeJson(res, 200, geminiEnvelope(result));
  return writeJson(res, 200, result);
}

function healthPayload() {
  return {
    ok: true,
    version: VERSION,
    mode: 'http',
    providers: providerAvailability(),
    metrics,
    config: { defaultProvider: CONFIG.defaultProvider, defaultBudget: CONFIG.defaultBudget, compression: CONFIG.enableCompression, persistentCache: CONFIG.enablePersistentCache }
  };
}

function mcpError(id, code, message, data) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }; }
function mcpResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function mcpText(content) { return { content: [{ type: 'text', text: content }] }; }

async function handleMcpMessage(msg) {
  const id = msg.id;
  try {
    if (msg.method === 'initialize') {
      return mcpResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'reductor-gateway-xplus', version: VERSION }
      });
    }
    if (msg.method === 'notifications/initialized') return null;
    if (msg.method === 'tools/list') {
      return mcpResult(id, {
        tools: [
          { name: 'gateway_health', description: 'Return health and metrics', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
          { name: 'gateway_models', description: 'Return available providers and default models', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
          { name: 'gateway_chat', description: 'Run one normalized chat request', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, budget: { type: 'string' } }, required: ['prompt'], additionalProperties: false } },
          { name: 'gateway_metrics', description: 'Return persisted gateway metrics', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
        ]
      });
    }
    if (msg.method === 'tools/call') {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      if (name === 'gateway_health') return mcpResult(id, mcpText(JSON.stringify(healthPayload(), null, 2)));
      if (name === 'gateway_models') return mcpResult(id, mcpText(JSON.stringify({ providers: providerAvailability(), defaults: { openai: CONFIG.defaultModel, anthropic: CONFIG.defaultAnthropicModel, gemini: CONFIG.defaultGeminiModel, openrouter: CONFIG.defaultOpenRouterModel, deepseek: CONFIG.defaultDeepSeekModel, ollama: CONFIG.defaultOllamaModel, nim: CONFIG.defaultNimModel } }, null, 2)));
      if (name === 'gateway_metrics') return mcpResult(id, mcpText(JSON.stringify(metrics, null, 2)));
      if (name === 'gateway_chat') {
        const result = await tryProviders({ provider: args.provider || null, budget: args.budget || CONFIG.defaultBudget, model: args.model || null, messages: [{ role: 'user', content: args.prompt }], stream: false });
        return mcpResult(id, mcpText(JSON.stringify(result, null, 2)));
      }
      return mcpError(id, -32601, 'Tool not found');
    }
    return mcpError(id, -32601, 'Method not found');
  } catch (err) {
    return mcpError(id, -32000, err.message, err.data || null);
  }
}

function startMcpStdio() {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) {
        process.stdout.write(JSON.stringify(mcpError(null, -32700, 'Parse error')) + '\n');
        continue;
      }
      const out = await handleMcpMessage(msg);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  });
  log('info', 'MCP stdio started');
}

async function handleHttp(req, res) {
  if (req.method === 'OPTIONS') return writeJson(res, 204, {});
  if (!requireAuth(req, res)) return;
  if (!enforceRateLimit(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return writeJson(res, 200, healthPayload());
  if (req.method === 'GET' && url.pathname === '/metrics') return writeJson(res, 200, metrics);
  if (req.method === 'GET' && url.pathname === '/manifest') return writeJson(res, 200, { name: 'reductor-gateway-xplus', version: VERSION, endpoints: ['/health', '/metrics', '/v1/chat/completions', '/v1/messages', '/v1beta/models/:model:generateContent'] });
  if (req.method === 'GET' && url.pathname === '/models') return writeJson(res, 200, { providers: providerAvailability(), defaults: { openai: CONFIG.defaultModel, anthropic: CONFIG.defaultAnthropicModel, gemini: CONFIG.defaultGeminiModel, openrouter: CONFIG.defaultOpenRouterModel, deepseek: CONFIG.defaultDeepSeekModel, ollama: CONFIG.defaultOllamaModel, nim: CONFIG.defaultNimModel } });

  if (req.method === 'POST' && (url.pathname === '/v1/chat/completions' || url.pathname === '/v1/messages' || /^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname) || /^\/v1beta\/models\/[^/]+:streamGenerateContent$/.test(url.pathname))) {
    try {
      const body = JSON.parse(await collectBody(req) || '{}');
      if (url.pathname === '/v1/chat/completions') return await handleChatLike(body, 'openai', res);
      if (url.pathname === '/v1/messages') return await handleChatLike(body, 'anthropic', res);
      if (url.pathname.includes(':generateContent') || url.pathname.includes(':streamGenerateContent')) return await handleChatLike({ ...body, stream: url.pathname.includes(':streamGenerateContent') ? true : !!body.stream }, 'gemini', res);
    } catch (err) {
      metrics.lastErrors.unshift({ ts: new Date().toISOString(), message: err.message });
      metrics.lastErrors = metrics.lastErrors.slice(0, 20);
      return writeJson(res, err.status || 500, { error: { message: err.message, details: err.data || null } });
    }
  }

  return writeJson(res, 404, { error: { message: 'Not found' } });
}

if (process.argv.includes('--mcp')) startMcpStdio();
else {
  const server = http.createServer((req, res) => {
    handleHttp(req, res).catch((err) => {
      log('error', 'unhandled request error', { message: err.message, stack: err.stack });
      writeJson(res, 500, { error: { message: err.message } });
    });
  });
  server.listen(CONFIG.port, CONFIG.host, () => {
    log('info', 'REDUCTOR GATEWAY X+ ULTIMATE started', { host: CONFIG.host, port: CONFIG.port, version: VERSION });
  });
}
