import React, { useEffect, useState } from 'react';
import StockCharts from './StockCharts'; // Your original component

export default function ClientOnlyChart(props: any) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // This only runs in the browser
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Render a skeleton or nothing during SSR
    return <div className="h-64 animate-pulse bg-[#0f172a]">Loading chart...</div>;
  }

  // Only render the actual chart once in the browser
  return <StockCharts {...props} />;
}