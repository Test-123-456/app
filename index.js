/**
 * index.js — Pipeline orchestrator
 *
 * Steps:
 *   1. Scrape AMIS.pk + PBS.gov.pk local mandi prices
 *   2. Fetch world prices (futures + UN Comtrade) + live PKR/USD
 *   3. Calculate arbitrage margins for all commodities
 *   4. Search active international buyers + Pakistani suppliers (top 5)
 *   5. Generate JSON + HTML daily reports
 */

'use strict';

require('dotenv').config();
const { scrapeAmisPrices }                = require('./scraper');
const { getWorldPrices, getExchangeRate } = require('./prices');
const { calculateMargins, formatMarginRow } = require('./calculator');
const { findBuyers, findSellers }         = require('./buyers');
const { generateReport }                  = require('./reporter');
const { calculateSpotArbitrage }          = require('./spotArbitrage');
const { ALL_KEYS }                        = require('./commodities');

async function runAnalysis() {
  console.log('\n' + '═'.repeat(64));
  console.log('  🇵🇰  Pakistan Trade Arbitrage Intelligence Agent');
  console.log(`  ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} PKT  |  ${ALL_KEYS.length} commodities`);
  console.log('═'.repeat(64) + '\n');

  // ── 1. Local mandi prices ─────────────────────────────────────────────────
  console.log('▶ 1/5 — Scraping local prices (AMIS.pk → PBS.gov.pk)...');
  let localData = { source: 'error', scrapedAt: new Date().toISOString(), prices: {} };
  try {
    localData = await scrapeAmisPrices();
    const live = Object.values(localData.prices).filter(p => p.confidence === 'live').length;
    console.log(`  ✓ ${Object.keys(localData.prices).length} prices (${live} live, rest fallback)\n`);
  } catch (err) { console.error(`  ✗ ${err.message}\n`); }

  // ── 2. World prices + exchange rate ───────────────────────────────────────
  console.log('▶ 2/5 — Fetching world prices & exchange rate...');
  let worldPrices = {}, exchangeRate = { pkrPerUsd: 280, source: 'emergency fallback', confidence: 'fallback' };
  try {
    [worldPrices, exchangeRate] = await Promise.all([getWorldPrices(), getExchangeRate()]);
    const live     = Object.values(worldPrices).filter(p => p.confidence === 'live').length;
    const official = Object.values(worldPrices).filter(p => p.confidence === 'official').length;
    const est      = Object.values(worldPrices).filter(p => p.confidence === 'estimated').length;
    console.log(`  ✓ ${Object.keys(worldPrices).length} world prices — ${live} live futures | ${official} UN Comtrade | ${est} estimated`);
    console.log(`  ✓ ${exchangeRate.pkrPerUsd} PKR/USD (${exchangeRate.confidence})\n`);
  } catch (err) { console.error(`  ✗ ${err.message}\n`); }

  // ── 3. Margin calculation + domestic spot arbitrage ──────────────────────
  console.log('▶ 3/5 — Calculating margins & domestic spot arbitrage...');
  let ranked = [], spotOpps = [];
  try {
    ranked = calculateMargins(localData.prices, worldPrices, exchangeRate);
    const positive = ranked.filter(r => r.marginPct > 0).length;
    console.log(`  ✓ ${ranked.length} commodities ranked | ${positive} with positive margin`);
    console.log('  Top 15:');
    ranked.slice(0, 15).forEach((r, i) => console.log(formatMarginRow(r, i + 1)));

    // Spot arbitrage from per-city AMIS data
    if (localData.cityPrices && Object.keys(localData.cityPrices).length > 0) {
      spotOpps = calculateSpotArbitrage(localData.cityPrices, exchangeRate);
      const viable = spotOpps.filter(o => o.viable === true).length;
      console.log(`  ✓ ${spotOpps.length} city-pair spreads | ${viable} viable after trucking cost\n`);
    } else {
      console.log('  ℹ No per-city data available for spot arbitrage\n');
    }
  } catch (err) { console.error(`  ✗ ${err.message}\n`); }

  // ── 4. Buyers + Sellers (top 5) ───────────────────────────────────────────
  console.log('▶ 4/5 — Finding international buyers & Pakistan suppliers (top 5)...');
  let buyerData = {}, sellerData = {};
  try {
    [buyerData, sellerData] = await Promise.all([
      findBuyers(ranked, 5),
      findSellers(ranked, 5),
    ]);
    const totalBuyers  = Object.values(buyerData).reduce((s, d) => s + d.buyers.length, 0);
    const totalSellers = Object.values(sellerData).reduce((s, d) => s + d.sellers.length, 0);
    console.log(`  ✓ ${totalBuyers} buyer records + ${totalSellers} supplier records across top 5 opportunities\n`);
  } catch (err) { console.error(`  ✗ ${err.message}\n`); }

  // ── 5. Report generation ──────────────────────────────────────────────────
  console.log('▶ 5/5 — Generating reports...');
  let paths = {};
  try {
    paths = await generateReport({ ranked, buyerData, sellerData, exchangeRate, localSource: localData, spotOpps });
    console.log(`  ✓ JSON  → ${paths.jsonPath}`);
    console.log(`  ✓ HTML  → ${paths.htmlPath}\n`);
  } catch (err) { console.error(`  ✗ ${err.message}\n`); }

  console.log('═'.repeat(64));
  console.log('  ✅  Done.  Open the HTML report in your browser.');
  console.log('═'.repeat(64) + '\n');

  return { ranked, buyerData, sellerData, exchangeRate, localData, paths };
}

module.exports = { runAnalysis };
