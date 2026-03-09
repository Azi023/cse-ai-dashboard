'use client';

import { useState, useEffect, useCallback } from 'react';
import { marketApi, type MarketSummary, type TopStock, type SectorIndex } from '@/lib/api';

export function useMarketSummary(refreshInterval = 60000) {
  const [data, setData] = useState<MarketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await marketApi.getSummary();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch market summary');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useTopStocks(
  type: 'gainers' | 'losers' | 'active',
  refreshInterval = 60000
) {
  const [data, setData] = useState<TopStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const fetcher =
        type === 'gainers'
          ? marketApi.getGainers
          : type === 'losers'
            ? marketApi.getLosers
            : marketApi.getActive;
      const response = await fetcher();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch ${type}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useSectors(refreshInterval = 60000) {
  const [data, setData] = useState<SectorIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await marketApi.getSectors();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch sectors');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}
