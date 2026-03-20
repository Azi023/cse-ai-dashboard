export const CSE_FEE_RATE = 0.0112; // 1.12% all-in (brokerage + CSE + CDS + SEC + STL)
export const WHT_RATE = 0.14; // 14% Withholding Tax on dividends

export function calculateFee(totalValue: number): number {
  return Math.round(totalValue * CSE_FEE_RATE * 100) / 100;
}

export function calculateNetBuy(
  quantity: number,
  price: number,
): { totalValue: number; fee: number; netValue: number } {
  const totalValue = quantity * price;
  const fee = calculateFee(totalValue);
  return { totalValue, fee, netValue: totalValue + fee };
}

export function calculateNetSell(
  quantity: number,
  price: number,
): { totalValue: number; fee: number; netValue: number } {
  const totalValue = quantity * price;
  const fee = calculateFee(totalValue);
  return { totalValue, fee, netValue: totalValue - fee };
}
