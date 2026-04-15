/**
 * ATrad DOM Selectors — Mapped by order-recon on 2026-04-09
 *
 * These selectors were discovered by automated Playwright recon of the ATrad
 * trading platform at trade.hnbstockbrokers.lk (ATrad Premier v4.5.04005).
 *
 * DO NOT EDIT MANUALLY unless recon confirms changes.
 */

// ── Login Form ─────────────────────────────────────────────────────────────

export const LOGIN_SELECTORS = {
  url: 'https://trade.hnbstockbrokers.lk/atsweb/login',
  username: '#txtUserName',
  password: '#txtPassword',
  submit: '#btnSubmit',
} as const;

// ── Navigation (Dojo MenuBar) ──────────────────────────────────────────────

export const NAV_SELECTORS = {
  /** Watch(0), Market(1), Orders(2), OrderMgmt(3), Client(4), Chart(5), Analysis(6), Report(7), Announcements(8) */
  ordersMenu: '#dijit_PopupMenuBarItem_2',
  orderManagementMenu: '#dijit_PopupMenuBarItem_3',
  clientMenu: '#dijit_PopupMenuBarItem_4',
  /** Orders dropdown sub-items */
  buyMenuItem: '#dijit_MenuItem_20',
  sellMenuItem: '#dijit_MenuItem_21',
  orderBlotter: '#dijit_MenuItem_23',
  /** Client dropdown sub-items */
  stockHolding: '#dijit_MenuItem_40',
  accountSummary: '#dijit_MenuItem_41',
} as const;

// ── Account Summary ────────────────────────────────────────────────────────

export const ACCOUNT_SELECTORS = {
  cashBalance: '#txtAccSumaryCashBalance',
  buyingPower: '#txtAccSumaryBuyingPowr',
  portfolioValue: '#txtAccSumaryTMvaluePortfolio',
} as const;

// ── Holdings ───────────────────────────────────────────────────────────────

export const HOLDINGS_SELECTORS = {
  container: '#_atrad_equityDiv',
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

// ── Order Entry (Buy Form) — Mapped 2026-04-09 ────────────────────────────
// Navigation: Orders menu → Buy (#dijit_MenuItem_20)
// All IDs prefixed with debtorder_0_ (Dojo widget convention)

export const ORDER_SELECTORS = {
  /** Form container */
  form: '#debtorder_0_orderForm',

  /** Client account (pre-filled) */
  clientAccount: '#debtorder_0_cmbClientAcc',

  /** Dojo dropdown tables — click to change, default values shown */
  assetSelect: '#debtorder_0_cmbAssetSelect',       // default: EQUITY
  actionSelect: '#debtorder_0_cmbActionSelect',      // default: BUY (set by menu choice)
  boardSelect: '#debtorder_0_cmbBoard',              // default: REGULAR
  orderTypeSelect: '#debtorder_0_cmbOrderType',      // default: LIMIT
  tifSelect: '#debtorder_0_cmbTif',                  // default: DAY
  tifDaysSelect: '#debtorder_0_cmbTifDays',          // default: 1

  /** Input fields — Dojo spinner/combobox widgets */
  security: '#debtorder_0_txtSecurity',              // stock symbol (ComboBox)
  quantity: '#debtorder_0_spnQuantity',              // shares (NumberSpinner, default 0)
  price: '#debtorder_0_spnPrice',                    // limit price (NumberSpinner, default 0)
  minFillQuantity: '#debtorder_0_spnMinFillQuantity', // optional (NumberSpinner, default 0)
  discloseQty: '#debtorder_0_spnDisclose',           // optional (NumberSpinner, default 0)
  stopPrice: '#debtorder_0_spnStopPrice',            // optional (NumberSpinner, default 0)

  /** Read-only info fields (populated after security is entered) */
  bestBidVal: '#debtorder_0_bestBidVal',
  bestAskVal: '#debtorder_0_bestAskVal',
  lastTradeVal: '#debtorder_0_lastTradeVal',
  highVal: '#debtorder_0_highVal',
  lowVal: '#debtorder_0_lowVal',
  buyingPowerVal: '#debtorder_0_buyPowerVal',
  orderVal: '#debtorder_0_orderVal',                 // calculated order value
  commissionVal: '#debtorder_0_ordercommission',     // calculated commission
  netValueVal: '#debtorder_0_ordernetvalue',          // calculated net value
  statusVal: '#debtorder_0_orderstatus',

  /** Confirm checkbox — MUST be checked before submit */
  confirmCheckbox: '#debtorder_0_chkConfirm',

  /** Submit button — ⚠️ PLACES A REAL ORDER */
  submitButton: '#debtorder_0_btnSubmit',

  /** Close button (cancel without submitting) */
  closeButton: '#debtorder_0_btnClose',
} as const;

// ── Dangerous Selectors (NEVER CLICK without explicit user approval) ──────

export const FORBIDDEN_SELECTORS = [
  '#debtorder_0_btnSubmit',  // The actual Buy button
  'input[name="submit"]',    // Hidden submit input behind the Buy span
] as const;
