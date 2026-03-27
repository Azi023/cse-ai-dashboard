// Tier 1: Business Activity Screen — Hard-coded Blacklist
// Stocks that are AUTOMATICALLY NON-COMPLIANT based on haram business activities.
// Symbol format uses CSE's .N0000 suffix convention.

export const SHARIAH_BLACKLIST = {
  // Alcohol & Beverages
  alcohol: [
    {
      symbol: 'DIST.N0000',
      name: 'Distilleries Company of Sri Lanka PLC',
      reason: 'Alcohol production',
    },
    {
      symbol: 'LION.N0000',
      name: 'Lion Brewery (Ceylon) PLC',
      reason: 'Beer production',
    },
    {
      symbol: 'BREW.N0000',
      name: 'Ceylon Beverage Holdings PLC',
      reason: 'Alcohol/beer production',
    },
    {
      symbol: 'GILI.N0000',
      name: 'Gilnow (Pvt) Ltd',
      reason: 'Alcohol distribution',
    },
    {
      symbol: 'CARG.N0000',
      name: 'Cargills (Ceylon) PLC',
      reason: 'Significant alcohol retail segment',
    },
    {
      symbol: 'MELS.N0000',
      name: 'Melstacorp PLC',
      reason: 'Parent of Distilleries — alcohol production',
    },
  ],

  // Tobacco
  tobacco: [
    {
      symbol: 'CTC.N0000',
      name: 'Ceylon Tobacco Company PLC',
      reason: 'Tobacco manufacturing',
    },
  ],

  // Conventional Banking (interest-based)
  conventionalBanking: [
    {
      symbol: 'COMB.N0000',
      name: 'Commercial Bank of Ceylon PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'HNB.N0000',
      name: 'Hatton National Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'SAMP.N0000',
      name: 'Sampath Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'SEYB.N0000',
      name: 'Seylan Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'NDB.N0000',
      name: 'National Development Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'DFCC.N0000',
      name: 'DFCC Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'PABC.N0000',
      name: 'Pan Asia Banking Corporation PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'UBC.N0000',
      name: 'Union Bank of Colombo PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'NTB.N0000',
      name: 'Nations Trust Bank PLC',
      reason: 'Conventional banking',
    },
    {
      symbol: 'MBSL.N0000',
      name: 'Merchant Bank of Sri Lanka & Finance PLC',
      reason: 'Conventional banking/finance',
    },
  ],

  // Conventional Insurance
  conventionalInsurance: [
    {
      symbol: 'ALIC.N0000',
      name: 'Sri Lanka Insurance Corporation Ltd',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'JINS.N0000',
      name: 'Janashakthi Insurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'CINS.N0000',
      name: 'Ceylinco Insurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'AINS.N0000',
      name: 'Allianz Insurance Lanka Ltd',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'HASU.N0000',
      name: 'HNB Assurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'UASL.N0000',
      name: 'Union Assurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'COOP.N0000',
      name: 'Co-operative Insurance Co PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'AAIC.N0000',
      name: 'Asian Alliance Insurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'CTCE.N0000',
      name: 'Ceylinco Takaful Ltd',
      reason: 'Conventional insurance operations',
    },
    {
      symbol: 'HNBA.N0000',
      name: 'HNB Assurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'SLNS.N0000',
      name: 'Sri Lanka Insurance Corp',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'SINS.N0000',
      name: 'Softlogic Life Insurance PLC',
      reason: 'Conventional insurance',
    },
    {
      symbol: 'AMSL.N0000',
      name: 'AIA Insurance Lanka PLC',
      reason: 'Conventional insurance',
    },
  ],

  // Finance Companies (interest-based lending)
  financeCompanies: [
    {
      symbol: 'LFIN.N0000',
      name: 'LOLC Finance PLC',
      reason: 'Conventional finance/leasing',
    },
    {
      symbol: 'LOLC.N0000',
      name: 'LOLC Holdings PLC',
      reason: 'Finance holding — conventional interest',
    },
    {
      symbol: 'CDB.N0000',
      name: 'Citizens Development Business PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'CFIN.N0000',
      name: 'Central Finance Company PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'LFCL.N0000',
      name: 'LB Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'PLC.N0000',
      name: "People's Leasing & Finance PLC",
      reason: 'Conventional finance/leasing',
    },
    {
      symbol: 'SFCL.N0000',
      name: 'Singer Finance (Lanka) PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'SENA.N0000',
      name: 'Senkadagala Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'SMLL.N0000',
      name: 'SMB Leasing PLC',
      reason: 'Conventional leasing',
    },
    {
      symbol: 'COCR.N0000',
      name: 'Commercial Credit and Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'LLFL.N0000',
      name: 'Lanka Leasing and Finance PLC',
      reason: 'Conventional finance/leasing',
    },
    {
      symbol: 'CRSF.N0000',
      name: 'Ceybank Asset Management',
      reason: 'Conventional finance',
    },
    {
      symbol: 'BFIN.N0000',
      name: 'Bimputh Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'CFVF.N0000',
      name: 'CF Venture Financing',
      reason: 'Conventional finance',
    },
    {
      symbol: 'LDEV.N0000',
      name: 'Lanka Development Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'PMIC.N0000',
      name: 'Peoples Microfinance',
      reason: 'Conventional microfinance',
    },
    {
      symbol: 'AMF.N0000',
      name: 'AMF Finance',
      reason: 'Conventional finance',
    },
    {
      symbol: 'HASU.N0000',
      name: 'HNB Assurance PLC',
      reason: 'Conventional finance/insurance',
    },
    {
      symbol: 'LOFC.N0000',
      name: 'LOLC Finance',
      reason: 'Conventional finance',
    },
    {
      symbol: 'MVIL.N0000',
      name: 'Mercantile Investments and Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'VFIN.N0000',
      name: 'Vallibel Finance PLC',
      reason: 'Conventional finance',
    },
    {
      symbol: 'SFL.N0000',
      name: 'Softlogic Finance PLC',
      reason: 'Conventional finance',
    },
  ],

  // Diversified conglomerates with haram core operations
  diversifiedHaram: [
    {
      symbol: 'JKH.N0000',
      name: 'John Keells Holdings PLC',
      reason:
        'Casino operations (City of Dreams) + conventional insurance (Union Assurance)',
    },
  ],
};

// ─── Almas Equities Confirmed Whitelist ────────────────────────────────────
// Stocks confirmed Shariah-compliant by the Almas Equities Screening Whitelist.
// These pass Tier 1 AND are marked COMPLIANT without requiring Tier 2 financial data.
// Source: Almas Equities Investment Brief + CSE-listed Shariah-certified companies.

export const SHARIAH_WHITELIST = [
  // ── Previously confirmed ──────────────────────────────────────────────────
  {
    symbol: 'AEL.N0000',
    name: 'Access Engineering PLC',
    reason: 'Almas-verified — construction/infrastructure',
  },
  {
    symbol: 'TJL.N0000',
    name: 'Teejay Lanka PLC',
    reason: 'Almas-verified — textile manufacturing',
  },
  {
    symbol: 'TKYO.N0000',
    name: 'Tokyo Cement Company (Lanka) PLC',
    reason: 'Almas-verified — cement/materials',
  },
  {
    symbol: 'TKYO.X0000',
    name: 'Tokyo Cement Company (Lanka) PLC (NV)',
    reason: 'Almas-verified — cement/materials (non-voting)',
  },
  {
    symbol: 'LLUB.N0000',
    name: 'Chevron Lubricants Lanka PLC',
    reason: 'Almas-verified — lubricants manufacturing',
  },
  {
    symbol: 'TILE.N0000',
    name: 'Lanka Tiles PLC',
    reason: 'Almas-verified — tile manufacturing',
  },
  {
    symbol: 'RCL.N0000',
    name: 'Royal Ceramics Lanka PLC',
    reason: 'Almas-verified — ceramics manufacturing',
  },
  {
    symbol: 'KVAL.N0000',
    name: 'Kelani Valley Plantations PLC',
    reason: 'Almas-verified — plantations/agriculture',
  },
  {
    symbol: 'COCO.N0000',
    name: 'Renuka Foods PLC',
    reason: 'Almas-verified — food processing',
  },
  {
    symbol: 'GRAN.N0000',
    name: 'Ceylon Grain Elevators PLC',
    reason: 'Almas-verified — food processing/grain',
  },
  {
    symbol: 'DIPD.N0000',
    name: 'Dipped Products PLC',
    reason: 'Almas-verified — rubber manufacturing',
  },

  // ── Added 2026-03-27 — Almas Equities quarterly update ────────────────────
  // Cables & Industrial
  {
    symbol: 'ACL.N0000',
    name: 'ACL Cables PLC',
    reason: 'Almas-verified — cable manufacturing',
  },
  {
    symbol: 'APLA.N0000',
    name: 'ACL Plastics PLC',
    reason: 'Almas-verified — plastics manufacturing',
  },
  {
    symbol: 'CIND.N0000',
    name: 'Central Industries PLC',
    reason: 'Almas-verified — industrial manufacturing',
  },
  {
    symbol: 'KCAB.N0000',
    name: 'Kelani Cables PLC',
    reason: 'Almas-verified — cable manufacturing',
  },
  {
    symbol: 'LALU.N0000',
    name: 'Lanka Aluminium Industries PLC',
    reason: 'Almas-verified — aluminium manufacturing',
  },
  {
    symbol: 'TYRE.N0000',
    name: 'Kelani Tyres PLC',
    reason: 'Almas-verified — tyre manufacturing',
  },
  // Ceramics & Building Materials
  {
    symbol: 'DPL.N0000',
    name: 'Dankotuwa Porcelain PLC',
    reason: 'Almas-verified — porcelain/ceramics manufacturing',
  },
  {
    symbol: 'REGL.N0000',
    name: 'Regnis Lanka PLC',
    reason: 'Almas-verified — appliance manufacturing',
  },
  // Property & Real Estate
  {
    symbol: 'CTLD.N0000',
    name: 'CT Land Development PLC',
    reason: 'Almas-verified — property development',
  },
  {
    symbol: 'PLR.N0000',
    name: 'Prime Lands Residencies PLC',
    reason: 'Almas-verified — property development',
  },
  {
    symbol: 'RIL.N0000',
    name: 'RIL Property PLC',
    reason: 'Almas-verified — property development',
  },
  // Food & Consumer
  {
    symbol: 'SOY.N0000',
    name: 'Convenience Foods (Lanka) PLC',
    reason: 'Almas-verified — food manufacturing',
  },
  {
    symbol: 'SWAD.N0000',
    name: 'Swadeshi Industrial Works PLC',
    reason: 'Almas-verified — consumer goods manufacturing',
  },
  // Diversified Conglomerates
  {
    symbol: 'CIC.N0000',
    name: 'CIC Holdings PLC',
    reason: 'Almas-verified — agri/industrial conglomerate',
  },
  {
    symbol: 'CIC.X0000',
    name: 'CIC Holdings PLC (NV)',
    reason: 'Almas-verified — agri/industrial conglomerate (non-voting)',
  },
  {
    symbol: 'HHL.N0000',
    name: 'Hemas Holdings PLC',
    reason: 'Almas-verified — healthcare/consumer conglomerate',
  },
  {
    symbol: 'RICH.N0000',
    name: 'Richard Pieris and Company PLC',
    reason: 'Almas-verified — diversified manufacturing conglomerate',
  },
  {
    symbol: 'SUN.N0000',
    name: 'Sunshine Holdings PLC',
    reason: 'Almas-verified — agri/healthcare conglomerate',
  },
  {
    symbol: 'GREG.N0000',
    name: 'Ambeon Holdings PLC',
    reason: 'Almas-verified — technology/industrial holdings',
  },
  // Chemicals & Speciality
  {
    symbol: 'UCAR.N0000',
    name: 'Union Chemicals Lanka PLC',
    reason: 'Almas-verified — chemicals manufacturing',
  },
  {
    symbol: 'BOGA.N0000',
    name: 'Bogala Graphite Lanka PLC',
    reason: 'Almas-verified — graphite mining/export',
  },
  // Islamic Finance (inherently Shariah-compliant)
  {
    symbol: 'ABL.N0000',
    name: 'Amana Bank PLC',
    reason: 'Almas-verified — Islamic banking (inherently compliant)',
  },
  {
    symbol: 'ATL.N0000',
    name: 'Amana Takaful PLC',
    reason: 'Almas-verified — Takaful insurance (inherently compliant)',
  },
  {
    symbol: 'ATLL.N0000',
    name: 'Amana Takaful Life PLC',
    reason: 'Almas-verified — Takaful life insurance (inherently compliant)',
  },
  // Other
  {
    symbol: 'JAT.N0000',
    name: 'JAT Holdings PLC',
    reason: 'Almas-verified — specialty coatings/construction materials',
  },
];

/** Check if a symbol is on the Almas-confirmed whitelist. */
export function isWhitelisted(symbol: string): {
  whitelisted: boolean;
  reason?: string;
} {
  const entry = SHARIAH_WHITELIST.find((s) => s.symbol === symbol);
  if (entry) return { whitelisted: true, reason: entry.reason };
  return { whitelisted: false };
}

/** Get all whitelisted symbols. */
export function getWhitelistedSymbols(): string[] {
  return SHARIAH_WHITELIST.map((s) => s.symbol);
}

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
  const entries: Array<{
    symbol: string;
    name: string;
    reason: string;
    category: string;
  }> = [];
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
