import json

def prune_etfs():
    # 1. Load the JSON file
    with open('etf_tickers.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    def is_valid_etf(item):
        symbol = item.get('symbol', '')
        name = item.get('fullName', '').lower()
        
        # Flag: Warrants, Preferreds, etc., often have these symbols
        if '$' in symbol or '.' in symbol:
            return False
        
        # Flag: Explicit non-ETF keywords
        exclusion_keywords = [
            "common stock", "preferred", "warrant", "ordinary shares", 
            "beneficial interest", "notes", "debt", "bond", "inc.", "2x", "3x", "leveraged", "short"
        ]
        
        if any(keyword in name for keyword in exclusion_keywords):
            return False
            
        # Ensure it's actually an ETF/Fund
        if "etf" not in name and "fund" not in name:
            return False
            
        return True

    # 2. Filter the data
    filtered_data = [item for item in data if is_valid_etf(item)]

    # 3. Save to a new file
    with open('etf_tickers_cleaned.json', 'w', encoding='utf-8') as f:
        json.dump(filtered_data, f, indent=4)
    
    print(f"Success! Original: {len(data)} items. Cleaned: {len(filtered_data)} items.")

if __name__ == "__main__":
    prune_etfs()