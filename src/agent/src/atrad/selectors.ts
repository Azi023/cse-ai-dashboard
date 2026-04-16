/**
 * ATrad DOM Selectors — Mapped by Chrome extension recon on 2026-04-16
 *
 * Platform: ATrad Premier v4.5.04005 (HNB Stockbrokers)
 * Engine: Dojo Toolkit (dijit widgets)
 *
 * CRITICAL: Order form selectors use a DYNAMIC prefix that increments each
 * time Buy or Sell is opened (debtorder_0_, debtorder_1_, etc.). Use the
 * orderSelectors(prefix) function instead of hardcoded IDs. Detect the
 * current prefix with detectFormPrefix() from dojo-helpers.ts.
 *
 * Static selectors (login, nav, account, holdings) are safe to use directly.
 */

// ── Login Form (static) ────────────────────────────────────────────────────

export const LOGIN_SELECTORS = {
  url: 'https://trade.hnbstockbrokers.lk/atsweb/login',
  username: '#txtUserName',
  password: '#txtPassword',
  submit: '#btnSubmit',
} as const;

// ── Navigation — Dojo MenuBar (static) ──────────────────────────────────────

export const NAV_SELECTORS = {
  /** MenuBar items: Watch(0), Market(1), Orders(2), OrderMgmt(3), Client(4), Chart(5), Analysis(6), Report(7), Announcements(8) */
  watchMenu: '#dijit_PopupMenuBarItem_0',
  marketMenu: '#dijit_PopupMenuBarItem_1',
  ordersMenu: '#dijit_PopupMenuBarItem_2',
  orderManagementMenu: '#dijit_PopupMenuBarItem_3',
  clientMenu: '#dijit_PopupMenuBarItem_4',
  chartMenu: '#dijit_PopupMenuBarItem_5',
  analysisMenu: '#dijit_PopupMenuBarItem_6',
  reportMenu: '#dijit_PopupMenuBarItem_7',
  announcementsMenu: '#dijit_PopupMenuBarItem_8',

  /** Orders dropdown sub-items */
  buyMenuItem: '#dijit_MenuItem_20',
  sellMenuItem: '#dijit_MenuItem_21',
  orderBlotter: '#dijit_MenuItem_23',
  orderBaskets: '#dijit_MenuItem_24',
  tradeExecutionSummary: '#dijit_MenuItem_28',
  orderTracker: '#dijit_MenuItem_29',
  myTrades: '#dijit_MenuItem_30',

  /** Client dropdown sub-items */
  stockHolding: '#dijit_MenuItem_40',
  accountSummary: '#dijit_MenuItem_41',
  portfolio: '#dijit_MenuItem_39',

  /** Market dropdown sub-items */
  marketDepth: '#dijit_MenuItem_15',
  setAlert: '#dijit_MenuItem_16',
  viewAlert: '#dijit_MenuItem_18',

  /** Report dropdown sub-items */
  symbolTradeSummary: '#dijit_MenuItem_53',
  marketIndexSummary: '#dijit_MenuItem_54',

  /** Analysis dropdown sub-items */
  whatifCalculator: '#dijit_MenuItem_49',
  avgCostCalculator: '#dijit_MenuItem_50',

  /** Logout */
  logout: '#butUserLogOut',
} as const;

// ── Account Summary (static) ────────────────────────────────────────────────

export const ACCOUNT_SELECTORS = {
  cashBalance: '#txtAccSumaryCashBalance',
  buyingPower: '#txtAccSumaryBuyingPowr',
  portfolioValue: '#txtAccSumaryTMvaluePortfolio',
  totalCost: '#txtAccSumaryTcostPortfolio',
  totalGainLoss: '#txtAccSumaryTGainLoss',
  pendingBuyOrderVal: '#txtAccSumaryTPendingBuyOrderVal',
  exposurePercentage: '#txtAccSumaryExposurePerecentage',
  perOrderLimit: '#txtAccSumaryPerOrderLimit',
  perDayLimit: '#txtAccSumaryPerDayLimit',
} as const;

// ── Holdings (static) ───────────────────────────────────────────────────────

export const HOLDINGS_SELECTORS = {
  container: '#_atrad_equityDiv',
  portfolioGrid: '#portfolioGridId',
  apiEndpoint: '/atsweb/client',
  apiParams: {
    action: 'getStockHolding',
    exchange: 'CSE',
    broker: 'FWS',
    stockHoldingClientAccount: '128229LI0',
    stockHoldingSecurity: '',
    format: 'json',
  },
} as const;

// ── Order Form (DYNAMIC prefix) ────────────────────────────────────────────
// Use detectFormPrefix() from dojo-helpers.ts to get the current prefix,
// then call orderSelectors(prefix) to get the full selector map.

/**
 * Generate order form selectors for the given dynamic prefix.
 *
 * @param prefix The current form prefix, e.g. 'debtorder_2_'
 *               Obtain via detectFormPrefix() after opening Buy/Sell.
 */
export function orderSelectors(prefix: string) {
  return {
    // ── Form container ─────────────────────────────────────────────────────
    form: `#${prefix}orderForm`,
    popupBody: `#${prefix}popupBody`,

    // ── Dropdowns (Dojo FilteringSelect — use setDojoSelect) ───────────────
    clientAccount: `#${prefix}cmbClientAcc`,
    assetSelect: `#${prefix}cmbAssetSelect`,
    actionSelect: `#${prefix}cmbActionSelect`,
    boardSelect: `#${prefix}cmbBoard`,
    orderTypeSelect: `#${prefix}cmbOrderType`,
    tifSelect: `#${prefix}cmbTif`,
    tifDaysSelect: `#${prefix}cmbTifDays`,

    // ── Input fields (Dojo NumberSpinner/ComboBox — use fillDojoInput) ─────
    security: `#${prefix}txtSecurity`,
    quantity: `#${prefix}spnQuantity`,
    price: `#${prefix}spnPrice`,
    stopPrice: `#${prefix}spnStopPrice`,
    minFillQuantity: `#${prefix}spnMinFillQuantity`,
    discloseQty: `#${prefix}spnDisclose`,

    // ── Read-only market data (populated after security is entered) ────────
    bestBidVal: `#${prefix}bestBidVal`,
    bestAskVal: `#${prefix}bestAskVal`,
    lastTradeVal: `#${prefix}lastTradeVal`,
    highVal: `#${prefix}highVal`,
    lowVal: `#${prefix}lowVal`,
    avgPriceVal: `#${prefix}avgPriceVal`,
    totalVolumeVal: `#${prefix}totVolumeVal`,
    totalTurnoverVal: `#${prefix}totTurnoverVal`,
    netChangeVal: `#${prefix}netChangeVal`,
    noOfTradesVal: `#${prefix}noOfTradesVal`,

    // ── Calculated values (updated after form fields change) ───────────────
    buyingPowerVal: `#${prefix}buyPowerVal`,
    orderVal: `#${prefix}orderVal`,
    commissionVal: `#${prefix}ordercommission`,
    netValueVal: `#${prefix}ordernetvalue`,
    statusVal: `#${prefix}orderstatus`,

    // ── Sell-side info (shows available qty, pending sell qty) ──────────────
    clientNameVal: `#${prefix}clientNameVal`,
    originalQtyVal: `#${prefix}OriginalQtyVal`,
    pendingQtyVal: `#${prefix}PendingQtyVal`,

    // ── Confirm and submit ─────────────────────────────────────────────────
    confirmCheckbox: `#${prefix}chkConfirm`,
    submitButton: `#${prefix}btnSubmit`,
    closeButton: `#${prefix}btnClose`,

    // ── Extra buttons ──────────────────────────────────────────────────────
    showOrderBasket: `#${prefix}showOrderBasket`,
    showMarketDepth: `#${prefix}showMrktDepth`,
  } as const;
}

/**
 * Get the Dojo widget ID (without #) for a given form field.
 * Needed for setDojoSelect/readDojoValue which take widget IDs, not CSS selectors.
 */
export function widgetId(prefix: string, field: string): string {
  return `${prefix}${field}`;
}

// ── ATrad Dropdown Value Maps ───────────────────────────────────────────────
// These map our internal names to ATrad's Dojo option values.

export const ATRAD_ACTION_VALUES = {
  BUY: '1',
  SELL: '2',
  SELL_SHORT: '5',
} as const;

export const ATRAD_ORDER_TYPE_VALUES = {
  LIMIT: '2',
  STOP_LIMIT: '4',
} as const;

export const ATRAD_TIF_VALUES = {
  DAY: '0',
  GTC: '1',
  OPG: '2',
  IOC: '3',
  FOK: '4',
  GTD: '6',
} as const;

export const ATRAD_BOARD_VALUES = {
  REGULAR: '1',
  CROSSING: '4',
  AON: '5',
  AUCTION: '7',
} as const;

// ── Blotter Selectors (static) ──────────────────────────────────────────────

export const BLOTTER_SELECTORS = {
  menuItem: '#dijit_MenuItem_23',
  container: '#blotterContainer',
  grid: '#blotterGrid',

  /** Filter controls */
  orderTypeFilter: '#bOrdTypeSelect',
  statusFilter: '#bOrdStatusSelect',
  securityFilter: '#bOrdSecSelect',
  sourceFilter: '#bOrdOrdrSucSelect',
  clientAccountFilter: '#bClientAccSelect',
  assetFilter: '#assetSelect',

  /** Action buttons */
  exportButton: '#saveBlotterData',
  closeButton: '#bCloseBut',
} as const;

/** ATrad blotter order statuses (from filter dropdown) */
export const ATRAD_BLOTTER_STATUSES = [
  'NEW',
  'P.FILLED',
  'FILLED',
  'CANCELED',
  'AMENDED',
  'QUEUED',
  'Q.AMEND',
  'Q.CANCEL',
  'EXPIRED',
  'REJECTED',
  'PENDING',
  'PENDING REPLACE',
  'PENDING NEW',
] as const;

export type ATradBlotterStatus = (typeof ATRAD_BLOTTER_STATUSES)[number];

// ── Order Tracker Selectors (static) ────────────────────────────────────────

export const ORDER_TRACKER_SELECTORS = {
  menuItem: '#dijit_MenuItem_29',
  cdsAccountNo: '#ordTrackrTxtCDSAccNo',
  securityId: '#ordTrackrTxtSecurityId',
  clientOrderId: '#ordTrackrTxtClientOrderId',
  side: '#ordTrackrDdlSide',
  fromDate: '#ordTrackrTxtFromDate',
  toDate: '#ordTrackrTxtToDate',
  exchangeOrderId: '#ordTrackrTxtExchangeOrdID',
  status: '#ordTrackrDdlStatus',
} as const;

// ── Watchlist Context Menu (static) ─────────────────────────────────────────

export const WATCHLIST_CONTEXT_MENU = {
  header: '#rightClickmenuHeader1',
  orderBook: '#rightClickmenuOrderbook1',
  buy: '#rightClickmenuBuy1',
  sell: '#rightClickmenuSell1',
  statistics: '#rightClickmenuStatistics1',
  trades: '#rightClickmenuTrades1',
  tradesSummary: '#rightClickmenuTradesSummary1',
  detailQuote: '#rightClickmenuDetailQuote1',
  addSecurity: '#rightClickmenuSecurity1',
  announcements: '#rightClickmenuAnnouncmnt1',
  advancedChart: '#rightClickmenuAdvChart1',
  exportExcel: '#rightClickmenuExportExcel1',
  setAlert: '#rightClickmenuSetAlert1',
} as const;

// ── ATrad API Endpoints ─────────────────────────────────────────────────────
// All relative to https://trade.hnbstockbrokers.lk/atsweb/

export const ATRAD_API = {
  /** Order operations */
  submitOrder: '/atsweb/order',        // POST with action=submitOrder (form data)
  getBlotterData: '/atsweb/order',     // GET with action=getBlotterData
  getMarketStatus: '/atsweb/order',    // GET with action=getMarketStatus
  getSecurityProperties: '/atsweb/order', // GET with action=getSecurityProperties
  getAvailableShares: '/atsweb/order', // GET with action=getAvlSahres (ATrad typo)
  calcCommission: '/atsweb/order',     // GET with action=calcCommission

  /** Client operations */
  clientData: '/atsweb/client',        // POST with various actions
  getStockHolding: '/atsweb/client',   // POST with action=getStockHolding
  getAccountSummary: '/atsweb/client', // GET with action=getClientAccountSummary

  /** Market data */
  watchData: '/atsweb/watch',          // GET with action=userWatch
  tickerData: '/atsweb/market',        // GET with action=getTickerData
  sectorData: '/atsweb/sector',        // GET with action=getSectorDataAll
  marketStatus: '/atsweb/home',        // GET with action=marketStatus

  /** Session */
  checkSession: '/atsweb/login',       // GET with action=checkUserSession
} as const;

// ── ATrad API Parameters ────────────────────────────────────────────────────

export const ATRAD_ACCOUNT = {
  exchange: 'CSE',
  broker: 'FWS',
  clientAccount: '128229LI0',
  clientAccountId: '742847',
} as const;

// ── Forbidden Selectors — NEVER click without explicit approval ─────────────
// These are resolved at runtime using the current prefix.

export function forbiddenSelectors(prefix: string): readonly string[] {
  return [
    `#${prefix}btnSubmit`,  // The actual Buy/Sell button
  ];
}
