/**
 * buyers.js — Real international buyer leads + Pakistani supplier search links
 *
 * BUYERS  (importers who want to buy Pakistan's commodities):
 *   Source: go4worldbusiness.com LD+JSON ItemList — real RFQ listings
 *   If the page returns no structured data: return empty array (no fake padding)
 *
 * SELLERS (Pakistani suppliers):
 *   Live scraping of go4worldbusiness suppliers page is unreliable.
 *   We return ONLY verified search portal links — TDAP, TradeKey, go4worldbusiness.
 *   No hardcoded company names. No fake / demo data.
 *
 * If 0 results are found, the reporter shows search links with a clear notice.
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

const MAX_RESULTS = 5;
const TIMEOUT_MS  = 15_000;
const HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml',
  'Accept-Language' : 'en-US,en;q=0.9',
};

// ─── Slug helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a go4worldbusiness-compatible URL slug from a commodity label.
 * Strips everything after the first separator (/, —, (, [, :) so
 * "Rice — Basmati"          → "rice"
 * "Plum / Alucha"           → "plum"
 * "Sports Gloves (Boxing)"  → "sports-gloves"
 * "Millet (Bajra)"          → "millet"
 */
function makeG4wSlug(name) {
  const first = name.split(/[/—([:]/, 1)[0].trim();  // em-dash U+2014
  return first.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Generic slug used for search URL builders */
function makeSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── LD+JSON buyer parser ─────────────────────────────────────────────────────

/**
 * Parse go4worldbusiness buyers page HTML.
 * Extracts real RFQ leads from the LD+JSON ItemList schema embedded in the page.
 *
 * Each lead contains:
 *   company  — buyer company / contact name
 *   country  — destination country extracted from "Destination Port:" line
 *   qty      — quantity required
 *   link     — direct URL to the full buy-lead page
 *   source   — 'go4worldbusiness.com'
 */
function parseG4wBuyers(htmlData) {
  const $ = cheerio.load(htmlData);
  const results = [];

  $('script[type="application/ld+json"]').each((_, scriptEl) => {
    if (results.length >= MAX_RESULTS) return false;
    let d;
    try { d = JSON.parse($(scriptEl).text()); } catch { return; }
    if (d['@type'] !== 'ItemList') return;

    for (const item of (d.itemListElement || [])) {
      if (results.length >= MAX_RESULTS) break;
      const desc    = item.item?.description || '';
      const itemUrl = item.item?.url          || '';

      // ── Company name: from "Contact : Name" line ──────────────────────────
      const contactM = desc.match(/Contact\s*[:\-]+\s*-?\s*([^\n\r]+)/i);
      let company = contactM ? contactM[1].trim() : '';
      if (!company || company.length < 2) {
        // Fallback: strip "WANTED : " prefix from item name
        company = (item.item?.name || '').replace(/^WANTED\s*:\s*/i, '').trim().substring(0, 80);
      }
      if (!company || company.length < 2) continue;

      // ── Destination country: from "Destination Port: City, Country" ───────
      const portM = desc.match(/Destination Port\s*:\s*([^\n\r]+)/i);
      const portStr = portM ? portM[1].trim() : '';
      // Take last comma-separated segment as country name
      const portParts = portStr.split(',').map(s => s.trim()).filter(Boolean);
      const country = portParts[portParts.length - 1] || portStr;

      // ── Quantity ──────────────────────────────────────────────────────────
      const qtyM = desc.match(/Quantity Required\s*:\s*([^\n\r]+)/i);
      const qty = qtyM ? qtyM[1].replace(/^-+\s*/, '').trim() : '';

      results.push({
        company : company.substring(0, 80),
        country : country.substring(0, 60),
        qty     : qty.substring(0, 60),
        link    : itemUrl,
        source  : 'go4worldbusiness.com',
      });
    }
  });

  return results;
}

// ─── Live buyer scraper ───────────────────────────────────────────────────────

async function scrapeGo4Buyers(commodityName) {
  const slug    = makeG4wSlug(commodityName);
  const url     = `https://www.go4worldbusiness.com/buyers/${slug}-buyers.html`;
  const results = [];

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT_MS, maxRedirects: 4 });
    const parsed   = parseG4wBuyers(data);
    results.push(...parsed);
    if (parsed.length > 0) {
      console.log(`[buyers] go4worldbusiness buyers "${commodityName}" (${slug}): ${parsed.length} leads`);
    } else {
      console.warn(`[buyers] go4worldbusiness buyers "${commodityName}" (${slug}): page OK but 0 LD+JSON leads`);
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      console.warn(`[buyers] go4worldbusiness buyers "${commodityName}" (${slug}): 404 — no page for this slug`);
    } else {
      console.warn(`[buyers] go4worldbusiness buyers "${commodityName}" (${slug}): ${err.message}`);
    }
  }

  return results;
}

// ─── Search URL builders ──────────────────────────────────────────────────────

const alibabaUrl     = c => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(c + ' importer')}&IndexArea=company_en`;
const exporthubUrl   = c => `https://www.exporthub.com/buying-leads/${makeSlug(c)}`;
const go4BuyerUrl    = c => `https://www.go4worldbusiness.com/buyers/${makeG4wSlug(c)}-buyers.html`;
const go4SupplierUrl = c => `https://www.go4worldbusiness.com/suppliers/${makeG4wSlug(c)}-suppliers.html`;
const tdapUrl        = c => `https://www.tdap.gov.pk/?s=${encodeURIComponent(c + ' exporter')}`;
const tradekeyUrl    = c => `https://www.tradekey.com/search/?search=${encodeURIComponent(c + ' Pakistan supplier')}`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find real international buyers for the top N ranked commodities.
 * Returns only verified leads scraped from go4worldbusiness LD+JSON.
 * If 0 leads found, returns empty array — reporter shows search links instead.
 */
async function findBuyers(ranked, topN = 5) {
  const targets = ranked.filter(r => r.opportunity !== 'none').slice(0, topN);
  const result  = {};

  for (const r of targets) {
    console.log(`[buyers] Searching buyers: ${r.name}`);
    const buyers = await scrapeGo4Buyers(r.name);

    result[r.name] = {
      buyers,
      searchUrls: {
        go4worldbusiness : go4BuyerUrl(r.name),
        alibaba          : alibabaUrl(r.name),
        exporthub        : exporthubUrl(r.name),
      },
    };
  }
  return result;
}

/**
 * Build search portal links for Pakistani suppliers.
 * We do NOT scrape or invent supplier company names.
 * The reporter will display these links with a clear "search here" message.
 */
async function findSellers(ranked, topN = 5) {
  const targets = ranked.filter(r => r.opportunity !== 'none').slice(0, topN);
  const result  = {};

  for (const r of targets) {
    console.log(`[buyers] Building supplier search links: ${r.name}`);
    result[r.name] = {
      sellers    : [],   // empty — no fake data
      searchUrls : {
        tdap             : tdapUrl(r.name),
        go4worldbusiness : go4SupplierUrl(r.name),
        tradekey         : tradekeyUrl(r.name),
        alibaba          : `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(r.name + ' Pakistan supplier')}&IndexArea=company_en`,
      },
    };
  }
  return result;
}

module.exports = { findBuyers, findSellers };
