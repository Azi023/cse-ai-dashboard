// Tier 1: Business Activity Screen — Hard-coded Blacklist
// Stocks that are AUTOMATICALLY NON-COMPLIANT based on haram business activities.
// Symbol format uses CSE's .N0000 suffix convention.

export const SHARIAH_BLACKLIST = {
  // Alcohol & Beverages
  alcohol: [
    { symbol: 'DIST.N0000', name: 'Distilleries Company of Sri Lanka PLC', reason: 'Alcohol production' },
    { symbol: 'LION.N0000', name: 'Lion Brewery (Ceylon) PLC', reason: 'Beer production' },
    { symbol: 'BREW.N0000', name: 'Ceylon Beverage Holdings PLC', reason: 'Alcohol/beer production' },
    { symbol: 'GILI.N0000', name: 'Gilnow (Pvt) Ltd', reason: 'Alcohol distribution' },
    { symbol: 'CARG.N0000', name: 'Cargills (Ceylon) PLC', reason: 'Significant alcohol retail segment' },
  ],

  // Tobacco
  tobacco: [
    { symbol: 'CTC.N0000', name: 'Ceylon Tobacco Company PLC', reason: 'Tobacco manufacturing' },
  ],

  // Conventional Banking (interest-based)
  conventionalBanking: [
    { symbol: 'COMB.N0000', name: 'Commercial Bank of Ceylon PLC', reason: 'Conventional banking' },
    { symbol: 'HNB.N0000', name: 'Hatton National Bank PLC', reason: 'Conventional banking' },
    { symbol: 'SAMP.N0000', name: 'Sampath Bank PLC', reason: 'Conventional banking' },
    { symbol: 'SEYB.N0000', name: 'Seylan Bank PLC', reason: 'Conventional banking' },
    { symbol: 'NDB.N0000', name: 'National Development Bank PLC', reason: 'Conventional banking' },
    { symbol: 'DFCC.N0000', name: 'DFCC Bank PLC', reason: 'Conventional banking' },
    { symbol: 'PABC.N0000', name: 'Pan Asia Banking Corporation PLC', reason: 'Conventional banking' },
    { symbol: 'UBC.N0000', name: 'Union Bank of Colombo PLC', reason: 'Conventional banking' },
    { symbol: 'CARG.N0000', name: 'Cargills Bank Ltd', reason: 'Conventional banking' },
  ],

  // Conventional Insurance
  conventionalInsurance: [
    { symbol: 'ALIC.N0000', name: 'Sri Lanka Insurance Corporation Ltd', reason: 'Conventional insurance' },
    { symbol: 'JINS.N0000', name: 'Janashakthi Insurance PLC', reason: 'Conventional insurance' },
    { symbol: 'CINS.N0000', name: 'Ceylinco Insurance PLC', reason: 'Conventional insurance' },
    { symbol: 'AINS.N0000', name: 'Allianz Insurance Lanka Ltd', reason: 'Conventional insurance' },
    { symbol: 'HASU.N0000', name: 'HNB Assurance PLC', reason: 'Conventional insurance' },
    { symbol: 'UASL.N0000', name: 'Union Assurance PLC', reason: 'Conventional insurance' },
    { symbol: 'COOP.N0000', name: 'Co-operative Insurance Co PLC', reason: 'Conventional insurance' },
  ],

  // Finance Companies (interest-based lending)
  financeCompanies: [
    { symbol: 'LFIN.N0000', name: 'LOLC Finance PLC', reason: 'Conventional finance/leasing' },
    { symbol: 'CDB.N0000', name: 'Citizens Development Business PLC', reason: 'Conventional finance' },
    { symbol: 'CFIN.N0000', name: 'Central Finance Company PLC', reason: 'Conventional finance' },
    { symbol: 'LFCL.N0000', name: 'LB Finance PLC', reason: 'Conventional finance' },
    { symbol: 'PLC.N0000', name: "People's Leasing & Finance PLC", reason: 'Conventional finance/leasing' },
    { symbol: 'SFCL.N0000', name: 'Singer Finance (Lanka) PLC', reason: 'Conventional finance' },
    { symbol: 'SENA.N0000', name: 'Senkadagala Finance PLC', reason: 'Conventional finance' },
    { symbol: 'SMLL.N0000', name: 'SMB Leasing PLC', reason: 'Conventional leasing' },
    { symbol: 'COCR.N0000', name: 'Commercial Credit and Finance PLC', reason: 'Conventional finance' },
  ],
};

/** Get flat list of all blacklisted symbols (deduplicated). */
export function getBlacklistedSymbols(): string[] {
  const seen = new Set<string>();
  for (const stocks of Object.values(SHARIAH_BLACKLIST)) {
    for (const stock of stocks) {
      seen.add(stock.symbol);
    }
  }
  return Array.from(seen);
}

/** Check if a symbol is blacklisted. Returns reason and category if found. */
export function isBlacklisted(symbol: string): {
  blacklisted: boolean;
  reason?: string;
  category?: string;
} {
  for (const [category, stocks] of Object.entries(SHARIAH_BLACKLIST)) {
    const found = stocks.find((s) => s.symbol === symbol);
    if (found) {
      return { blacklisted: true, reason: found.reason, category };
    }
  }
  return { blacklisted: false };
}

/** Get all blacklisted entries with their categories (deduplicated by symbol). */
export function getBlacklistEntries(): Array<{
  symbol: string;
  name: string;
  reason: string;
  category: string;
}> {
  const seen = new Set<string>();
  const entries: Array<{ symbol: string; name: string; reason: string; category: string }> = [];
  for (const [category, stocks] of Object.entries(SHARIAH_BLACKLIST)) {
    for (const stock of stocks) {
      if (!seen.has(stock.symbol)) {
        seen.add(stock.symbol);
        entries.push({ ...stock, category });
      }
    }
  }
  return entries;
}
