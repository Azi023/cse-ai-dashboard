// Simple Mode language replacements and tooltips
// Used when Simple Mode is ON to replace technical jargon with plain language

export const SIMPLE_LANGUAGE: Record<string, string> = {
  // Market Terms
  'ASPI': 'Market Index (overall market health)',
  'S&P SL20': 'Top 20 Companies Index',
  'Market Cap': 'Company Size',
  'Volume': 'Number of shares traded today',
  'Turnover': 'Total money traded today',
  'P/E Ratio': 'Price vs Earnings (lower = cheaper)',
  'Beta': 'How much this stock moves vs the market',
  'RSI': 'Is it overbought or oversold?',
  'SMA': 'Average price over time',
  'Bollinger Bands': 'Price range (normal vs extreme)',
  'MACD': 'Momentum indicator (trending up or down?)',

  // Price Action
  'Bullish': '📈 Trending Up',
  'Bearish': '📉 Trending Down',
  'Neutral': '➡️ Moving Sideways',
  'Support level': 'Price floor (tends to stop falling here)',
  'Resistance level': 'Price ceiling (tends to stop rising here)',
  'Overbought': 'Price might be too high — could drop back',
  'Oversold': 'Price might be too low — could bounce back',
  'Breakout': 'Price broke through a ceiling — could keep going up',
  'Breakdown': 'Price fell through a floor — could keep going down',

  // Shariah
  'Shariah Compliant': '✅ Halal to invest',
  'Non-Compliant': '❌ Not halal (interest/alcohol/tobacco etc.)',
  'Pending Review': '⏳ Waiting for financial data to verify',
  'Purification': 'Small charity donation to cleanse minor non-halal income',
  'COMPLIANT': '✅ Halal to invest',
  'NON_COMPLIANT': '❌ Not halal',
  'PENDING_REVIEW': '⏳ Pending review',

  // Portfolio
  'Unrealized P&L': 'Profit/loss if you sold today',
  'Realized P&L': 'Actual profit/loss from completed sales',
  'Allocation': 'How much of your money is in this stock',
  'Diversification': 'Spreading money across different companies (safer)',
  'Dividend': 'Cash payment the company gives you for holding their shares',
  'Dividend Yield': 'How much cash you get per year as % of price',

  // Signals
  'HIGH': '🟢 Strong evidence — worth considering',
  'MEDIUM': '🟡 Mixed signals — research more',
  'LOW': '🔴 Weak evidence — be cautious',
};

export const TOOLTIPS: Record<string, string> = {
  portfolioValue:
    'This is what your shares are worth right now. If you sold everything today, you\'d get roughly this amount (minus ~1.12% in broker fees).',
  totalDeposited:
    'The total amount of money you\'ve put into your investment account across all months.',
  profitLoss:
    'The difference between what your portfolio is worth now and what you originally invested. Positive means you\'re making money!',
  profitLossPct:
    'Your profit/loss expressed as a percentage. For example, +8% means for every LKR 100 invested, you\'ve earned LKR 8.',
  dailyChange:
    'How much the market moved today. Markets go up and down daily — this is normal. What matters is the long-term trend over months.',
  shariahCompliant:
    'Percentage of your portfolio that follows Islamic finance principles. We check each company for prohibited activities and financial ratios.',
  purification:
    'A small amount you should donate to charity to purify minor non-halal income from your investments. This is standard practice in Islamic finance.',
  aspiReturn:
    'How much the overall stock market has grown over the same period you\'ve been investing. If your return is higher, you\'re beating the market!',
  diversification:
    'Having stocks in different sectors protects you. If one sector does badly, others might do well, balancing things out.',
  depositStreak:
    'How many months in a row you\'ve made deposits. Consistency is the #1 factor in building long-term wealth.',
  healthScore:
    'A simple score from 0-100 that shows how well-balanced and healthy your investment portfolio is. Higher is better.',
  buyingPower:
    'The amount of cash available in your broker account that you can use to buy stocks.',
  marketCap:
    'The total value of a company calculated by multiplying its stock price by the total number of shares. Bigger = more stable, usually.',
  peRatio:
    'Price-to-Earnings ratio. If a stock has a P/E of 10, you\'re paying LKR 10 for every LKR 1 of the company\'s annual profit. Lower can mean cheaper.',
  beta:
    'Measures how volatile a stock is compared to the market. Beta of 1 = moves with market. Beta of 2 = moves twice as much. Beta of 0.5 = half as much.',
};

export function getSimpleLabel(term: string): string {
  return SIMPLE_LANGUAGE[term] ?? term;
}

export function getTooltip(key: string): string | undefined {
  return TOOLTIPS[key];
}

export function formatLKR(amount: number): string {
  return `LKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-muted-foreground';
  }
}
