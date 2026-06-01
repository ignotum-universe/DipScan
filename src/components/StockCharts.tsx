// src/components/StockCharts.tsx
import React, { useState, useMemo, useEffect } from 'react';
import ReactApexChart from 'react-apexcharts';

interface ChartDataPoint {
  trading_date: string;
  close_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  sma200: number | null;
  rollingVwap: number | null;
  anchoredVwap?: number | null; // Added to match your JSX key
}

interface StockChartsProps {
  ticker: string;
  data: {
    chartData: ChartDataPoint[];
    volumeProfile: any[];
  };
}

// Define the available timeframes based on trading days (approximate)
type Timeframe = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export default function StockCharts({ ticker, data }: StockChartsProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('ALL');

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const rawChartData = data?.chartData || [];
  const chronologicalData = useMemo(() => [...rawChartData].reverse(), [rawChartData]);

  const filteredData = useMemo(() => {
    if (timeframe === 'ALL' || chronologicalData.length === 0) return chronologicalData;
    if (timeframe === 'YTD') {
      const currentYear = new Date().getFullYear().toString();
      return chronologicalData.filter(point => point.trading_date.startsWith(currentYear));
    }
    const timeframeDaysMap: Record<Exclude<Timeframe, 'ALL' | 'YTD'>, number> = {
      '1M': 21, '3M': 63, '6M': 126, '1Y': 252,
    };
    return chronologicalData.slice(-timeframeDaysMap[timeframe]);
  }, [chronologicalData, timeframe]);

  // Format data for ApexCharts
  const series = useMemo(() => [
    {
      name: 'Price',
      type: 'candlestick',
      data: filteredData.map(d => ({
        x: d.trading_date,
        y: [d.open_price, d.high_price, d.low_price, d.close_price]
      }))
    },
    {
      name: 'SMA 200',
      type: 'line',
      data: filteredData.map(d => ({
        x: d.trading_date,
        y: d.sma200 ?? null
      }))
    },
    {
      name: 'Rolling VWAP',
      type: 'line',
      data: filteredData.map(d => ({
        x: d.trading_date,
        y: d.rollingVwap ?? null
      }))
    }
  ], [filteredData]);

  const options: ApexCharts.ApexOptions = useMemo(() => ({

    chart: {
      type: 'candlestick',
      width: '100%',
      height: '100%',
      background: '#0f172a',
      toolbar: { show: false },
      zoom: {
        enabled: true,
        type: 'x',
        autoScaleYaxis: true,
      },
      selection: {
        enabled: false,   // ← disables drag-select zoom
      },
      events: {
        beforeZoom: (_ctx: any, _opts: any): boolean => {
          return false; // ← returning false cancels the zoom entirely on mobile
        }
      },
      theme: {
    mode: 'dark', 
  },
    },

    responsive: [
      {
        breakpoint: 768,
        options: {
          chart: {
            zoom: { enabled: false },
            toolbar: {
              show: false,
              autoSelected: 'pan',  // ← drag = pan on mobile
            },
          },
          xaxis: {
            tickAmount: 5,              // ← fewer labels so they don't crowd
          },
          yaxis: {
            labels: {
              offsetX: -15,   // ← tighter on mobile
              style: {
                fontSize: '10px',  // ← smaller font = less reserved width
              },
            },
          },
          stroke: {
            width: [1, 1.5, 1.5],      // ← thinner lines on small screens
          },
          markers: {
            size: 0, // Set to 0 if you don't want dots, or >0 if you want them visible
            hover: {
              size: 5 // The size of the dot when you hover over the chart
            }
          }
        }
      }
    ],
    stroke: {
      // Index order matches series order: candlestick, SMA200, VWAP
      width: [1, 2, 2],
      curve: 'smooth',
      dashArray: [0, 0, 4]  // VWAP gets a dashed line to distinguish it
    },
    xaxis: {
      type: 'category',
      labels: {
        rotate: -45,
        formatter: (val: string) => {
          const date = new Date(val);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      },
      tickAmount: 10,
    },
    yaxis: {
      tooltip: { enabled: true },
      decimalsInFloat: 2,
      labels: {
        offsetX: -10,
      },
    },
    tooltip: {
      shared: true, // This enables the single vertical line/crosshair across all series
      intersect: false, // Set to false to show tooltip even when not directly on the line
      custom: ({ series, seriesIndex, dataPointIndex, w }) => {
        // series[0] = Candlestick (which has 4 values: [O, H, L, C])
        // series[1] = SMA 200
        // series[2] = Rolling VWAP

        const candle = series[0][dataPointIndex];
        const sma = series[1][dataPointIndex];
        const vwap = series[2][dataPointIndex];

        // Check if we have valid data for this point
        if (!candle) return '';

        return `
      <div class="p-3 bg-slate-100 text-black text-xs">
        <div>Price: <span class="text-emerald-400 font-bold">$${candle.toFixed(2)}</span></div>
        ${vwap !== null ? `<div>VWAP: <span class="text-indigo-400 font-bold">$${vwap.toFixed(2)}</span></div>` : ''}
        ${sma !== null ? `<div>SMA 200: <span class="text-yellow-400 font-bold">$${sma.toFixed(2)}</span></div>` : ''}
      </div>
    `;
      }
    },
    plotOptions: {
      candlestick: {
        colors: { upward: '#34d399', downward: '#f87171' }
      }
    },
    colors: ['transparent', '#facc15', '#818cf8'], // candle color handled by plotOptions; SMA=yellow, VWAP=purple
    legend: {
      show: true,
      position: 'top',        // ← moves it above the chart, never overlaps
      horizontalAlign: 'left',
      labels: { colors: '#94a3b8' },
      offsetY: 0,
    }
 }), []);

  const latestPrice = useMemo(() => {
    if (filteredData.length === 0) return null;
    return filteredData[filteredData.length - 1].close_price;
  }, [filteredData]);

  return (
  <div className="w-full h-auto bg-[#0f172a] p-5 pb-0 rounded-xl md:p-5 min-h-[350px]">
    {/* Timeframe Buttons */}
    <div className="flex gap-2 mb-5 flex-wrap">
      {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            timeframe === tf ? 'bg-sky-400 text-slate-900' : 'bg-slate-800 text-slate-400'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>

    {/* Header */}
    <h3 className="text-slate-100 text-lg mb-2 flex items-center gap-3">
      <span className="font-bold">{ticker}:</span>
      {latestPrice !== null && (
        <span className="text-emerald-400">${latestPrice.toFixed(2)}</span>
      )}
    </h3>

    {/* Chart Container */}
    <div className="w-full aspect-4/3 md:aspect-auto md:h-[400px] relative bg-[#0f172a] rounded-lg overflow-hidden">
      {/* Chart Wrapper: Will swap seamlessly with the dynamic fallback engine */}
      <div className="w-full h-full bg-[#0f172a]">
        {hasMounted && (
          <ReactApexChart 
            options={options} 
            series={series} 
            type="candlestick" 
            height="100%" 
            width="100%"
          />
        )}
      </div>
    </div>
  </div>
);
}