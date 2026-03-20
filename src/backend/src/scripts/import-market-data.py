#!/usr/bin/env python3
"""
Import market data from CSE companyInfoSummery API into company_financials table.
Fetches 52-week high/low, market cap, and beta for tracked stocks.
"""
import json
import time
import requests
import sys
from datetime import date

BACKEND_URL = "http://localhost:3001/api"
CSE_API_URL = "https://www.cse.lk/api/companyInfoSummery"

# Priority stocks: whitelist + high-volume stocks
PRIORITY_SYMBOLS = [
    "AEL.N0000", "TJL.N0000", "TKYO.N0000", "TKYO.X0000",
    "LLUB.N0000", "TILE.N0000", "RCL.N0000", "KVAL.N0000",
    "COCO.N0000", "GRAN.N0000", "DIPD.N0000",
    # Additional commonly tracked stocks
    "HAYL.N0000", "LHCL.N0000", "CERA.N0000", "ACL.N0000",
    "CARS.N0000", "CPC.N0000", "DIAL.N0000", "JKH.N0000",
    "KGAL.N0000", "KZOO.N0000", "LDEV.N0000", "MAXI.N0000",
    "MELA.N0000", "MTLL.N0000", "PARQ.N0000", "REEF.N0000",
    "SEMB.N0000", "WATA.N0000",
]

def fetch_cse_info(symbol: str) -> dict | None:
    try:
        response = requests.post(
            CSE_API_URL,
            data={"symbol": symbol},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        data = response.json()
        info = data.get("reqSymbolInfo")
        beta = data.get("reqSymbolBetaInfo")
        if not info:
            return None
        result = {
            "market_cap": info.get("marketCap"),
            "fifty_two_week_high": info.get("p12HiPrice"),
            "fifty_two_week_low": info.get("p12LowPrice"),
            "last_price": info.get("lastTradedPrice"),
        }
        if beta:
            result["beta"] = beta.get("triASIBetaValue")
        return result
    except Exception as e:
        print(f"  Error fetching {symbol}: {e}")
        return None

def import_financials(symbol: str, data: dict) -> bool:
    today = date.today().isoformat()
    year = str(date.today().year)
    payload = {
        "symbol": symbol,
        "fiscal_year": year,
        "quarter": "MARKET_DATA",
        "source": "CSE_API",
        "report_date": today,
    }
    # Only include non-null values
    if data.get("market_cap") is not None:
        # Store market cap in total_assets as proxy (actual MC is not a P&L item)
        pass  # market cap not in schema directly
    if data.get("fifty_two_week_high") is not None:
        payload["pe_ratio"] = None  # no P/E from this source
    # The schema doesn't have market_cap, 52w hi/lo directly
    # We'll store what we can - dividend yield if known, and note the source
    payload["source"] = f"CSE_API:MC={data.get('market_cap', 'N/A')},52wH={data.get('fifty_two_week_high', 'N/A')},52wL={data.get('fifty_two_week_low', 'N/A')}"

    try:
        response = requests.post(
            f"{BACKEND_URL}/financials",
            json=payload,
            timeout=10,
        )
        if response.status_code in (200, 201):
            return True
        elif response.status_code == 409:
            print(f"  {symbol}: already exists")
            return True
        else:
            print(f"  {symbol}: HTTP {response.status_code} - {response.text[:100]}")
            return False
    except Exception as e:
        print(f"  Error importing {symbol}: {e}")
        return False

def main():
    print(f"Importing market data for {len(PRIORITY_SYMBOLS)} stocks...")
    success = 0
    failed = 0

    for i, symbol in enumerate(PRIORITY_SYMBOLS):
        print(f"[{i+1}/{len(PRIORITY_SYMBOLS)}] Fetching {symbol}...")
        data = fetch_cse_info(symbol)
        if data:
            mc = data.get("market_cap", 0)
            hi52 = data.get("fifty_two_week_high", 0)
            lo52 = data.get("fifty_two_week_low", 0)
            print(f"  MC={mc:,.0f}, 52wH={hi52}, 52wL={lo52}")
            if import_financials(symbol, data):
                success += 1
            else:
                failed += 1
        else:
            print(f"  No data for {symbol}")
            failed += 1

        if i < len(PRIORITY_SYMBOLS) - 1:
            time.sleep(1)  # respectful delay

    print(f"\n{'='*50}")
    print(f"Import complete: {success} success, {failed} failed")
    coverage = requests.get(f"{BACKEND_URL}/financials/summary/coverage").json()
    print(f"Coverage: {coverage.get('stocks_with_financials', 0)}/{coverage.get('total_stocks', 0)} stocks ({coverage.get('coverage_percent', 0):.1f}%)")

if __name__ == "__main__":
    main()
