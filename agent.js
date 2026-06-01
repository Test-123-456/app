#!/usr/bin/env node
/**
 * agent.js — CLI entry point + cron scheduler
 *
 * Usage:
 *   node agent.js          — start the scheduler (runs every day at 07:00 PKT)
 *   node agent.js run      — run the analysis once right now and exit
 *   node agent.js --help   — show usage
 */

'use strict';

require('dotenv').config();
const cron = require('node-cron');
const { runAnalysis } = require('./index');

const CRON_SCHEDULE = '0 7 * * *'; // 07:00 every day
const TIMEZONE      = 'Asia/Karachi'; // PKT = UTC+5

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const [,, ...args] = process.argv;
const command = (args[0] || '').toLowerCase();

if (command === '--help' || command === '-h') {
  console.log(`
Pakistan Trade Arbitrage Intelligence Agent
───────────────────────────────────────────
Usage:
  node agent.js          Start the daily cron scheduler (07:00 PKT every day)
  node agent.js run      Run the analysis immediately and exit
  node agent.js --help   Show this help message

Environment:
  Copy .env.example → .env and fill in your API keys before running.
  Reports are saved to the directory set in REPORT_DIR (default: ./reports/).

Cron schedule: "${CRON_SCHEDULE}" (${TIMEZONE})
  `);
  process.exit(0);
}

if (command === 'run') {
  // ── One-shot manual run ────────────────────────────────────────────────────
  console.log('[agent] Manual run triggered.');
  runAnalysis()
    .then(({ paths }) => {
      if (paths.htmlPath) {
        console.log(`\n[agent] Done. Open your report:\n  ${paths.htmlPath}`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error(`[agent] Fatal error during analysis: ${err.message}`);
      process.exit(1);
    });

} else {
  // ── Scheduled daemon mode ──────────────────────────────────────────────────
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[agent] Invalid cron expression: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  console.log(`[agent] Scheduler started.`);
  console.log(`[agent] Analysis will run daily at 07:00 ${TIMEZONE} (cron: "${CRON_SCHEDULE}").`);
  console.log('[agent] Run `node agent.js run` to trigger manually at any time.\n');

  let isRunning = false;

  cron.schedule(CRON_SCHEDULE, async () => {
    if (isRunning) {
      console.warn('[agent] Previous run is still in progress — skipping this tick.');
      return;
    }
    isRunning = true;
    console.log(`[agent] ⏰ Cron triggered at ${new Date().toLocaleString('en-PK', { timeZone: TIMEZONE })} PKT`);
    try {
      await runAnalysis();
    } catch (err) {
      console.error(`[agent] Run failed: ${err.message}`);
    } finally {
      isRunning = false;
    }
  }, { timezone: TIMEZONE });

  // Keep the process alive; surface unhandled rejections rather than silently dying
  process.on('unhandledRejection', (reason) => {
    console.error('[agent] Unhandled promise rejection:', reason);
  });

  process.on('SIGINT',  () => { console.log('\n[agent] Shutting down scheduler. Goodbye.'); process.exit(0); });
  process.on('SIGTERM', () => { console.log('[agent] SIGTERM received. Shutting down.');    process.exit(0); });
}
