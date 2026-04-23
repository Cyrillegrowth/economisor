#!/usr/bin/env node
'use strict';

// Charger .env
try { require('dotenv').config(); } catch {}

const https = require('https');
const http = require('http');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8469988518:AAHsfT3nD91guC_1FkRM_wZzJd7D7dcbb7s';
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5547778271';
const CODEBURN_URL = process.env.CODEBURN_URL || 'http://localhost:4477';
const REDUCTOR_URL = process.env.REDUCTOR_URL || 'http://localhost:8787';

let lastUpdateId = 0;

function tgRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendMessage(chatId, text, parseMode = 'Markdown') {
  return tgRequest('sendMessage', { chat_id: chatId, text, parse_mode: parseMode });
}

function fetchLocal(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

async function getStats() {
  try {
    const health = await fetchLocal(`${REDUCTOR_URL}/health`);
    const metrics = health?.metrics || {};
    return {
      requests: metrics.requests || 0,
      cacheHits: metrics.cacheHits || 0,
      tokensIn: metrics.estimatedTokensIn || 0,
      tokensOut: metrics.estimatedTokensOut || 0,
      providers: health?.providers || {},
      errors: metrics.lastErrors?.length || 0
    };
  } catch { return null; }
}

async function handleCommand(chatId, text) {
  if (String(chatId) !== ALLOWED_CHAT_ID) {
    return sendMessage(chatId, '❌ Accès non autorisé.');
  }

  const cmd = text.trim().toLowerCase();

  if (cmd === '/start' || cmd === '/aide' || cmd === '/help') {
    return sendMessage(chatId, `⚡ *ECONOMISOR BOT*\n\nCommandes disponibles:\n\n/stats — Stats REDUCTOR en temps réel\n/providers — État des providers IA\n/health — Santé du système\n/aide — Ce menu\n\n_Economisor V1 — Novaquantic SAS_`);
  }

  if (cmd === '/stats') {
    const stats = await getStats();
    if (!stats) return sendMessage(chatId, '❌ REDUCTOR non disponible. Lance LANCER\\_ECONOMISOR.bat');
    return sendMessage(chatId, 
      `📊 *STATS REDUCTOR*\n\n` +
      `🔢 Requêtes : ${stats.requests}\n` +
      `⚡ Cache hits : ${stats.cacheHits}\n` +
      `📥 Tokens in : ${(stats.tokensIn/1000).toFixed(1)}k\n` +
      `📤 Tokens out : ${(stats.tokensOut/1000).toFixed(1)}k\n` +
      `❌ Erreurs récentes : ${stats.errors}\n\n` +
      `_Dashboard : ${CODEBURN_URL}_`
    );
  }

  if (cmd === '/providers') {
    const stats = await getStats();
    if (!stats) return sendMessage(chatId, '❌ REDUCTOR non disponible.');
    const p = stats.providers;
    const lines = Object.entries(p).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('\n');
    return sendMessage(chatId, `🌐 *PROVIDERS IA*\n\n${lines}`);
  }

  if (cmd === '/health') {
    const stats = await getStats();
    if (!stats) return sendMessage(chatId, '❌ REDUCTOR offline');
    const activeProviders = Object.values(stats.providers).filter(Boolean).length;
    return sendMessage(chatId, 
      `💚 *SYSTÈME OK*\n\n` +
      `REDUCTOR : ✅ En ligne\n` +
      `Providers actifs : ${activeProviders}\n` +
      `Cache : ✅ Actif\n\n` +
      `_CodeBurn : ${CODEBURN_URL}_`
    );
  }

  return sendMessage(chatId, `❓ Commande inconnue. Tape /aide`);
}

async function poll() {
  try {
    const res = await tgRequest('getUpdates', { offset: lastUpdateId + 1, timeout: 30 });
    if (res.ok && res.result?.length) {
      for (const update of res.result) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (msg?.text) {
          console.log(`[${new Date().toISOString()}] Message de ${msg.chat.id}: ${msg.text}`);
          await handleCommand(msg.chat.id, msg.text);
        }
      }
    }
  } catch (err) {
    console.error('Erreur polling:', err.message);
  }
  setTimeout(poll, 1000);
}

async function main() {
  console.log('🤖 ECONOMISOR Telegram Bot démarré');
  console.log(`📱 Bot: @novaquantic_bot`);
  console.log(`🔑 Chat ID autorisé: ${ALLOWED_CHAT_ID}`);
  
  // Message de démarrage
  await sendMessage(ALLOWED_CHAT_ID, '⚡ *ECONOMISOR démarré*\n\nTon assistant IA est en ligne.\nTape /aide pour voir les commandes.');
  
  poll();
}

main().catch(console.error);
