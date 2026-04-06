import { Injectable } from '@nestjs/common';
import {
  STRATEGY_REGISTRY,
  STRATEGY_PRIORITY,
  StrategyConfig,
  MarketRegimeType,
  PortfolioTier,
} from './strategy-registry';

// ---------------------------------------------------------------------------

export interface StrategySelectionInput {
  regime: MarketRegimeType;
  tier: PortfolioTier;
  availableDataDays: number;
}

// ---------------------------------------------------------------------------

@Injectable()
export class StrategySelectorService {
  /**
   * Returns the strategies applicable to the given regime, tier, and data
   * availability. Results are ordered by STRATEGY_PRIORITY.
   */
  selectStrategies(input: StrategySelectionInput): StrategyConfig[] {
    const { regime, tier, availableDataDays } = input;

    return STRATEGY_REGISTRY.filter((strategy) => {
      // 1. Regime filter
      if (strategy.applicableRegimes !== 'ALL') {
        if (!strategy.applicableRegimes.includes(regime)) return false;
      }

      // 2. Tier filter
      if (!strategy.applicableTiers.includes(tier)) return false;

      // 3. Data availability filter
      if (availableDataDays < strategy.minDataDays) return false;

      return true;
    }).sort(
      (a, b) =>
        (STRATEGY_PRIORITY[a.id] ?? 99) - (STRATEGY_PRIORITY[b.id] ?? 99),
    );
  }

  /**
   * Returns all strategies that would be inactive given the current inputs,
   * with the reason they were excluded. Used for the status endpoint.
   */
  getInactiveStrategies(
    input: StrategySelectionInput,
  ): Array<{ id: string; name: string; reason: string }> {
    const { regime, tier, availableDataDays } = input;

    return STRATEGY_REGISTRY.filter((strategy) => {
      if (strategy.applicableRegimes !== 'ALL') {
        if (!strategy.applicableRegimes.includes(regime)) return true;
      }
      if (!strategy.applicableTiers.includes(tier)) return true;
      if (availableDataDays < strategy.minDataDays) return true;
      return false;
    }).map((strategy) => {
      let reason = '';

      if (
        strategy.applicableRegimes !== 'ALL' &&
        !strategy.applicableRegimes.includes(regime)
      ) {
        reason = `Needs ${strategy.applicableRegimes.join(' or ')} regime (current: ${regime})`;
      } else if (!strategy.applicableTiers.includes(tier)) {
        reason = `Needs ${strategy.applicableTiers.join('/')} tier (current: ${tier})`;
      } else if (availableDataDays < strategy.minDataDays) {
        reason = `Needs ${strategy.minDataDays} days of data (have: ${availableDataDays})`;
      }

      return { id: strategy.id, name: strategy.name, reason };
    });
  }
}
