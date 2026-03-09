'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, CandlestickSeries, HistogramSeries, ColorType } from 'lightweight-charts';
import type { StockPrice } from '@/lib/api';

interface PriceChartProps {
  data: StockPrice[];
  height?: number;
}

export function PriceChart({ data, height = 400 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      timeScale: {
        borderColor: '#374151',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      crosshair: {
        vertLine: { color: '#6b7280' },
        horzLine: { color: '#6b7280' },
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const chartData = data
      .map((d) => ({
        time: d.trade_date as string,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

    candlestickSeries.setData(chartData);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#6366f1',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData = data
      .map((d) => ({
        time: d.trade_date as string,
        value: Number(d.volume),
        color: Number(d.close) >= Number(d.open) ? '#22c55e40' : '#ef444440',
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, height]);

  return <div ref={chartContainerRef} />;
}
