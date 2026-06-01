import { useState } from 'react';
import secDataRaw from '../data/company_tickers.json';
import etfDataRaw from '../data/etf_tickers.json';

// 1. Define the interfaces at the top level
interface SECTickerItem {
  cik_str: number;
  ticker: string;
  title: string;
}

interface NormalizedTicker {
  symbol: string;
  fullName: string;
}

// 2. Use the interface in your helper function
const prepareDatabase = (): NormalizedTicker[] => {
  const secData = secDataRaw as Record<string, SECTickerItem>;
  const etfData = etfDataRaw as NormalizedTicker[];

  const secNormalized: NormalizedTicker[] = Object.values(secData).map((item) => ({
    symbol: String(item.ticker || '').toUpperCase().trim(),
    fullName: String(item.title || '').trim()
  }));

  const combined = [...secNormalized, ...etfData].filter(item => item.symbol);

  const seen = new Set<string>();
  return combined.filter(item => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  });
};

const tickerDatabase = prepareDatabase();

export default function StockSearch() {
  // Now TypeScript knows exactly what NormalizedTicker is
  const [results, setResults] = useState<NormalizedTicker[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<NormalizedTicker | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toUpperCase().trim();
    setInputValue(e.target.value);

    if (!query) {
      setResults([]);
      return;
    }

    const matches = tickerDatabase
      .filter(item => item.symbol.includes(query) || item.fullName.toUpperCase().includes(query))
      .slice(0, 5);

    setResults(matches);
  };

  const initiateAddTicker = (item: NormalizedTicker) => {
    setPendingSelection(item);
    setIsModalOpen(true);
    setInputValue('');
    setResults([]);
  };

  const handleConfirmAdd = async () => {
    if (isSubmitting || !pendingSelection) return;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify({ action: 'ADD', ticker: pendingSelection.symbol }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.error?.includes('Limit reached')) {
          document.getElementById('limit-modal')?.classList.remove('hidden');
        } else if (data.error?.includes('already in watchlist')) {
          alert(`${pendingSelection.symbol} is already saved.`);
        } else {
          alert('Error adding ticker.');
        }
        return;
      }

      window.dispatchEvent(new CustomEvent('watchlist-updated', {
        detail: { ticker: pendingSelection.symbol }
      }));

      setIsModalOpen(false);
      setPendingSelection(null);
    } catch (err) {
      console.error('Network error:', err);
      alert('Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleSearch}
        placeholder="Search ticker or company..."
        className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
      />

      {results.length > 0 && (
        <ul className="absolute z-40 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {results.map((item) => (
            <li key={item.symbol} className="border-b border-slate-50 last:border-none">
              <button
                type="button"
                onClick={() => initiateAddTicker(item)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700 transition"
              >
                <span><strong className="text-slate-900">{item.symbol}</strong> - {item.fullName}</span>
                <span className="text-xs text-blue-600 font-medium">+ Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isModalOpen && pendingSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Add {pendingSelection.symbol}?</h3>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500">Cancel</button>
              <button onClick={handleConfirmAdd} disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                {isSubmitting ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}