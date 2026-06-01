/**
 * reporter.js — Generate the daily arbitrage intelligence report
 *
 * Outputs:
 *   • ./reports/YYYY-MM-DD.json  — full structured data
 *   • ./reports/YYYY-MM-DD.html  — interactive browser report:
 *       - Top 10 opportunity cards with source badges
 *       - Full sortable/filterable table with clickable data-source links
 *       - International buyer leads for top 5 opportunities
 *       - Pakistani supplier leads for top 5 opportunities
 */

'use strict';

require('dotenv').config();
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { CATEGORIES } = require('./commodities');

const REPORT_DIR = process.env.REPORT_DIR || './reports';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OPP = {
  high   : { bg: '#dcfce7', text: '#15803d', border: '#16a34a', label: 'HIGH'   },
  medium : { bg: '#fef9c3', text: '#92400e', border: '#ca8a04', label: 'MEDIUM' },
  low    : { bg: '#dbeafe', text: '#1e3a8a', border: '#2563eb', label: 'LOW'    },
  none   : { bg: '#fee2e2', text: '#991b1b', border: '#dc2626', label: 'LOSS'   },
};

const CONF_BADGE = {
  live      : '<span class="badge b-live">LIVE</span>',
  official  : '<span class="badge b-official">OFFICIAL</span>',
  estimated : '<span class="badge b-est">EST</span>',
  fallback  : '<span class="badge b-fb">FALLBACK</span>',
};
const badge = c => CONF_BADGE[c] || CONF_BADGE.estimated;

const srcLink = (url, label) => url
  ? `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="src-link" title="Click to verify on source website">🔗 ${escHtml(label)}</a>`
  : '';

const escHtml = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmtUsd = (n, d = 2) => {
  if (n == null) return '—';
  const s = n < 0 ? '-' : '';
  return `${s}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const fmtPkr = n => n == null ? '—' : `₨${n.toLocaleString('en-US')}`;
const sign   = n => n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;

// ─── Top-markets pill renderer ────────────────────────────────────────────────

function marketsHtml(topMarkets) {
  if (!topMarkets || topMarkets.length === 0) return '';
  const pills = topMarkets
    .map(m => `<span class="mkt-pill">${escHtml(m.country)}<em>${m.valuePct}%</em></span>`)
    .join('');
  return `<div class="mkt-row">${pills}</div>`;
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function topCards(ranked) {
  return ranked
    .filter(r => r.opportunity !== 'none')
    .slice(0, 10)
    .map((r, i) => {
      const c = OPP[r.opportunity];

      // Local source label — show what the data actually is
      const localLabel  = r.localNote  || 'AMIS mandi';
      const worldLabel  = r.worldSource || 'World price';
      const localSrc  = r.localDataUrl
        ? `${srcLink(r.localDataUrl,  localLabel)}`
        : `<span style="color:var(--muted)">${escHtml(localLabel)}</span>`;
      const worldSrc  = r.worldDataUrl
        ? `${srcLink(r.worldDataUrl,  worldLabel)}`
        : `<span style="color:var(--muted)">${escHtml(worldLabel)}</span>`;

      return `
<div class="card" style="border-top:4px solid ${c.border}">
  <div class="card-rank">#${i + 1}</div>
  <div class="card-name" style="color:${c.text}">${escHtml(r.name)}</div>
  <div class="card-category">${escHtml(r.category)}</div>
  <div class="card-margin" style="color:${c.text}">${sign(r.marginPct)}</div>
  <div class="card-profit">profit: ${fmtUsd(r.profitPerTonUsd, 0)}/ton</div>
  <div class="card-prices">
    local ${fmtUsd(r.localUsdPerKg, 4)}/kg · world ${fmtUsd(r.worldUsdPerKg, 4)}/kg
  </div>
  <div class="card-srcs">
    <div>${badge(r.localConfidence)} ${localSrc}</div>
    <div>${badge(r.worldConfidence)} ${worldSrc}</div>
  </div>
  ${marketsHtml(r.topMarkets)}
  ${r.valueAdded ? '<span class="va-tag">Value-Added</span>' : ''}
</div>`;
    }).join('');
}

// ─── Category filter buttons ──────────────────────────────────────────────────

function categoryButtons(ranked) {
  const present = [...new Set(ranked.map(r => r.category))];
  const btns = ['All', ...present].map(c =>
    `<button class="cat-btn ${c === 'All' ? 'active' : ''}" onclick="filterCat('${escHtml(c)}')">${escHtml(c)}</button>`
  ).join('');
  return `<div class="cat-filters">${btns}</div>`;
}

// ─── Main data table ──────────────────────────────────────────────────────────

function mainTable(ranked) {
  const rows = ranked.map((r, i) => {
    const c       = OPP[r.opportunity];
    const netCell = r.netMarginPerKg >= 0
      ? `<span style="color:#15803d;font-weight:700">${fmtUsd(r.netMarginPerKg, 4)}</span>`
      : `<span style="color:#dc2626;font-weight:700">${fmtUsd(r.netMarginPerKg, 4)}</span>`;
    const pctCell = `<span style="color:${c.text};font-weight:700">${sign(r.marginPct)}</span>`;
    const vaTag   = r.valueAdded ? ' <span class="va-tag-sm">VA</span>' : '';

    // Local price: show note + clickable source link
    const localLabel   = r.localNote || 'AMIS mandi';
    const localSrcHtml = r.localDataUrl
      ? `<br><small>${badge(r.localConfidence)} ${srcLink(r.localDataUrl, localLabel)}</small>`
      : `<br><small>${badge(r.localConfidence)} ${escHtml(localLabel)}</small>`;

    // World price: show source name + target markets
    const worldSrcName = r.worldSource || 'World price';
    const worldSrcHtml = r.worldDataUrl
      ? `<br><small>${badge(r.worldConfidence)} ${srcLink(r.worldDataUrl, worldSrcName)}</small>`
      : `<br><small>${badge(r.worldConfidence)} ${escHtml(worldSrcName)}</small>`;
    const mkts = r.topMarkets && r.topMarkets.length > 0
      ? `<br>${marketsHtml(r.topMarkets)}`
      : '';

    return `<tr data-cat="${escHtml(r.category)}" data-margin="${r.marginPct}">
  <td>${i + 1}</td>
  <td><strong>${escHtml(r.name)}</strong>${vaTag}</td>
  <td><span class="cat-label">${escHtml(r.category)}</span></td>
  <td>${fmtPkr(r.localPkr100kg)}${localSrcHtml}</td>
  <td>${fmtUsd(r.localUsdPerKg, 4)}</td>
  <td>${fmtUsd(r.worldUsdPerKg, 4)}${worldSrcHtml}${mkts}</td>
  <td>${fmtUsd(r.shippingUsdPerKg, 3)}</td>
  <td>${netCell}</td>
  <td>${pctCell}</td>
  <td><span class="opp-chip" style="background:${c.bg};color:${c.text}">${c.label}</span></td>
  <td>${r.profitPerTonUsd >= 0 ? fmtUsd(r.profitPerTonUsd, 0) : `<span style="color:#dc2626">${fmtUsd(r.profitPerTonUsd, 0)}</span>`}</td>
</tr>`;
  }).join('\n');

  return `
<div class="table-wrap">
<table id="main-table">
  <thead><tr>
    <th onclick="sortTable(0)">#</th>
    <th onclick="sortTable(1)">Commodity</th>
    <th onclick="sortTable(2)">Category</th>
    <th onclick="sortTable(3)">Local PKR/100kg · Source</th>
    <th onclick="sortTable(4)">Local USD/kg</th>
    <th onclick="sortTable(5)">World USD/kg · Source · Top Markets</th>
    <th>Ship USD/kg</th>
    <th onclick="sortTable(7)">Net Margin/kg</th>
    <th onclick="sortTable(8)">Margin %</th>
    <th onclick="sortTable(9)">Signal</th>
    <th onclick="sortTable(10)">Profit/Ton</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

// ─── Buyer sections ───────────────────────────────────────────────────────────

function buyerSections(buyerData) {
  if (!buyerData || !Object.keys(buyerData).length) return '';

  const sections = Object.entries(buyerData).map(([commodity, data]) => {
    const { buyers = [], searchUrls = {} } = data;
    const rows = buyers.map(b => `<tr>
  <td>${escHtml(b.company)}</td>
  <td>${escHtml(b.country || '—')}</td>
  <td>${escHtml(b.contact || '—')}</td>
  <td><span class="badge ${b.source === 'demo' ? 'b-est' : 'b-live'}">${escHtml(b.source)}</span></td>
</tr>`).join('');

    const links = Object.entries(searchUrls)
      .map(([n, u]) => `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="ext-link">${escHtml(n)}</a>`)
      .join(' · ');

    return `<div class="trade-block">
  <h3 class="block-heading">🌍 ${escHtml(commodity)} — International Buyers</h3>
  <p class="search-links">Find more on: ${links}</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Company</th><th>Country</th><th>Contact</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>`;
  }).join('\n');

  return `<div id="buyers-section">${sections}</div>`;
}

// ─── Seller sections ──────────────────────────────────────────────────────────

function sellerSections(sellerData) {
  if (!sellerData || !Object.keys(sellerData).length) return '';

  const sections = Object.entries(sellerData).map(([commodity, data]) => {
    const { sellers = [], searchUrls = {} } = data;
    const rows = sellers.map(s => `<tr>
  <td>${escHtml(s.company)}</td>
  <td>${escHtml(s.region || s.country || '—')}</td>
  <td>${escHtml(s.contact || '—')}</td>
  <td>${escHtml(s.note || '—')}</td>
  <td><span class="badge ${s.source === 'demo' ? 'b-est' : 'b-live'}">${escHtml(s.source)}</span></td>
</tr>`).join('');

    const links = Object.entries(searchUrls)
      .map(([n, u]) => `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="ext-link">${escHtml(n)}</a>`)
      .join(' · ');

    return `<div class="trade-block">
  <h3 class="block-heading">🇵🇰 ${escHtml(commodity)} — Pakistan Suppliers</h3>
  <p class="search-links">Find more on: ${links}</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Company / Association</th><th>Region</th><th>Contact / Website</th><th>Notes</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>`;
  }).join('\n');

  return `<div id="sellers-section">${sections}</div>`;
}

// ─── Full HTML document ───────────────────────────────────────────────────────

function buildHtml({ ranked, buyerData, sellerData, exchangeRate, metadata, spotOpps }) {
  const dateStr  = metadata.date;
  const ts       = new Date(metadata.generatedAt).toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
  const rateStr  = exchangeRate ? `${exchangeRate.pkrPerUsd.toLocaleString()} PKR/USD (${exchangeRate.confidence})` : 'N/A';
  const total    = ranked.length;
  const positive = ranked.filter(r => r.marginPct > 0).length;
  const liveW    = ranked.filter(r => r.worldConfidence === 'live').length;
  const officW   = ranked.filter(r => r.worldConfidence === 'official').length;

  const hasBuyers  = buyerData  && Object.keys(buyerData).length  > 0;
  const hasSellers = sellerData && Object.keys(sellerData).length > 0;
  const hasSpot    = spotOpps   && spotOpps.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🇵🇰 Pakistan Trade Arbitrage — ${dateStr}</title>
<style>
:root{--green:#01411C;--mid:#2E8B57;--bg:#f1f5f9;--card:#fff;--border:#e2e8f0;--txt:#1e293b;--muted:#64748b}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--txt);font-size:14px}
a{color:var(--mid)}

/* Header */
header{background:var(--green);color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
header h1{font-size:1.15em;font-weight:700}
header h1 small{opacity:.7;font-weight:400;font-size:.8em;display:block;margin-top:2px}
.hdr-meta{text-align:right;font-size:.8em;opacity:.85;line-height:1.9}

/* Stats bar */
.stats-bar{background:var(--mid);color:#fff;padding:8px 28px;display:flex;gap:24px;font-size:.82em;flex-wrap:wrap}
.stat{display:flex;align-items:center;gap:6px}.stat strong{font-size:1.1em}

/* Container */
.container{max-width:1500px;margin:0 auto;padding:20px 14px 56px}
.section-title{font-size:.78em;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.07em;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--mid)}

/* Top cards */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:4px}
.card{background:var(--card);border-radius:8px;padding:14px 16px;box-shadow:0 1px 6px rgba(0,0,0,.07)}
.card-rank{font-size:.68em;text-transform:uppercase;color:var(--muted);letter-spacing:.06em}
.card-name{font-size:1.1em;font-weight:800;margin:2px 0}
.card-category{font-size:.72em;color:var(--muted);margin-bottom:4px}
.card-margin{font-size:1.6em;font-weight:800}
.card-profit{font-size:.82em;color:var(--muted);margin-top:2px}
.card-prices{font-size:.75em;color:var(--muted);margin-top:4px}
.card-src{font-size:.72em;margin-top:6px}
.va-tag{display:inline-block;margin-top:6px;background:#e0e7ff;color:#3730a3;border-radius:4px;padding:1px 6px;font-size:.68em;font-weight:700}

/* Category filters */
.cat-filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.cat-btn{padding:4px 12px;border-radius:20px;border:1.5px solid var(--border);background:#fff;color:var(--muted);cursor:pointer;font-size:.78em;font-weight:600;transition:.15s}
.cat-btn:hover,.cat-btn.active{background:var(--green);color:#fff;border-color:var(--green)}

/* Table */
.table-wrap{overflow-x:auto;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.07)}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:.83em}
thead{background:var(--green);color:#fff}
thead th{padding:10px 12px;text-align:left;white-space:nowrap;font-size:.76em;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;user-select:none}
thead th:hover{background:var(--mid)}
tbody tr{border-bottom:1px solid var(--border);transition:background .12s}
tbody tr:hover{background:#f8fafc}
tbody td{padding:9px 12px;vertical-align:middle}

/* Badges */
.badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:.68em;font-weight:700;white-space:nowrap}
.b-live{background:#dcfce7;color:#15803d}
.b-official{background:#dbeafe;color:#1d4ed8}
.b-est{background:#fef9c3;color:#854d0e}
.b-fb{background:#fee2e2;color:#991b1b}
.opp-chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.72em;font-weight:700}
.cat-label{display:inline-block;background:#f1f5f9;color:var(--muted);border-radius:4px;padding:1px 6px;font-size:.78em;white-space:nowrap}
.va-tag-sm{background:#e0e7ff;color:#3730a3;border-radius:3px;padding:0 4px;font-size:.68em;font-weight:700;margin-left:4px}

/* Source links */
.src-link{font-size:.72em;color:var(--mid);text-decoration:none;white-space:nowrap}
.src-link:hover{text-decoration:underline}

/* Card source block */
.card-srcs{font-size:.72em;margin-top:6px;line-height:1.8;color:var(--muted)}

/* Top-market pills */
.mkt-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.mkt-pill{display:inline-flex;align-items:center;gap:3px;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1;border-radius:10px;padding:1px 7px;font-size:.7em;font-weight:600;white-space:nowrap}
.mkt-pill em{font-style:normal;color:#0284c7;font-weight:700}

/* Info box */
.info{background:#fffbeb;border:1px solid #fcd34d;border-radius:7px;padding:10px 14px;font-size:.8em;color:#78350f;margin-bottom:20px;line-height:1.7}
.info strong{display:block;margin-bottom:3px;font-size:1em}

/* Trade blocks (buyers / sellers) */
.trade-block{margin-bottom:28px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.block-heading{background:#f8fafc;border-bottom:1px solid var(--border);padding:10px 16px;font-size:.92em;font-weight:700;color:var(--green)}
.trade-block .search-links{font-size:.78em;color:var(--muted);padding:6px 16px 8px;background:#f8fafc;border-bottom:1px solid var(--border)}
.trade-block .table-wrap{border-radius:0;box-shadow:none}
.ext-link{color:var(--mid);font-weight:600;text-decoration:none;border-bottom:1px dashed var(--mid)}
.ext-link:hover{color:var(--green)}

/* No-contacts notice */
.no-contacts-msg{padding:12px 16px;color:#64748b;font-size:.82em;background:#f8fafc;border-top:1px solid var(--border)}

/* Spot arbitrage table */
.spot-table table{font-size:.82em}
.spot-viable{background:#dcfce7}
.spot-marginal{background:#fef9c3}
.spot-unknown{background:#f1f5f9}
.spot-loss{background:#fee2e2}
.city-pill{display:inline-block;background:#dbeafe;color:#1e3a8a;border-radius:4px;padding:1px 7px;font-size:.82em;font-weight:700;white-space:nowrap}
.arrow-cell{color:var(--muted);font-size:1.1em;text-align:center}
.spot-note{font-size:.72em;color:var(--muted);margin-top:8px;padding:6px 10px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;line-height:1.6}

/* Trade grid — buyers + sellers side by side on wide screens */
.trade-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.trade-pair{grid-template-columns:1fr}}

footer{text-align:center;padding:20px;color:var(--muted);font-size:.76em;border-top:1px solid var(--border);margin-top:32px;line-height:2}
@media(max-width:640px){header{flex-direction:column;text-align:center}.hdr-meta{text-align:center}}
</style>
</head>
<body>

<header>
  <div>
    <h1>🇵🇰 Pakistan Commodity Export Arbitrage Intelligence
      <small>Identifies profitable export windows across ${total} commodities — raw + value-added</small>
    </h1>
  </div>
  <div class="hdr-meta">
    <div><strong>Date:</strong> ${dateStr}</div>
    <div><strong>Generated:</strong> ${ts} PKT</div>
    <div><strong>PKR/USD:</strong> ${rateStr}</div>
    <div><strong>Shipping cost:</strong> $${metadata.shippingCost}/kg sea freight</div>
  </div>
</header>

<div class="stats-bar">
  <div class="stat">Commodities: <strong>${total}</strong></div>
  <div class="stat">Positive margin: <strong>${positive}</strong></div>
  <div class="stat">Live futures: <strong>${liveW}</strong></div>
  <div class="stat">UN Comtrade official: <strong>${officW}</strong></div>
  <div class="stat">Top opportunity: <strong>${ranked[0]?.name || '—'} (${ranked[0] ? sign(ranked[0].marginPct) : '—'})</strong></div>
  ${hasSpot ? `<div class="stat">Spot arbitrage: <strong>${spotOpps.filter(o=>o.viable).length} viable city trades</strong></div>` : ''}
</div>

<div class="container">

  <div class="info">
    <strong>How to read this report</strong>
    Positive net margin = Pakistan's local cost is low enough that selling at the world price, after $${metadata.shippingCost}/kg shipping, leaves a profit. Click any <strong>🔗 link</strong> to verify the price on its original source website.
    <br><br>
    <strong>Local price badges:</strong>
    &nbsp;<span class="badge b-live">LIVE</span> = AMIS.pk daily wholesale mandi price (what traders pay at the market gate — typically 40–60% below retail).
    &nbsp;<span class="badge b-live">LIVE</span> PBS SPI = Government weekly retail price average across 7 cities (higher than mandi — overstates local cost slightly).
    &nbsp;<span class="badge b-fb">FALLBACK</span> = DB estimate — no live price scraped today; treat as rough guide only.
    <br>
    <strong>World price badges:</strong>
    &nbsp;<span class="badge b-live">LIVE</span> = today's exchange-traded futures (Yahoo Finance / Stooq).
    &nbsp;<span class="badge b-official">OFFICIAL</span> = UN Comtrade — Pakistan's actual customs-cleared export unit value (USD received per tonne). Click 🔗 to see the raw Comtrade data.
    &nbsp;<span class="badge b-est">EST</span> = FAO/ITC reference estimate (use with caution).
    <br>
    <strong>Top Export Markets</strong> (blue pills) = countries that bought the most of this commodity from Pakistan in the most recent Comtrade year, with their share of total export value. These are your target markets.
    <br>
    ⚠️ <strong>Some world prices cover a broad HS code shared by multiple commodities</strong> (e.g. okra + bitter gourd + moringa all use HS 070999 — same world price applied to all three). Treat margins as directional, not precise.
    Buyer leads are real RFQs from go4worldbusiness.com. Supplier links point to TDAP, TradeKey, go4worldbusiness.
  </div>

  <div class="section-title">Top 10 Opportunities Today</div>
  <div class="cards">${topCards(ranked)}</div>

  <div class="section-title">All ${total} Commodities — Full Analysis (click column headers to sort)</div>
  ${categoryButtons(ranked)}
  ${mainTable(ranked)}

  ${hasSpot ? spotArbitrageSection(spotOpps) : ''}

  ${hasBuyers || hasSellers ? `<div class="section-title">Trade Connections — Top 5 Opportunities</div>` : ''}
  ${buildTradePairs(buyerData, sellerData)}

</div>

<footer>
  <strong>World price sources:</strong>
  <a href="https://finance.yahoo.com" target="_blank">Yahoo Finance (live futures)</a> ·
  <a href="https://comtradeplus.un.org" target="_blank">UN Comtrade (official Pakistan export data)</a> ·
  <a href="https://stooq.com" target="_blank">Stooq (futures fallback)</a>
  <br>
  <strong>Local price sources:</strong>
  <a href="http://www.amis.pk" target="_blank">AMIS.pk (daily mandi)</a> ·
  <a href="https://www.pbs.gov.pk/content/weekly-sensitive-price-indicator" target="_blank">PBS.gov.pk SPI (weekly)</a>
  <br>
  <strong>Exchange rate:</strong>
  <a href="https://www.exchangerate-api.com" target="_blank">exchangerate-api.com</a> ·
  <strong>Buyer/Seller leads:</strong>
  <a href="https://www.tdap.gov.pk" target="_blank">TDAP.gov.pk</a> ·
  <a href="https://go4worldbusiness.com" target="_blank">go4worldbusiness.com</a>
  <br>
  ⚠️ Indicative prices only. Verify all data before making trade decisions.
</footer>

<script>
// ── Category filter ──
function filterCat(cat) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.textContent === cat));
  document.querySelectorAll('#main-table tbody tr').forEach(tr => {
    tr.style.display = (cat === 'All' || tr.dataset.cat === cat) ? '' : 'none';
  });
}

// ── Column sort ──
let lastCol = -1, ascending = true;
function sortTable(col) {
  const tb = document.querySelector('#main-table tbody');
  const rows = [...tb.querySelectorAll('tr')];
  if (col === lastCol) ascending = !ascending; else { lastCol = col; ascending = false; }
  rows.sort((a, b) => {
    const av = a.cells[col]?.textContent.replace(/[^0-9.\\-]/g,'') || '';
    const bv = b.cells[col]?.textContent.replace(/[^0-9.\\-]/g,'') || '';
    const n  = parseFloat(av) - parseFloat(bv);
    const s  = av.localeCompare(bv);
    return (isNaN(n) ? s : n) * (ascending ? 1 : -1);
  });
  rows.forEach(r => tb.appendChild(r));
}
</script>

</body>
</html>`;
}

// ─── Domestic spot arbitrage section ─────────────────────────────────────────

function spotArbitrageSection(spotOpps) {
  if (!spotOpps || spotOpps.length === 0) return '';

  // Show top 20 (viable first)
  const rows = spotOpps.slice(0, 20).map(o => {
    let rowClass = 'spot-unknown';
    if (o.viable === true)  rowClass = 'spot-viable';
    if (o.viable === false) rowClass = o.netPkr100kg < -500 ? 'spot-loss' : 'spot-marginal';

    const spread = `₨${o.spreadPkr100kg.toLocaleString()}`;
    const truck  = o.truckPkr100kg != null ? `₨${o.truckPkr100kg.toLocaleString()}` : '—';
    const net    = o.netPkr100kg   != null
      ? (o.netPkr100kg >= 0
          ? `<strong style="color:#15803d">₨${o.netPkr100kg.toLocaleString()}</strong>`
          : `<span style="color:#dc2626">-₨${Math.abs(o.netPkr100kg).toLocaleString()}</span>`)
      : '<em style="color:var(--muted)">unknown dist.</em>';
    const usd = o.netUsdPerTon != null && o.viable
      ? `<small style="color:#15803d">(+$${o.netUsdPerTon}/ton)</small>`
      : '';

    const signal = o.viable === true
      ? `<span style="background:#dcfce7;color:#15803d;padding:1px 7px;border-radius:8px;font-size:.72em;font-weight:700">BUY▶MOVE</span>`
      : o.viable === false
        ? `<span style="background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:8px;font-size:.72em;font-weight:700">UNECONOMIC</span>`
        : `<span style="background:#f1f5f9;color:#475569;padding:1px 7px;border-radius:8px;font-size:.72em;font-weight:700">CHECK</span>`;

    return `<tr class="${rowClass}">
  <td><strong>${escHtml(o.name)}</strong><br><small class="cat-label">${escHtml(o.category)}</small></td>
  <td><span class="city-pill">${escHtml(o.buyCity)}</span><br><small>₨${o.buyPkr100kg.toLocaleString()}/100kg</small></td>
  <td class="arrow-cell">→</td>
  <td><span class="city-pill" style="background:#dcfce7;color:#15803d">${escHtml(o.sellCity)}</span><br><small>₨${o.sellPkr100kg.toLocaleString()}/100kg</small></td>
  <td style="font-weight:700">${spread}<br><small style="color:var(--muted)">(${o.spreadPct}%)</small></td>
  <td>${o.distanceKm != null ? `${o.distanceKm} km` : '—'}</td>
  <td>${truck}</td>
  <td>${net} ${usd}</td>
  <td>${signal}</td>
</tr>`;
  }).join('\n');

  const viableCount = spotOpps.filter(o => o.viable === true).length;

  return `
<div class="section-title">🚛 Domestic Spot Arbitrage — City-to-City Price Spreads</div>
<p class="spot-note">
  <strong>Source: AMIS Daily Market Changes — today's wholesale mandi prices across ${[...new Set(spotOpps.map(o => o.buyCity).concat(spotOpps.map(o => o.sellCity)))].length} Punjab cities.</strong>
  Spread = sell-city price minus buy-city price (PKR/100kg). Truck cost estimated at ₨1,200/ton per 100km.
  <strong>${viableCount} opportunity${viableCount !== 1 ? 'ies' : 'y'} profitable after transport.</strong>
  These are same-day mandi prices — the window may close as traders respond. Verify before committing to a truck.
  Prices per 100 kg wholesale.
</p>
<div class="spot-table table-wrap">
<table>
  <thead><tr>
    <th>Commodity</th>
    <th>Buy City</th>
    <th></th>
    <th>Sell City</th>
    <th>Raw Spread</th>
    <th>Distance</th>
    <th>Truck Cost</th>
    <th>Net Profit / 100kg</th>
    <th>Signal</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

// ─── Trade pairs (buyers + sellers side by side per commodity) ─────────────────

function buildTradePairs(buyerData, sellerData) {
  if (!buyerData && !sellerData) return '';
  const commodities = new Set([
    ...Object.keys(buyerData  || {}),
    ...Object.keys(sellerData || {}),
  ]);

  return [...commodities].map(commodity => {
    const bData = buyerData?.[commodity];
    const sData = sellerData?.[commodity];

    const buyerBlock = bData ? (() => {
      const links = Object.entries(bData.searchUrls || {})
        .map(([n, u]) => `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="ext-link">${escHtml(n)}</a>`).join(' · ');

      if (!bData.buyers || bData.buyers.length === 0) {
        return `<div class="trade-block">
  <div class="block-heading">🌍 International Buyers for ${escHtml(commodity)}</div>
  <div class="search-links">Search verified directories: ${links}</div>
  <div class="no-contacts-msg">
    ℹ️ No buyer RFQs found for this commodity on go4worldbusiness. Use the links above to search for active importers.
  </div>
</div>`;
      }

      const rows = bData.buyers.map(b => {
        const linkCell = b.link
          ? `<a href="${escHtml(b.link)}" target="_blank" rel="noopener" class="ext-link">View RFQ →</a>`
          : '—';
        return `<tr>
  <td>${escHtml(b.company)}</td>
  <td>${escHtml(b.country || '—')}</td>
  <td>${escHtml(b.qty || '—')}</td>
  <td>${linkCell}</td>
</tr>`;
      }).join('');
      return `<div class="trade-block">
  <div class="block-heading">🌍 International Buyers for ${escHtml(commodity)}</div>
  <div class="search-links">Find more: ${links}</div>
  <div class="table-wrap"><table>
    <thead><tr><th>Buyer / Contact</th><th>Destination</th><th>Qty Required</th><th>Full RFQ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>`;
    })() : '';

    const sellerBlock = sData ? (() => {
      const links = Object.entries(sData.searchUrls || {})
        .map(([n, u]) => `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="ext-link">${escHtml(n)}</a>`).join(' · ');

      if (!sData.sellers || sData.sellers.length === 0) {
        // No scraped contacts — show honest search-directory message
        return `<div class="trade-block">
  <div class="block-heading">🇵🇰 Pakistan Suppliers of ${escHtml(commodity)}</div>
  <div class="search-links">Search verified directories: ${links}</div>
  <div class="no-contacts-msg">
    ℹ️ No supplier contacts were automatically scraped for this commodity.
    Use the links above to search TDAP's official exporter registry, TradeKey, and go4worldbusiness directly.
  </div>
</div>`;
      }

      const rows = sData.sellers.map(s => `<tr>
  <td>${escHtml(s.company)}</td>
  <td>${escHtml(s.region || s.country || '—')}</td>
  <td>${escHtml(s.contact || '—')}</td>
  <td>${escHtml(s.note || '—')}</td>
  <td><span class="badge b-live">${escHtml(s.source)}</span></td>
</tr>`).join('');
      return `<div class="trade-block">
  <div class="block-heading">🇵🇰 Pakistan Suppliers of ${escHtml(commodity)}</div>
  <div class="search-links">Find more: ${links}</div>
  <div class="table-wrap"><table>
    <thead><tr><th>Company / Association</th><th>Region</th><th>Contact</th><th>Notes</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>`;
    })() : '';

    return `<div class="trade-pair">${buyerBlock}${sellerBlock}</div>`;
  }).join('\n');
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

const todayDate = () => new Date().toISOString().slice(0, 10);

function ensureDir() {
  const d = path.resolve(REPORT_DIR);
  if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); console.log(`[reporter] Created: ${d}`); }
  return d;
}

function saveJson(payload) {
  const fp = path.join(ensureDir(), `${todayDate()}.json`);
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[reporter] JSON → ${fp}`);
  return fp;
}

function saveHtml(data) {
  const fp = path.join(ensureDir(), `${todayDate()}.html`);
  fs.writeFileSync(fp, buildHtml(data), 'utf8'); // data includes spotOpps
  console.log(`[reporter] HTML → ${fp}`);
  return fp;
}

// ─── Optional email ───────────────────────────────────────────────────────────

async function sendEmail(htmlPath, metadata) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_RECIPIENTS } = process.env;
  const isPlaceholder = v => !v || v.startsWith('your_') || v.includes('example.com');
  if ([SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_RECIPIENTS].some(isPlaceholder)) {
    console.log('[reporter] Email not configured — skipping.'); return;
  }
  try {
    const t = nodemailer.createTransport({ host: SMTP_HOST, port: +(SMTP_PORT || 587), secure: +(SMTP_PORT || 587) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await t.sendMail({ from: EMAIL_FROM || SMTP_USER, to: EMAIL_RECIPIENTS, subject: `🇵🇰 Pakistan Arbitrage Report — ${metadata.date}`, html: fs.readFileSync(htmlPath, 'utf8') });
    console.log(`[reporter] Email sent to ${EMAIL_RECIPIENTS}`);
  } catch (err) { console.error(`[reporter] Email failed: ${err.message}`); }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function generateReport({ ranked, buyerData, sellerData, exchangeRate, localSource, spotOpps = [] }) {
  const metadata = {
    date        : todayDate(),
    generatedAt : new Date().toISOString(),
    shippingCost: parseFloat(process.env.SHIPPING_COST_PER_KG) || 0.08,
    localSource : localSource?.source || 'unknown',
    scrapedAt   : localSource?.scrapedAt || null,
  };

  const payload  = { metadata, exchangeRate, ranked, buyerData, sellerData, spotArbitrage: spotOpps };
  const jsonPath = saveJson(payload);
  const htmlPath = saveHtml({ ranked, buyerData, sellerData, exchangeRate, metadata, spotOpps });
  await sendEmail(htmlPath, metadata);
  return { jsonPath, htmlPath };
}

module.exports = { generateReport };
