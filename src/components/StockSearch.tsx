//StockSearch.astro
import { useState, useEffect, useRef } from 'react';

interface SECTickerItem {
  cik_str: number;
  ticker: string;
  title: string;
}

interface NormalizedTicker {
  symbol: string;
  fullName: string;
}

export default function StockSearch() {
  const [tickerDatabase, setTickerDatabase] = useState<NormalizedTicker[]>([]);
  const [results, setResults] = useState<NormalizedTicker[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  // Modal tracking states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<NormalizedTicker | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
  Promise.all([
    fetch('/company_tickers.json').then(res => res.json()),
    fetch('/etf_tickers.json').then(res => res.json())
  ]).then(([secData, etfData]: [Record<string, SECTickerItem>, NormalizedTicker[]]) => {
    const secNormalized = Object.values(secData).map((item) => ({
      symbol: String(item.ticker || '').toUpperCase().trim(),
      fullName: String(item.title || '').trim()
    }));

    // ETF file is already a flat array in NormalizedTicker shape
    const combined = [...secNormalized, ...etfData]
      .filter(item => item.symbol);

    // Dedupe in case any ETFs overlap with SEC listings
    const seen = new Set<string>();
    const deduped = combined.filter(item => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    });

    setTickerDatabase(deduped);
  }).catch(err => console.error("Error loading ticker databases:", err));
}, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toUpperCase().trim();
    setInputValue(e.target.value);
    
    if (!query) {
      setResults([]);
      return;
    }

    const matches = tickerDatabase
      .filter(item => 
        item.symbol.includes(query) || 
        item.fullName.toUpperCase().includes(query)
      )
      .slice(0, 5);

    setResults(matches);
  };

  // Step 1: Intercept choice and trigger modal display
  const initiateAddTicker = (item: NormalizedTicker) => {
    setPendingSelection(item);
    setIsModalOpen(true);
    setInputValue('');
    setResults([]);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 2: User confirmed. Commit selection to Astro SSR frontmatter pipeline
const handleConfirmAdd = async () => {
  // 1. Prevent double-click early exit
  if (isSubmitting || !pendingSelection) return;

  setIsSubmitting(true);

  try {
    const response = await fetch('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ action: 'ADD', ticker: pendingSelection.symbol }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json().catch(() => ({}));

    // 2. Handle Errors
    if (!response.ok) {
      if (data.error?.includes('Limit reached')) {
        document.getElementById('limit-modal')?.classList.remove('hidden');
      } else if (data.error?.includes('already in watchlist')) {
        alert(`${pendingSelection.symbol} is already saved in your watchlist.`);
        setIsModalOpen(false);
        setPendingSelection(null);
      } else if (response.status === 429) {
        alert('Too many requests — please wait a moment and try again.');
      } else {
        console.error('API Error:', data.error || 'Unknown error');
      }
      return; // Exit after handling error
    }

    // 3. Success
    window.dispatchEvent(new CustomEvent('watchlist-updated', {
      detail: { ticker: pendingSelection.symbol }
    }));
    
    setIsModalOpen(false);
    setPendingSelection(null);

  } catch (err) {
    console.error('Network or Parse error:', err);
    alert('Something went wrong. Please check your connection.');
  } finally {
    // 4. Always reset loading state
    setIsSubmitting(false);
  }
};

  const handleCancelAdd = () => {
    setPendingSelection(null);
    setIsModalOpen(false);
  };

return (
  <div className="relative">
    {/* Updated hidden form wrapper layout to include execution actions */}
    <form ref={formRef} method="POST" className="hidden">
      <input type="hidden" name="ticker" />
      <input type="hidden" name="_action" value="ADD" /> {/* <-- Added this line */}
    </form>

      <input 
        type="text" 
        value={inputValue}
        onChange={handleSearch} 
        placeholder="Search ticker or company..." 
        className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
      />
      
      {/* Dropdown Menu Result Set */}
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

      {/* Confirmation Modal Overlay Component Blocks */}
      {isModalOpen && pendingSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-100 p-5 space-y-4 transform transition-all scale-100">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">Add to Watchlist?</h3>
              <p className="text-sm text-slate-500">
                Are you sure you want to add{' '}
                <strong className="text-slate-800">{pendingSelection.symbol}</strong> ({pendingSelection.fullName})
                to the watchlist?
              </p>
            </div>
            
            <div className="flex items-center justify-end space-x-2 text-sm font-medium pt-2">
              <button
                type="button"
                onClick={handleCancelAdd}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}