/**
 * prices.js — World commodity prices + live PKR/USD exchange rate
 *
 * Price priority chain (highest → lowest confidence):
 *   1. Yahoo Finance / Stooq futures     — live exchange-traded prices (5 commodities)
 *   2. UN Comtrade unit values           — official Pakistan export data, annual 2023
 *   3. commodities.js DB reference       — emergency fallback (clearly flagged 'estimated')
 *
 * Exchange rate:
 *   exchangerate-api.com (key in .env) → 280 PKR/USD hardcoded fallback
 */

'use strict';

require('dotenv').config();
const axios  = require('axios');
const { DB } = require('./commodities');
const { fetchComtradePrices } = require('./comtrade');

const EXCHANGE_RATE_API_BASE = 'https://v6.exchangerate-api.com/v6';
const TIMEOUT_MS = 12_000;

const BROWSER_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'          : '*/*',
  'Accept-Language' : 'en-US,en;q=0.9',
  'Referer'         : 'https://finance.yahoo.com/',
  'Origin'          : 'https://finance.yahoo.com',
};

// ─── Futures symbol config ────────────────────────────────────────────────────
//
//   CBOT Wheat ZW=F  : USX cents / bushel.  1 t wheat  = 36.744 bu
//   CBOT Corn  ZC=F  : USX cents / bushel.  1 t corn   = 39.368 bu
//   ICE Cotton CT=F  : USX cents / pound.   1 t        = 2,204.62 lb
//   ICE Sugar  SB=F  : USX cents / pound.   1 t        = 2,204.62 lb
//   CBOT Rice  ZR=F  : USD / cwt (100 lb).  1 t        = 22.046 cwt
//
const FUTURES = {
  wheat    : { yahoo: 'ZW=F', stooq: 'wheat.c',   toUsdPerTon: c => (c / 100) * 36.744,  isUsdNotCents: false },
  corn     : { yahoo: 'ZC=F', stooq: 'corn.c',    toUsdPerTon: c => (c / 100) * 39.368,  isUsdNotCents: false },
  cotton   : { yahoo: 'CT=F', stooq: 'cotton2.c', toUsdPerTon: c => (c / 100) * 2204.62, isUsdNotCents: false },
  sugar    : { yahoo: 'SB=F', stooq: 'sugar.c',   toUsdPerTon: c => (c / 100) * 2204.62, isUsdNotCents: false },
  rice_irri: { yahoo: 'ZR=F', stooq: 'rice.c',    toUsdPerTon: d => d * 22.046,           isUsdNotCents: true  },
};

const BOUNDS = {
  wheat    : [80,   600],
  corn     : [80,   500],
  cotton   : [500,  4000],
  sugar    : [100,  800],
  rice_irri: [200,  800],
};

const cache = { futures: null, rate: null };
const log   = m => console.log(`[prices] ${m}`);
const warn  = m => console.warn(`[prices] WARN: ${m}`);

// ─── Yahoo Finance ────────────────────────────────────────────────────────────

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  try {
    const { data } = await axios.get(url, {
      headers : BROWSER_HEADERS,
      timeout : TIMEOUT_MS,
      params  : { interval: '1d', range: '1d', includePrePost: false },
    });
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { raw: meta.regularMarketPrice, currency: meta.currency || 'USX' };
  } catch (err) {
    warn(`Yahoo ${symbol}: ${err.message}`);
    return null;
  }
}

// ─── Stooq fallback ───────────────────────────────────────────────────────────

async function fetchStooq(symbol) {
  const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&e=csv`;
  try {
    const { data } = await axios.get(url, {
      headers : { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
      timeout : TIMEOUT_MS,
    });
    const lines = data.trim().split('\n');
    if (lines.length < 2) return null;
    const close = parseFloat(lines[1].split(',')[6]);
    return isNaN(close) || close <= 0 ? null : close;
  } catch (err) {
    warn(`Stooq ${symbol}: ${err.message}`);
    return null;
  }
}

// ─── Live futures fetcher ─────────────────────────────────────────────────────

async function fetchFuturePrices() {
  if (cache.futures) return cache.futures;
  log('Fetching live futures (Yahoo Finance → Stooq fallback)...');

  const result = {};

  for (const [key, cfg] of Object.entries(FUTURES)) {
    let native = null;

    const yq = await fetchYahoo(cfg.yahoo);
    if (yq) {
      native = cfg.isUsdNotCents
        ? (yq.currency === 'USX' ? yq.raw / 100 : yq.raw)
        : (yq.currency === 'USD' ? yq.raw * 100 : yq.raw);
      log(`  ${cfg.yahoo} (Yahoo) raw=${yq.raw} ${yq.currency}`);
    }

    if (native === null) {
      native = await fetchStooq(cfg.stooq);
      if (native !== null) log(`  ${cfg.stooq} (Stooq) raw=${native}`);
    }

    if (native === null) { warn(`  No live price for ${key}.`); continue; }

    const usdPerTon = Math.round(cfg.toUsdPerTon(native) * 100) / 100;
    const bounds    = BOUNDS[key];
    if (bounds && (usdPerTon < bounds[0] || usdPerTon > bounds[1])) {
      warn(`  ${key}: $${usdPerTon}/t outside sanity bounds [${bounds}] — skipping.`);
      continue;
    }

    log(`  ${key}: $${usdPerTon}/t (live futures)`);
    result[key] = {
      usdPerTon,
      source    : `Yahoo Finance futures (${cfg.yahoo})`,
      confidence: 'live',
      dataUrl   : `https://finance.yahoo.com/quote/${encodeURIComponent(cfg.yahoo)}`,
    };
  }

  cache.futures = result;
  return result;
}

// ─── Exchange rate ────────────────────────────────────────────────────────────

async function fetchExchangeRate() {
  if (cache.rate) return cache.rate;

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    warn('EXCHANGE_RATE_API_KEY not set — using 280 PKR/USD fallback.');
    return { pkrPerUsd: 280, source: 'hardcoded fallback', confidence: 'fallback' };
  }

  try {
    const { data } = await axios.get(
      `${EXCHANGE_RATE_API_BASE}/${apiKey}/latest/USD`,
      { timeout: TIMEOUT_MS },
    );
    if (data?.result !== 'success') throw new Error('Unexpected response from exchange rate API.');

    const pkrPerUsd = data.conversion_rates?.PKR;
    if (!pkrPerUsd) throw new Error('PKR missing from exchange rate response.');

    const r = {
      pkrPerUsd  : Math.round(pkrPerUsd * 100) / 100,
      source     : 'exchangerate-api.com',
      confidence : 'live',
      updatedAt  : data.time_last_update_utc,
    };
    log(`  USD/PKR = ${r.pkrPerUsd} (live)`);
    cache.rate = r;
    return r;
  } catch (err) {
    warn(`Exchange rate API: ${err.message}`);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return world prices for all commodities.
 *
 * Priority:
 *   1. Live futures (Yahoo / Stooq)
 *   2. UN Comtrade Pakistan export unit values (annual 2023, 30-day cache)
 *   3. DB reference price — clearly flagged confidence: 'estimated'
 */
async function getWorldPrices() {
  // 1. Live futures
  const live = await fetchFuturePrices();

  // 2. Collect HS codes for all commodities that didn't get a live futures price
  const hsCodes = [];
  for (const [key, meta] of Object.entries(DB)) {
    if (!live[key] && meta.hsCode) hsCodes.push(meta.hsCode);
  }

  // 3. Fetch UN Comtrade unit values (cached 30 days)
  log(`Fetching UN Comtrade prices for ${[...new Set(hsCodes)].length} unique HS codes…`);
  let comtrade = {};
  try {
    comtrade = await fetchComtradePrices(hsCodes);
    const n = Object.keys(comtrade).length;
    log(`  Comtrade: ${n} HS code(s) with data.`);
  } catch (err) {
    warn(`Comtrade module error: ${err.message}`);
  }

  // 4. Build unified output
  const out = {};
  let liveCount = 0, officialCount = 0, estimatedCount = 0, missingCount = 0;

  for (const [key, meta] of Object.entries(DB)) {
    if (live[key]) {
      out[key] = live[key];
      liveCount++;
    } else if (meta.hsCode && comtrade[meta.hsCode]) {
      out[key] = comtrade[meta.hsCode];
      officialCount++;
    } else if (meta.usdPerTon) {
      // Emergency fallback — DB reference price (no live source found)
      out[key] = {
        usdPerTon  : meta.usdPerTon,
        source     : meta.worldSource || 'DB reference estimate',
        confidence : 'estimated',
        dataUrl    : null,
      };
      estimatedCount++;
    } else {
      // No world price at all — calculator will skip and warn
      missingCount++;
    }
  }

  log(`World prices: ${liveCount} live futures | ${officialCount} UN Comtrade official | ${estimatedCount} estimated | ${missingCount} missing`);
  return out;
}

async function getExchangeRate() {
  const r = await fetchExchangeRate();
  if (r?.pkrPerUsd > 0) return r;
  warn('All exchange sources failed — emergency fallback 280 PKR/USD.');
  return { pkrPerUsd: 280, source: 'emergency fallback', confidence: 'fallback' };
}

module.exports = { getWorldPrices, getExchangeRate };
