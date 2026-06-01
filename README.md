# 🇵🇰 Pakistan Trade Arbitrage Intelligence Agent

A Node.js agent that runs daily to identify profitable commodity export opportunities from Pakistan by comparing local wholesale/mandi prices against world market prices, accounting for sea-freight costs.

## What it does

1. **Scrapes** daily wholesale prices from [amis.pk](https://www.amis.pk/) for 8 commodities: mangoes, rice, onion, wheat, cotton, kinnow oranges, tomato, potato
2. **Fetches** live world commodity prices (commodities-api.com) and the PKR/USD rate (exchangerate-api.com)
3. **Calculates** net margin after shipping for each commodity and ranks them
4. **Searches** go4worldbusiness.com and ExportHub.com for active importers of the top 3 opportunities
5. **Generates** a clean HTML + JSON daily report saved to `./reports/`
6. **Runs automatically** every day at 07:00 Pakistan Standard Time via cron

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure API keys

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Source | Notes |
|---|---|---|
| `COMMODITIES_API_KEY` | [commodities-api.com](https://commodities-api.com) | Free tier: ~100 req/month |
| `EXCHANGE_RATE_API_KEY` | [exchangerate-api.com](https://exchangerate-api.com) | Free tier: 1,500 req/month |
| `SMTP_*` + `EMAIL_RECIPIENTS` | Your email provider | Optional — leave blank to skip email |

### 3. Run immediately (one-shot)

```bash
node agent.js run
```

Reports are written to `./reports/YYYY-MM-DD.html` and `./reports/YYYY-MM-DD.json`.  
Open the HTML file in any browser.

### 4. Start the daily scheduler

```bash
node agent.js
```

The agent will run silently and trigger every day at **07:00 PKT (Asia/Karachi)**.  
Use a process manager like [PM2](https://pm2.keymetrics.io/) to keep it running:

```bash
npm install -g pm2
pm2 start agent.js --name "pk-arbitrage"
pm2 save
pm2 startup   # persist across reboots
```

---

## Project structure

```
├── agent.js       CLI entry point + cron scheduler
├── index.js       Pipeline orchestrator
├── scraper.js     AMIS.pk wholesale price scraper
├── prices.js      World commodity prices + PKR/USD exchange rate
├── calculator.js  Arbitrage margin calculation & ranking
├── buyers.js      Active buyer search (go4worldbusiness, ExportHub)
├── reporter.js    HTML + JSON report generation + email delivery
├── .env.example   API key template (copy to .env)
└── reports/       Generated daily reports (auto-created)
```

---

## Margin formula

```
local_usd_per_kg  = (pkr_per_100kg ÷ 100) ÷ pkr_per_usd
gross_margin      = world_usd_per_kg − local_usd_per_kg
net_margin        = gross_margin − shipping_usd_per_kg     (default: $0.08/kg)
margin_pct        = (net_margin ÷ world_usd_per_kg) × 100
profit_per_ton    = net_margin × 1,000
```

Positive net margin → exporting at the world price after shipping is profitable.

---

## Data confidence levels

| Badge | Meaning |
|---|---|
| **LIVE** | Fetched from a live API or scraped today |
| **EST** | FAO / World Bank reference price (updated periodically in `prices.js`) |
| **FALLBACK** | Hardcoded 2024 average used when the live source is unavailable |

---

## Commodities covered

| Commodity | API symbol | World price unit | Notes |
|---|---|---|---|
| Wheat | `WHEAT` (commodities-api) | USD/bushel → USD/ton | Bulk grain |
| Rice | `RICE` (commodities-api) | USD/cwt → USD/ton | Generic non-basmati; basmati commands ~$1,100+/ton premium |
| Cotton | `COTTON` (commodities-api) | USD/lb → USD/ton | Lint cotton (world standard); AMIS shows phutti/seed cotton |
| Mango | — | Reference $950/ton | Pakistan is world's 4th largest mango exporter |
| Onion | — | Reference $320/ton | Strong seasonal price swings |
| Kinnow | — | Reference $550/ton | Sargodha region dominates production |
| Tomato | — | Reference $480/ton | High variance — best exported in winter |
| Potato | — | Reference $290/ton | Balochistan crop preferred for export |

---

## Environment variables reference

```
COMMODITIES_API_KEY      API key for commodities-api.com
EXCHANGE_RATE_API_KEY    API key for exchangerate-api.com
SMTP_HOST                SMTP server (e.g. smtp.gmail.com)
SMTP_PORT                587 (TLS) or 465 (SSL)
SMTP_USER                Sender email address
SMTP_PASS                App password (not your account password)
EMAIL_FROM               Friendly sender name + address
EMAIL_RECIPIENTS         Comma-separated recipient list
REPORT_DIR               Where to save reports (default: ./reports)
SHIPPING_COST_PER_KG     Sea freight estimate in USD/kg (default: 0.08)
LOG_LEVEL                debug | info | warn | error (default: info)
```

---

## Troubleshooting

**AMIS.pk scraping returns fallback prices**  
The website may have changed its HTML structure or be temporarily down.  Update `COMMODITY_ALIASES` and the table selectors in `scraper.js` to match the current page, or use the fallback prices (clearly labelled in the report).

**commodities-api.com returns errors**  
Check your `COMMODITIES_API_KEY` and your monthly quota on the free tier.  The agent falls back to FAO/World Bank reference prices automatically.

**Email not sending**  
Gmail requires an [App Password](https://support.google.com/accounts/answer/185833) (not your regular password) when 2FA is enabled.  Other SMTP providers work similarly.

---

## Disclaimer

Prices are indicative only.  Actual profitability depends on commodity grade/quality, destination port costs, customs duties, logistics partners, and market timing.  Always verify independently before making any trade decision.
