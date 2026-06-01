/**
 * comtrade.js — UN Comtrade Public API client
 *
 * Fetches Pakistan export unit values (USD / metric ton) by HS-6 code.
 * Source : comtradeapi.un.org/public/v1  —  no subscription key required.
 * Results cached 30 days in ./cache/comtrade-prices.json.
 *
 * Reporter : Pakistan (M49 code 586)
 * Flow     : X — Exports  (what Pakistan ships to the world)
 * Period   : Tries 2023 → 2022 → 2021 in order (uses most recent year that has data)
 * Formula  : unit_value_usd_per_ton = (Σ primaryValue / Σ netWgt) × 1000
 *            primaryValue = USD, netWgt = kg
 *
 * Verify any price at:
 *   https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=X&CommodityCodes=<hs>
 *     &Partners=0&Reporters=586&period=<year>&AggregateBy=none&BreakdownMode=plus
 */

'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BASE        = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const REPORTER    = 586;                       // Pakistan M49 code
const FLOW        = 'X';                       // Exports
const TRY_YEARS   = ['2023', '2022', '2021'];  // Most recent → oldest
const TIMEOUT_MS  = 25_000;
const DELAY_MS    = 1_200;  // between HTTP requests — respect rate limits
const CACHE_FILE  = path.join(__dirname, 'cache', 'comtrade-prices.json');
const CACHE_DAYS  = 30;
const CACHE_VER   = 2;   // bump to force full refresh (e.g. when adding topMarkets)

// UN M49 numeric code → familiar country name
// Covers Pakistan's main trading partners + any code we've seen in the wild
const M49 = {
  4  : 'Afghanistan', 8  : 'Albania',   12 : 'Algeria',  24 : 'Angola',
  36 : 'Australia',   40 : 'Austria',   48 : 'Bahrain',  50 : 'Bangladesh',
  56 : 'Belgium',     76 : 'Brazil',    100: 'Bulgaria', 116: 'Cambodia',
  124: 'Canada',      144: 'Sri Lanka', 156: 'China',    191: 'Croatia',
  196: 'Cyprus',      208: 'Denmark',   250: 'France',   266: 'Gabon',
  268: 'Georgia',     276: 'Germany',   300: 'Greece',   344: 'Hong Kong',
  356: 'India',       360: 'Indonesia', 364: 'Iran',     368: 'Iraq',
  372: 'Ireland',     376: 'Israel',    380: 'Italy',    392: 'Japan',
  400: 'Jordan',      404: 'Kenya',     414: 'Kuwait',   418: 'Laos',
  442: 'Luxembourg',  458: 'Malaysia',  484: 'Mexico',   504: 'Morocco',
  512: 'Oman',        528: 'Netherlands', 554: 'New Zealand', 566: 'Nigeria',
  578: 'Norway',      616: 'Poland',    620: 'Portugal', 634: 'Qatar',
  410: 'S. Korea',    682: 'Saudi Arabia', 686: 'Senegal', 703: 'Slovakia',
  710: 'South Africa',724: 'Spain',     752: 'Sweden',   756: 'Switzerland',
  760: 'Syria',       764: 'Thailand',  792: 'Turkey',   784: 'UAE',
  800: 'Uganda',      826: 'UK',        840: 'USA',      887: 'Yemen',
  894: 'Zambia',      716: 'Zimbabwe',  704: 'Vietnam',
};

// Shorten verbose Comtrade text names if partnerDesc IS returned as a string
const COUNTRY_SHORT = {
  'United Arab Emirates'        : 'UAE',
  'United Kingdom'              : 'UK',
  'United States of America'    : 'USA',
  'United States'               : 'USA',
  'Rep. of Korea'               : 'S. Korea',
  'Republic of Korea'           : 'S. Korea',
  'China, Hong Kong SAR'        : 'Hong Kong',
  'China, Macao SAR'            : 'Macao',
  'Netherlands (Kingdom of the)': 'Netherlands',
  'Dem. Rep. of the Congo'      : 'DR Congo',
  'United Rep. of Tanzania'     : 'Tanzania',
  'Iran (Islamic Rep. of)'      : 'Iran',
  'Russian Federation'          : 'Russia',
  'Viet Nam'                    : 'Vietnam',
  'Türkiye'                     : 'Turkey',
};

function shortCountry(nameOrCode) {
  // Comtrade sometimes returns numeric code as the name — look it up
  const num = Number(nameOrCode);
  if (!isNaN(num) && num > 0) return M49[num] || `Country ${num}`;
  return COUNTRY_SHORT[nameOrCode] || nameOrCode;
}

const log  = m => console.log(`[comtrade] ${m}`);
const warn = m => console.warn(`[comtrade] WARN: ${m}`);

// ─── Verify URL (human-readable Comtrade Plus web UI) ─────────────────────────

function verifyUrl(hsCode, period) {
  return `https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=X&CommodityCodes=${hsCode}&Partners=0&Reporters=${REPORTER}&period=${period}&AggregateBy=none&BreakdownMode=plus`;
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

function readCacheFile() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch { return null; }
}

function loadFreshCache(needed) {
  const c = readCacheFile();
  if (!c) return null;
  if (c.version !== CACHE_VER) {
    log(`Cache version ${c.version || 1} → upgrading to ${CACHE_VER} (refreshing for partner data).`);
    return null;
  }
  const ageDays = (Date.now() - new Date(c.fetchedAt).getTime()) / 86_400_000;
  if (ageDays > CACHE_DAYS) {
    log(`Cache is ${ageDays.toFixed(1)}d old — refreshing.`);
    return null;
  }
  const missing = (needed || []).filter(hs => !c.data[hs]);
  if (missing.length > 0) {
    log(`Cache missing ${missing.length} code(s) — refreshing.`);
    return null;
  }
  log(`Cache hit (${ageDays.toFixed(1)}d old, expires in ${(CACHE_DAYS - ageDays).toFixed(1)}d).`);
  return c.data;
}

function saveCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VER, fetchedAt: new Date().toISOString(), data }, null, 2), 'utf8');
    log(`Cache saved (${Object.keys(data).length} HS codes).`);
  } catch (err) { warn(`Cache write: ${err.message}`); }
}

// ─── Single API call for one HS code + one year ────────────────────────────────

async function fetchOneYear(hsCode, year) {
  try {
    const { data } = await axios.get(BASE, {
      timeout : TIMEOUT_MS,
      // No partnerCode filter → API returns one row per destination country
      // (partnerCode=0 would return only the world aggregate, no country breakdown)
      params  : { reporterCode: REPORTER, period: year, flowCode: FLOW, cmdCode: hsCode },
      headers : { Accept: 'application/json', 'User-Agent': 'PakistanTradeAgent/1.0' },
    });

    const rows = data?.data;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Separate individual-partner rows (partnerCode ≠ 0) from world-aggregate rows
    const partnerRows = rows.filter(r => Number(r.partnerCode) !== 0 && r.primaryValue > 0 && r.netWgt > 0);
    const useRows     = partnerRows.length > 0
      ? partnerRows
      : rows.filter(r => r.primaryValue > 0 && r.netWgt > 0);  // fallback: use whatever we got

    let totalValue = 0, totalWgt = 0;
    for (const r of useRows) {
      totalValue += r.primaryValue;  // USD
      totalWgt   += r.netWgt;        // kg
    }

    if (totalWgt < 1_000) return null;  // < 1 tonne — unreliable

    const usdPerTon = Math.round((totalValue / totalWgt) * 1_000);
    if (usdPerTon < 10 || usdPerTon > 2_000_000) return null;  // sanity

    // Top 5 destination countries by export value
    const topMarkets = partnerRows.length > 0
      ? partnerRows
          .sort((a, b) => b.primaryValue - a.primaryValue)
          .slice(0, 5)
          .map(r => ({
            country : shortCountry(r.partnerDesc || String(r.partnerCode)),
            valuePct: Math.round((r.primaryValue / totalValue) * 100),
          }))
      : [];

    return {
      usdPerTon,
      topMarkets,
      period       : year,
      totalValueUsd: Math.round(totalValue),
      totalWgtTons : Math.round(totalWgt / 1_000),
    };
  } catch (err) {
    const status = err.response?.status;
    // 429 = rate limited, 5xx = server error — propagate so caller can stop
    if (status === 429 || (status >= 500)) throw err;
    warn(`HS ${hsCode} ${year}: ${status ? `HTTP ${status}` : err.message}`);
    return null;
  }
}

// ─── Fetch one HS code trying multiple years ──────────────────────────────────

async function fetchOne(hsCode, index, total) {
  for (const year of TRY_YEARS) {
    const r = await fetchOneYear(hsCode, year);
    if (r) {
      const label = `${r.usdPerTon.toLocaleString()}/t (${r.totalWgtTons.toLocaleString()} t, ${year})`;
      log(`  [${String(index + 1).padStart(3)}/${total}] HS ${hsCode} → $${label}`);
      return {
        ...r,
        confidence : 'official',
        source     : `UN Comtrade Pakistan exports ${year}`,
        dataUrl    : verifyUrl(hsCode, year),
      };
    }
    // Small pause between year-retries (not full inter-commodity delay)
    if (year !== TRY_YEARS[TRY_YEARS.length - 1]) await new Promise(r => setTimeout(r, 300));
  }
  log(`  [${String(index + 1).padStart(3)}/${total}] HS ${hsCode} → no data in any year`);
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch Pakistan export unit values for a list of HS-6 codes.
 * Tries years 2023, 2022, 2021 for each code before giving up.
 * Caches successful results for 30 days.
 *
 * @param  {string[]} hsCodes  six-digit HS commodity codes
 * @returns {Promise<Object>}  { [hsCode]: { usdPerTon, period, confidence, source, dataUrl, ... } }
 */
async function fetchComtradePrices(hsCodes) {
  const unique = [...new Set((hsCodes || []).filter(Boolean))];
  if (unique.length === 0) return {};

  // Fresh cache?
  const cached = loadFreshCache(unique);
  if (cached) {
    // Resolve any numeric M49 country codes stored by older cache versions
    for (const entry of Object.values(cached)) {
      if (Array.isArray(entry.topMarkets)) {
        entry.topMarkets = entry.topMarkets.map(m => ({
          ...m, country: shortCountry(m.country),
        }));
      }
    }
    return cached;
  }

  log(`Fetching ${unique.length} HS codes from UN Comtrade (tries up to ${TRY_YEARS.join('/')} per code)…`);
  const result = {};
  let ok = 0, noData = 0;

  for (let i = 0; i < unique.length; i++) {
    const hs = unique[i];
    try {
      const r = await fetchOne(hs, i, unique.length);
      if (r) { result[hs] = r; ok++; }
      else noData++;
    } catch (err) {
      // Rate limit or server error — pause and continue
      warn(`HS ${hs}: ${err.message} — pausing 5s`);
      await sleep(5_000);
      noData++;
    }
    if (i < unique.length - 1) await sleep(DELAY_MS);
  }

  log(`Comtrade complete: ${ok} fetched, ${noData} with no Pakistan data.`);

  if (ok > 0) {
    saveCache(result);
    return result;
  }

  // All calls failed — try stale cache
  const stale = readCacheFile();
  if (stale?.data) {
    warn('All API calls failed — using stale cache.');
    return stale.data;
  }
  warn('No Comtrade data available (no cache, API down).');
  return {};
}

module.exports = { fetchComtradePrices };
