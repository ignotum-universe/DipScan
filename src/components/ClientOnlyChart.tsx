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
    return <div className="h-[400px] lg:h-[530px] w-full bg-[#0f172a] rounded-xl" />;
  }

  // Only render the actual chart once in the browser
  return <StockCharts {...props} />;
}