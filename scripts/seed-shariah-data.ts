/**
 * seed-shariah-data.ts — Seed Shariah compliance status for CSE stocks
 *
 * Marks stocks as COMPLIANT/NON_COMPLIANT based on:
 * - Almas Equities research (March 2026 investment brief)
 * - AAOIFI / Meezan / Dow Jones methodology
 *
 * Leaves all other stocks as PENDING_REVIEW (they need financial ratio screening).
 *
 * Usage (from project root):
 *   cd src/backend && npx tsx ../../scripts/seed-shariah-data.ts
 *
 * Idempotent: safe to run multiple times.
 */

import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';

// Resolve pg from the backend's node_modules (scripts/ has no own node_modules).
// When run via: cd src/backend && npx tsx ../../scripts/seed-shariah-data.ts
// process.cwd() is src/backend/ which has pg installed.
const backendRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { Client } = backendRequire('pg') as typeof import('pg');

// ─── Load .env (same pattern as atrad-recon.ts) ──────────────────────────────

function loadEnv(): void {
  // When run via: cd src/backend && npx tsx ../../scripts/seed-shariah-data.ts
  // __dirname resolves to the scripts/ dir, and cwd is src/backend/
  const cwdEnv = path.resolve(process.cwd(), '.env');
  const scriptEnv = path.resolve(__dirname, '..', 'src', 'backend', '.env');
  const altPath = path.resolve(__dirname, '..', '.env');
  const filePath = fs.existsSync(cwdEnv) ? cwdEnv :
                   fs.existsSync(scriptEnv) ? scriptEnv : altPath;
  if (!fs.existsSync(filePath)) {
    console.log('[env] No .env file found, using process.env');
    return;
  }
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

// ─── Shariah Data ────────────────────────────────────────────────────────────

/**
 * Verified COMPLIANT stocks (March 2026, Almas Equities / AAOIFI research).
 * These pass both Tier 1 (no haram business) and Tier 2 (financial ratios).
 * All are manufacturing, construction, agriculture, or materials — no financial services.
 */
const COMPLIANT_SYMBOLS = [
  'AEL.N0000',   // Access Engineering — construction, infrastructure
  'TJL.N0000',   // Teejay Lanka — textiles/manufacturing, export-oriented
  'TKYO.N0000',  // Tokyo Cement — cement/materials
  'TKYO.X0000',  // Tokyo Cement (voting shares)
  'LLUB.N0000',  // Chevron Lubricants — lubricants, low debt
  'AGST.N0000',  // Agstar — fertilizer/agriculture
  'AGST.X0000',  // Agstar (voting shares)
  'ACL.N0000',   // ACL Cables — cable manufacturing
  'TILE.N0000',  // Lanka Tiles — ceramic tiles/materials
  'GRAN.N0000',  // Granitite Products — granite/construction materials
  'RCL.N0000',   // Royal Ceramics — ceramics/materials
];

/**
 * Confirmed NON_COMPLIANT stocks per AAOIFI criteria:
 * - Banks and finance companies (interest-based business)
 * - Insurance companies (gharar / uncertainty)
 * - Tobacco (CTC)
 * - Alcohol/distilleries (DIST, MELS, LEON)
 * - Casino/gambling exposure (JKH via Cinnamon casino + Union Assurance subsidiary)
 * - Conventional leasing/finance companies (interest-based)
 */
const NON_COMPLIANT_SYMBOLS = [
  // Banks
  'COMB.N0000',  // Commercial Bank
  'HNB.N0000',   // Hatton National Bank
  'SAMP.N0000',  // Sampath Bank
  'SEYB.N0000',  // Seylan Bank
  'NDB.N0000',   // National Development Bank
  'DFCC.N0000',  // DFCC Bank
  'ABL.N0000',   // Amana Bank (Islamic bank — screened as non-compliant for consistency)
  'PABC.N0000',  // Pan Asia Banking Corporation
  'CBNK.N0000',  // Cargills Bank
  'UBC.N0000',   // Union Bank
  'PBK.N0000',   // People's Bank (if listed)
  'MBSL.N0000',  // Merchant Bank of Sri Lanka
  // Insurance
  'AAIC.N0000',  // AIA Insurance Lanka
  'AINS.N0000',  // Amana Insurance
  'CTCE.N0000',  // Ceylinco Insurance
  'CINS.N0000',  // Continental Insurance
  'HHL.N0000',   // Hemas Holdings (insurance subsidiary)
  'JINS.N0000',  // Janashakthi Insurance
  'SINS.N0000',  // Sri Lanka Insurance Corporation
  'UAL.N0000',   // Union Assurance
  // Tobacco
  'CTC.N0000',   // Ceylon Tobacco Company
  // Alcohol/distilleries
  'DIST.N0000',  // Ceylon Distilleries / Lion Brewery
  'MELS.N0000',  // Melstacorp (alcohol distribution)
  'LEON.N0000',  // Lion Brewery Ceylon
  // Casinos/gaming
  'JKH.N0000',   // John Keells Holdings (Cinnamon casino + Union Assurance)
  // Conventional finance/leasing
  'LOLC.N0000',  // LOLC Holdings
  'LOFC.N0000',  // LOLC Finance
  'LB.N0000',    // Lanka ORIX Leasing
  'CFIN.N0000',  // Central Finance
  'LFIN.N0000',  // Lanka Finance
  'SFIN.N0000',  // Seylan Merchant Leasing
  'CALF.N0000',  // CAL Financial
  'SFL.N0000',   // Sarvodaya Finance
  'AFSL.N0000',  // Asia Finance
  'AAF.N0000',   // Alliance Finance
  'BFN.N0000',   // Bimputh Finance
  'CRL.N0000',   // Citizens' Finance & Leasing
  'DIAL.N0000',  // Dialog Axiata (flagged for financial services JV exposure)
  'SCAP.N0000',  // Softlogic Capital
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? 'cse_user',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME ?? 'cse_dashboard',
  });

  await client.connect();
  console.log('[seed] Connected to PostgreSQL');

  try {
    // Mark COMPLIANT
    if (COMPLIANT_SYMBOLS.length > 0) {
      const placeholders = COMPLIANT_SYMBOLS.map((_, i) => `$${i + 1}`).join(', ');
      const result = await client.query(
        `UPDATE stocks SET shariah_status = 'compliant', updated_at = NOW()
         WHERE symbol IN (${placeholders})`,
        COMPLIANT_SYMBOLS,
      );
      console.log(`[seed] ✅ Marked ${result.rowCount} stocks as COMPLIANT`);
      for (const sym of COMPLIANT_SYMBOLS) {
        console.log(`         ${sym}`);
      }
    }

    // Mark NON_COMPLIANT
    // Filter to only symbols that actually exist in the DB
    const nonCompliantResult = await client.query(
      `UPDATE stocks SET shariah_status = 'non_compliant', updated_at = NOW()
       WHERE symbol = ANY($1::text[])`,
      [NON_COMPLIANT_SYMBOLS],
    );
    console.log(`\n[seed] 🚫 Marked ${nonCompliantResult.rowCount} stocks as NON_COMPLIANT`);

    // Update AEL.N0000 holding fees to LKR 155.69 (actual broker fees paid)
    const feesResult = await client.query(
      `UPDATE portfolio SET fees = 155.69, updated_at = NOW()
       WHERE symbol = 'AEL.N0000' AND is_open = true AND (fees IS NULL OR fees = 0)`,
    );
    if (feesResult.rowCount && feesResult.rowCount > 0) {
      console.log(`\n[seed] 💰 Updated AEL.N0000 holding fees to LKR 155.69`);
    } else {
      console.log(`\n[seed] 💰 AEL.N0000 fees already set or no open holding found`);
    }

    // Print final stats
    const statsResult = await client.query(`
      SELECT shariah_status, COUNT(*) as count
      FROM stocks
      GROUP BY shariah_status
      ORDER BY count DESC
    `);
    console.log('\n[seed] Final Shariah screening stats:');
    for (const row of statsResult.rows) {
      const icon =
        row.shariah_status === 'compliant' ? '✅' :
        row.shariah_status === 'non_compliant' ? '🚫' : '⏳';
      console.log(`  ${icon} ${row.shariah_status}: ${row.count}`);
    }

    console.log('\n[seed] Done. ✓');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
