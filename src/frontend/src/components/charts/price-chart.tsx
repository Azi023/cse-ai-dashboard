'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
} from 'lightweight-charts';
import type { StockPrice } from '@/lib/api';

interface PriceChartProps {
  data: StockPrice[];
  height?: number;
}

/** Calculate Simple Moving Average */
function calcSMA(data: { time: string; close: number }[], period: number) {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

/** Calculate RSI */
function calcRSI(data: { time: string; close: number }[], period = 14) {
  const result: { time: string; value: number }[] = [];
  if (data.length < period + 1) return result;

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  let avgGain = gains.slice(0, period).reduce((s, g) => s + g, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, l) => s + l, 0) / period;

  for (let i = period; i < gains.length; i++) {
    if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push({ time: data[i + 1].time, value: Math.round(rsi * 100) / 100 });
    }
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push({ time: data[i + 1].time, value: Math.round(rsi * 100) / 100 });
  }

  return result;
}

/** Calculate Bollinger Bands */
function calcBollinger(data: { time: string; close: number }[], period = 20, stdDevMultiplier = 2) {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  const middle: { time: string; value: number }[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, d) => s + d.close, 0) / period;
    const variance = slice.reduce((s, d) => s + Math.pow(d.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push({ time: data[i].time, value: mean });
    upper.push({ time: data[i].time, value: mean + stdDevMultiplier * stdDev });
    lower.push({ time: data[i].time, value: mean - stdDevMultiplier * stdDev });
  }

  return { upper, middle, lower };
}

export function PriceChart({ data, height = 400 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);

  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRSI, setShowRSI] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Sort data ascending by date
    const sorted = [...data]
      .map((d) => ({
        time: d.trade_date as string,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
        volume: Number(d.volume),
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

    // Main chart
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
      rightPriceScale: { borderColor: '#374151' },
      crosshair: {
        vertLine: { color: '#6b7280' },
        horzLine: { color: '#6b7280' },
      },
    });

    // Candlestick
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candlestickSeries.setData(sorted);

    // Volume (color-coded)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#6366f1',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      sorted.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? '#22c55e40' : '#ef444440',
      })),
    );

    const closePrices = sorted.map((d) => ({ time: d.time, close: d.close }));

    // SMA 20
    if (showSMA20 && sorted.length >= 20) {
      const sma20 = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma20.setData(calcSMA(closePrices, 20));
    }

    // SMA 50
    if (showSMA50 && sorted.length >= 50) {
      const sma50 = chart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma50.setData(calcSMA(closePrices, 50));
    }

    // Bollinger Bands
    if (showBollinger && sorted.length >= 20) {
      const bb = calcBollinger(closePrices);

      const bbUpper = chart.addSeries(LineSeries, {
        color: '#64748b',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bbUpper.setData(bb.upper);

      const bbLower = chart.addSeries(LineSeries, {
        color: '#64748b',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bbLower.setData(bb.lower);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    // RSI chart
    if (showRSI && rsiContainerRef.current && sorted.length >= 15) {
      const rsiChart = createChart(rsiContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        width: rsiContainerRef.current.clientWidth,
        height: 120,
        timeScale: { borderColor: '#374151', visible: false },
        rightPriceScale: { borderColor: '#374151' },
      });

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#06b6d4',
        lineWidth: 1,
        priceLineVisible: false,
      });

      const rsiData = calcRSI(closePrices);
      rsiSeries.setData(rsiData);

      // Overbought/oversold lines
      const ob = rsiChart.addSeries(LineSeries, {
        color: '#ef444460',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ob.setData(rsiData.map((d) => ({ time: d.time, value: 70 })));

      const os = rsiChart.addSeries(LineSeries, {
        color: '#22c55e60',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      os.setData(rsiData.map((d) => ({ time: d.time, value: 30 })));

      rsiChart.timeScale().fitContent();

      // Sync time scales
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
      });

      rsiChartRef.current = rsiChart;
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
      if (rsiChartRef.current && rsiContainerRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
    };
  }, [data, height, showSMA20, showSMA50, showBollinger, showRSI]);

  return (
    <div className="space-y-2">
      {/* Indicator toggles */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'SMA 20', color: '#f59e0b', active: showSMA20, toggle: () => setShowSMA20(!showSMA20) },
          { label: 'SMA 50', color: '#8b5cf6', active: showSMA50, toggle: () => setShowSMA50(!showSMA50) },
          { label: 'Bollinger', color: '#64748b', active: showBollinger, toggle: () => setShowBollinger(!showBollinger) },
          { label: 'RSI', color: '#06b6d4', active: showRSI, toggle: () => setShowRSI(!showRSI) },
        ].map(({ label, color, active, toggle }) => (
          <button
            key={label}
            onClick={toggle}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-current bg-current/10'
                : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50'
            }`}
            style={active ? { color, borderColor: `${color}60` } : undefined}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: active ? color : '#6b7280' }}
            />
            {label}
          </button>
        ))}
      </div>

      {/* Main chart */}
      <div ref={chartContainerRef} />

      {/* RSI sub-chart */}
      {showRSI && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">RSI (14)</div>
          <div ref={rsiContainerRef} />
        </div>
      )}
    </div>
  );
}
