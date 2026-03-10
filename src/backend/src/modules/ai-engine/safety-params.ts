/**
 * Safety parameters for small-capital portfolios.
 * Designed for starting capital of LKR 10,000.
 */
export const SAFETY_PARAMS = {
  // Capital thresholds
  startingCapital: 10_000,
  minPositionSize: 5_000, // Below this, brokerage costs erode returns
  maxPositionPercent: 0.30, // Max 30% of capital per stock
  maxConcurrentPositions: 3,

  // CSE cost structure
  brokerage: {
    minimumFee: 1_000, // LKR
    commissionRate: 0.0115, // 1.15%
    cseFee: 0.0004, // 0.04%
    secLevy: 0.00015, // 0.015%
    totalCostPercent: 0.013, // ~1.3% approximate all-in round-trip cost
  },

  // Signal generation filters
  signalFilters: {
    minDailyVolume: 10_000, // Shares — don't signal illiquid stocks
    minDailyTurnover: 1_000_000, // LKR — ensures enough market depth
    minPrice: 5, // LKR — avoid penny stocks (tick size impact)
    maxPriceForSmallCapital: 2_000, // LKR — ensures you can buy meaningful qty
    maxSectorConcentration: 2, // Max BUY signals per sector
    maxActiveSignals: 5,
  },

  // Risk management
  risk: {
    maxPortfolioLossPercent: 15, // Stop everything if portfolio down 15%
    maxSingleStockLossPercent: 10, // Stop-loss per position
    minRiskRewardRatio: 2.0, // Only take signals with 2:1+ R/R
    trailingStopPercent: 8, // Move stop up as price rises
  },

  // Position sizing by confidence
  positionSizing: {
    HIGH: { minPercent: 0.05, maxPercent: 0.08 }, // 5-8% of capital
    MEDIUM: { minPercent: 0.03, maxPercent: 0.05 }, // 3-5%
    LOW: { minPercent: 0.01, maxPercent: 0.03 }, // 1-3%
  },

  // Breakeven calculator
  calculateBreakeven(investmentAmount: number): {
    totalCost: number;
    breakEvenPrice: number;
    minReturnPercent: number;
  } {
    const brokerageBuy = Math.max(
      this.brokerage.minimumFee,
      investmentAmount * this.brokerage.commissionRate,
    );
    const brokerageSell = Math.max(
      this.brokerage.minimumFee,
      investmentAmount * this.brokerage.commissionRate,
    );
    const cseAndSec =
      investmentAmount * (this.brokerage.cseFee + this.brokerage.secLevy) * 2;
    const totalCost = brokerageBuy + brokerageSell + cseAndSec;
    const minReturnPercent = (totalCost / investmentAmount) * 100;

    return {
      totalCost,
      breakEvenPrice: investmentAmount + totalCost,
      minReturnPercent,
    };
  },

  // Check if a position is feasible
  isPositionFeasible(
    capitalAvailable: number,
    stockPrice: number,
    confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  ): {
    feasible: boolean;
    reason?: string;
    suggestedQty?: number;
    suggestedAmount?: number;
  } {
    const sizing = this.positionSizing[confidence];
    const maxAmount = capitalAvailable * sizing.maxPercent;
    const minAmount = this.minPositionSize;

    if (maxAmount < minAmount) {
      return {
        feasible: false,
        reason: `Position too small. Min viable position is LKR ${minAmount.toLocaleString()}, but ${confidence} confidence allows max LKR ${maxAmount.toLocaleString()}`,
      };
    }

    if (stockPrice > maxAmount) {
      return {
        feasible: false,
        reason: `Stock price LKR ${stockPrice} exceeds max position size of LKR ${maxAmount.toLocaleString()}`,
      };
    }

    const suggestedAmount = Math.min(maxAmount, capitalAvailable * this.maxPositionPercent);
    const suggestedQty = Math.floor(suggestedAmount / stockPrice);

    if (suggestedQty < 1) {
      return {
        feasible: false,
        reason: `Cannot buy even 1 share at LKR ${stockPrice} within position limits`,
      };
    }

    return {
      feasible: true,
      suggestedQty,
      suggestedAmount: suggestedQty * stockPrice,
    };
  },
};
