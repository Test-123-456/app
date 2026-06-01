/**
 * calculator.js — Arbitrage margin calculation engine
 *
 * Formula:
 *   local_usd_per_kg  = (pkr_per_100kg / 100) / pkr_per_usd
 *   gross_margin      = world_usd_per_kg − local_usd_per_kg
 *   net_margin        = gross_margin − shipping_usd_per_kg
 *   margin_pct        = (net_margin / world_usd_per_kg) × 100
 *   profit_per_ton    = net_margin × 1000
 */

'use strict';

require('dotenv').config();
const { DB } = require('./commodities');

const SHIPPING = parseFloat(process.env.SHIPPING_COST_PER_KG) || 0.08;

function calcOne({ key, pkr100kg, worldUsdPerTon, pkrPerUsd, localConf, worldConf, localNote, worldSource, worldDataUrl, localDataUrl, topMarkets }) {
  const meta           = DB[key] || {};
  const localUsdPerKg  = pkr100kg / 100 / pkrPerUsd;
  const worldUsdPerKg  = worldUsdPerTon / 1000;
  const netMarginPerKg = worldUsdPerKg - localUsdPerKg - SHIPPING;
  const marginPct      = worldUsdPerKg > 0 ? (netMarginPerKg / worldUsdPerKg) * 100 : 0;

  return {
    key,
    name              : meta.label || key,
    category          : meta.category || 'Other',
    valueAdded        : meta.valueAdded || false,

    localPkr100kg     : Math.round(pkr100kg),
    localUsdPerKg     : r4(localUsdPerKg),
    worldUsdPerTon    : Math.round(worldUsdPerTon),
    worldUsdPerKg     : r4(worldUsdPerKg),
    shippingUsdPerKg  : SHIPPING,

    netMarginPerKg    : r4(netMarginPerKg),
    marginPct         : r2(marginPct),
    profitPerTonUsd   : Math.round(netMarginPerKg * 1000),
    opportunity       : classify(marginPct),

    localConfidence   : localConf    || 'unknown',
    worldConfidence   : worldConf    || 'unknown',
    localNote         : localNote    || '',
    worldSource       : worldSource  || '',
    worldDataUrl      : worldDataUrl || null,
    localDataUrl      : localDataUrl || null,
    topMarkets        : topMarkets   || [],   // [{country, valuePct}] top export destinations
  };
}

function classify(pct) {
  if (pct >= 25) return 'high';
  if (pct >= 10) return 'medium';
  if (pct >= 0)  return 'low';
  return 'none';
}

const r2 = n => Math.round(n * 100)   / 100;
const r4 = n => Math.round(n * 10000) / 10000;

/**
 * Calculate margins for all commodities and return sorted best → worst.
 * Negative-margin items are pushed to the bottom but still included.
 */
function calculateMargins(localPrices, worldPrices, exchangeRate) {
  const { pkrPerUsd } = exchangeRate;
  const results = [];

  for (const [key, local] of Object.entries(localPrices)) {
    const world = worldPrices[key];
    if (!world || !local?.pkr100kg) {
      console.warn(`[calculator] Skipping "${key}" — missing local or world price.`);
      continue;
    }

    // ── REAL DATA ONLY ────────────────────────────────────────────────────────
    // Skip any commodity where local price is a DB estimate (not scraped from
    // a real source). A margin calculated on a made-up local price is
    // meaningless and misleading.
    if (local.confidence === 'fallback') {
      console.log(`[calculator] Skipping "${key}" — local price is DB fallback (not real).`);
      continue;
    }
    // Skip commodities where world price is also a DB estimate.
    if (world.confidence === 'estimated') {
      console.log(`[calculator] Skipping "${key}" — world price is DB estimate (not real).`);
      continue;
    }
    // ─────────────────────────────────────────────────────────────────────────

    results.push(calcOne({
      key,
      pkr100kg      : local.pkr100kg,
      worldUsdPerTon: world.usdPerTon,
      pkrPerUsd,
      localConf     : local.confidence,
      worldConf     : world.confidence,
      localNote     : local.note,
      worldSource   : world.source,
      worldDataUrl  : world.dataUrl    || null,
      localDataUrl  : local.dataUrl    || null,
      topMarkets    : world.topMarkets || [],
    }));
  }

  return results.sort((a, b) => {
    // Positive margins first, sorted descending; losses at the bottom
    if (a.opportunity === 'none' && b.opportunity !== 'none') return 1;
    if (b.opportunity === 'none' && a.opportunity !== 'none') return -1;
    return b.marginPct - a.marginPct;
  });
}

function formatMarginRow(r, i) {
  const s = r.netMarginPerKg >= 0 ? '+' : '';
  return `  #${i} ${r.name.padEnd(32)} | local $${r.localUsdPerKg}/kg | world $${r.worldUsdPerKg}/kg | net ${s}${r.marginPct.toFixed(1)}% | ${r.profitPerTonUsd >= 0 ? '$' + r.profitPerTonUsd.toLocaleString() : '-$' + Math.abs(r.profitPerTonUsd).toLocaleString()}/ton`;
}

module.exports = { calculateMargins, formatMarginRow, SHIPPING };
