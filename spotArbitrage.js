/**
 * spotArbitrage.js — Domestic city-to-city price spread analysis
 *
 * Uses per-city mandi prices from AMIS Daily Market Changes to find
 * commodities where buying in a cheap city and trucking to an expensive city
 * would yield a net profit after transport costs.
 *
 * Price source: AMIS Daily Market Changes (PKR / 100 kg, wholesale mandi rate)
 * Transport: Estimated at PKR 1,200 / metric ton / 100 km (standard truck)
 */

'use strict';

const { DB } = require('./commodities');

// ─── Road distances (km) between AMIS-reporting cities ───────────────────────
// Approximate road distances derived from Google Maps / NHMP data.
// Cities currently seen in AMIS Daily: Lahore, Rawalpindi, Sahiwal, Khanewal,
// Lodhran, Kahrorpacca, Chichawatni, Chakwal, Jhang

// All AMIS-reporting Punjab cities with road distances in km
// Sources: Google Maps route estimates (NH-5, M-2, M-3, M-4 motorway network)
const ROAD_KM = {
  // Lahore hub
  'Lahore|Rawalpindi'    : 380,
  'Lahore|Sahiwal'       : 190,
  'Lahore|Khanewal'      : 310,
  'Lahore|Lodhran'       : 380,
  'Lahore|Kahrorpacca'   : 430,
  'Lahore|Chichawatni'   : 240,
  'Lahore|Chakwal'       : 135,
  'Lahore|Jhang'         : 205,
  'Lahore|Okara'         : 120,
  'Lahore|Hafizabad'     : 95,
  'Lahore|TTSingh'       : 185,   // Toba Tek Singh
  'Lahore|RahimYarKhan'  : 560,
  'Lahore|Chiniot'       : 165,
  'Lahore|Jhelum'        : 265,
  'Lahore|Hasanabdal'    : 310,
  'Lahore|Hazro'         : 340,
  // Rawalpindi / Islamabad
  'Rawalpindi|Sahiwal'   : 480,
  'Rawalpindi|Khanewal'  : 570,
  'Rawalpindi|Lodhran'   : 620,
  'Rawalpindi|Kahrorpacca': 665,
  'Rawalpindi|Chichawatni': 520,
  'Rawalpindi|Chakwal'   : 95,
  'Rawalpindi|Jhang'     : 300,
  'Rawalpindi|Okara'     : 400,
  'Rawalpindi|Hafizabad' : 330,
  'Rawalpindi|TTSingh'   : 470,
  'Rawalpindi|RahimYarKhan': 840,
  'Rawalpindi|Chiniot'   : 340,
  'Rawalpindi|Jhelum'    : 100,
  'Rawalpindi|Hasanabdal': 60,
  'Rawalpindi|Hazro'     : 75,
  // Central Punjab cluster
  'Sahiwal|Khanewal'     : 130,
  'Sahiwal|Lodhran'      : 195,
  'Sahiwal|Kahrorpacca'  : 240,
  'Sahiwal|Chichawatni'  : 55,
  'Sahiwal|Chakwal'      : 290,
  'Sahiwal|Jhang'        : 165,
  'Sahiwal|Okara'        : 75,
  'Sahiwal|Hafizabad'    : 210,
  'Sahiwal|TTSingh'      : 100,
  'Sahiwal|RahimYarKhan' : 380,
  'Sahiwal|Chiniot'      : 165,
  'Khanewal|Lodhran'     : 75,
  'Khanewal|Kahrorpacca' : 120,
  'Khanewal|Chichawatni' : 80,
  'Khanewal|Chakwal'     : 385,
  'Khanewal|Jhang'       : 195,
  'Khanewal|Okara'       : 190,
  'Khanewal|TTSingh'     : 80,
  'Khanewal|RahimYarKhan': 265,
  'Khanewal|Chiniot'     : 200,
  'Lodhran|Kahrorpacca'  : 45,
  'Lodhran|Chichawatni'  : 150,
  'Lodhran|Chakwal'      : 460,
  'Lodhran|Jhang'        : 270,
  'Lodhran|RahimYarKhan' : 195,
  'Kahrorpacca|Chichawatni': 190,
  'Kahrorpacca|Chakwal'  : 500,
  'Kahrorpacca|Jhang'    : 310,
  'Kahrorpacca|RahimYarKhan': 155,
  'Chichawatni|Chakwal'  : 340,
  'Chichawatni|Jhang'    : 130,
  'Chichawatni|Okara'    : 130,
  'Chichawatni|TTSingh'  : 50,
  'Chakwal|Jhang'        : 200,
  'Chakwal|Jhelum'       : 80,
  'Chakwal|Hasanabdal'   : 45,
  'Jhang|Chiniot'        : 55,
  'Jhang|TTSingh'        : 75,
  'Okara|Hafizabad'      : 195,
  'Okara|TTSingh'        : 105,
  'Hafizabad|Chiniot'    : 70,
  'Hafizabad|Jhang'      : 110,
  'TTSingh|RahimYarKhan' : 290,
  'TTSingh|Chiniot'      : 130,
  'Jhelum|Hasanabdal'    : 65,
  'Hasanabdal|Hazro'     : 25,
};

// PKR per metric ton per 100 km — standard diesel truck, Punjab roads
const TRUCK_PKR_PER_TON_PER_100KM = 1200;

// Minimum spread % to report (filter out noise)
const MIN_SPREAD_PCT = 15;

// ─────────────────────────────────────────────────────────────────────────────

function getDistance(cityA, cityB) {
  return ROAD_KM[`${cityA}|${cityB}`] || ROAD_KM[`${cityB}|${cityA}`] || null;
}

/**
 * Trucking cost in PKR per 100 kg for a given road distance.
 * (PKR/ton/100km × km) / 100km → PKR/ton → / 10 → PKR/100kg
 */
function truckCostPkr100kg(km) {
  return Math.round((TRUCK_PKR_PER_TON_PER_100KM / 100) * km / 10);
}

/**
 * Calculate domestic spot arbitrage opportunities.
 *
 * @param {Object} cityPrices  — { commodityKey: { cityName: pkr100kg } }
 * @param {Object} exchangeRate — { pkrPerUsd }
 * @returns {Array} sorted array of opportunities, best net profit first
 */
function calculateSpotArbitrage(cityPrices, exchangeRate) {
  const { pkrPerUsd } = exchangeRate;
  const results = [];

  for (const [key, cityMap] of Object.entries(cityPrices)) {
    const meta   = DB[key] || {};
    const cities = Object.entries(cityMap).filter(([, p]) => p > 0);
    if (cities.length < 2) continue;

    // Check every pair: cheaper city → more expensive city
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const [cA, pA] = cities[i];
        const [cB, pB] = cities[j];

        // Ensure buyCity is cheaper
        const [buyCity, buyPkr, sellCity, sellPkr] =
          pA <= pB ? [cA, pA, cB, pB] : [cB, pB, cA, pA];

        const spreadPkr  = sellPkr - buyPkr;
        const spreadPct  = (spreadPkr / buyPkr) * 100;
        if (spreadPct < MIN_SPREAD_PCT) continue;

        const distKm      = getDistance(buyCity, sellCity);
        const truckPkr    = distKm !== null ? truckCostPkr100kg(distKm) : null;
        const netPkr      = truckPkr !== null ? spreadPkr - truckPkr : null;
        const netUsdTon   = netPkr  !== null ? Math.round((netPkr / pkrPerUsd) * 10) : null; // *10 = /100kg→/ton
        const viable      = netPkr  !== null ? netPkr > 0 : null;

        results.push({
          key,
          name           : meta.label || key,
          category       : meta.category || 'Other',
          buyCity,
          buyPkr100kg    : buyPkr,
          sellCity,
          sellPkr100kg   : sellPkr,
          spreadPkr100kg : spreadPkr,
          spreadPct      : Math.round(spreadPct * 10) / 10,
          distanceKm     : distKm,
          truckPkr100kg  : truckPkr,
          netPkr100kg    : netPkr,
          netUsdPerTon   : netUsdTon,
          viable,
        });
      }
    }
  }

  // Sort: viable opportunities first (highest net PKR), then unknown-distance, then non-viable
  return results.sort((a, b) => {
    if (a.viable && b.viable)   return (b.netPkr100kg  || 0) - (a.netPkr100kg  || 0);
    if (a.viable && !b.viable)  return -1;
    if (!a.viable && b.viable)  return 1;
    if (a.viable === null && b.viable === null) return b.spreadPkr100kg - a.spreadPkr100kg;
    if (a.viable === null)      return -1;
    if (b.viable === null)      return 1;
    return b.spreadPkr100kg - a.spreadPkr100kg; // both non-viable, sort by raw spread
  });
}

module.exports = { calculateSpotArbitrage };
