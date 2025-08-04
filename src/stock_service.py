#!/usr/bin/env python3
"""
Stock data service using yfinance
Provides stock information and validation for the trading approval system
"""

import yfinance as yf
import json
import sys
import requests
import time
from datetime import datetime

class StockService:
    def __init__(self):
        # Exchange rate cache to avoid too many API calls
        self.exchange_rates = {}
        self.rates_last_updated = None
    
    def get_exchange_rate(self, from_currency, to_currency='USD'):
        """
        Get exchange rate from one currency to another using a free API
        """
        if from_currency == to_currency:
            return 1.0
            
        try:
            # Use a simple exchange rate API (exchangerate-api.com has a free tier)
            # For production, consider using a more robust service
            url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return data['rates'].get(to_currency, 1.0)
            else:
                # Fallback - return 1.0 if can't get rate
                print(f"Warning: Could not get exchange rate for {from_currency} to {to_currency}")
                return 1.0
                
        except Exception as e:
            print(f"Error getting exchange rate: {e}")
            # Return some common approximate rates as fallback
            fallback_rates = {
                'HKD': 0.128,  # HK Dollar to USD
                'GBP': 1.27,   # British Pound to USD
                'CAD': 0.74,   # Canadian Dollar to USD
                'JPY': 0.0067,  # Japanese Yen to USD
                'EUR': 1.09,   # Euro to USD
            }
            return fallback_rates.get(from_currency, 1.0)
    
    def get_stock_info(self, ticker, max_retries=2):
        """
        Get stock information including name and current price with retry logic
        """
        last_error = None
        
        for attempt in range(max_retries + 1):
            try:
                # Clean and format ticker
                ticker = ticker.upper().strip()
                
                # Create ticker object
                stock = yf.Ticker(ticker)
                
                # Get stock info with timeout
                info = stock.info
                
                # If we get minimal data on first attempt, retry once
                if info and len(info) <= 2 and attempt < max_retries:
                    time.sleep(1)  # Brief delay before retry
                    continue
                
                # Get current price (try multiple fields as yfinance structure can vary)
                current_price = None
                price_fields = ['currentPrice', 'regularMarketPrice', 'price', 'ask', 'bid']
                
                for field in price_fields:
                    if field in info and info[field] is not None:
                        current_price = float(info[field])
                        break
                
                # If no price found in info, try getting from history
                if current_price is None:
                    hist = stock.history(period="1d")
                    if not hist.empty:
                        current_price = float(hist['Close'].iloc[-1])
                
                # Get company name
                company_name = None
                name_fields = ['longName', 'shortName', 'displayName']
                
                for field in name_fields:
                    if field in info and info[field] is not None:
                        company_name = info[field]
                        break
                
                # Continue with validation
                
                # Validation: A valid ticker should have at least a company name or price
                # If both are missing, it's likely an invalid ticker
                if not company_name and current_price is None:
                    if attempt < max_retries:
                        time.sleep(1)
                        continue
                    
                    return {
                        'success': False,
                        'error': f'Invalid ticker: No company information or price data found for {ticker}',
                        'ticker': ticker
                    }
                
                # Additional validation: If company name is still None but we have price data,
                # it might be a valid ticker but with incomplete data
                if not company_name:
                    # Try to get more info from the stock object
                    try:
                        # Check if ticker exists by trying to get basic info
                        if not info or len(info) <= 2:  # yfinance returns minimal data for invalid tickers
                            if attempt < max_retries:
                                time.sleep(1)
                                continue
                                
                            return {
                                'success': False,
                                'error': f'Invalid ticker: {ticker} not found or insufficient data',
                                'ticker': ticker
                            }
                    except Exception:
                        pass
                        
                    company_name = f"Unknown ({ticker})"
                
                # Return structured data
                result = {
                    'success': True,
                    'ticker': ticker,
                    'company_name': company_name,
                    'current_price': current_price,
                    'currency': info.get('currency', 'USD'),
                    'exchange': info.get('exchange', 'Unknown'),
                    'last_updated': datetime.now().isoformat()
                }
                
                return result
                
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    time.sleep(1)
                    continue
                else:
                    break
        
        # If we get here, all retries failed
        error_details = {
            'success': False,
            'error': str(last_error) if last_error else 'Failed to get stock information after retries',
            'ticker': ticker,
            'debug_info': {
                'exception_type': type(last_error).__name__ if last_error else 'RetryExhausted',
                'attempts_made': max_retries + 1,
                'last_error': str(last_error) if last_error else 'No specific error'
            }
        }
        return error_details
    
    def calculate_trade_value(self, ticker, shares, max_trade_amount=None):
        """
        Calculate total trade value and validate against max amount
        """
        try:
            shares = int(shares)
            if shares <= 0:
                return {
                    'success': False,
                    'error': 'Number of shares must be positive'
                }
            
            # Get stock info
            stock_info = self.get_stock_info(ticker)
            
            if not stock_info['success']:
                return stock_info
            
            current_price = stock_info['current_price']
            if current_price is None:
                return {
                    'success': False,
                    'error': 'Unable to fetch current stock price'
                }
            
            # Calculate total value in local currency
            local_currency = stock_info['currency']
            total_value_local = current_price * shares
            
            # Convert to USD for storage and limit checking
            exchange_rate = self.get_exchange_rate(local_currency, 'USD')
            current_price_usd = current_price * exchange_rate
            total_value_usd = total_value_local * exchange_rate
            
            result = {
                'success': True,
                'ticker': stock_info['ticker'],
                'company_name': stock_info['company_name'],
                'current_price': current_price,
                'current_price_usd': current_price_usd,
                'shares': shares,
                'total_value': total_value_local,
                'total_value_usd': total_value_usd,
                'currency': local_currency,
                'exchange_rate': exchange_rate,
                'formatted_price': f"{current_price:.2f} {local_currency}",
                'formatted_price_usd': f"${current_price_usd:.2f}",
                'formatted_total': f"{total_value_local:,.2f} {local_currency}",
                'formatted_total_usd': f"${total_value_usd:,.2f}",
                'last_updated': stock_info['last_updated']
            }
            
            # Check against max trade amount if provided (always in USD)
            if max_trade_amount is not None:
                max_amount_usd = float(max_trade_amount)
                result['max_trade_amount'] = max_amount_usd
                result['exceeds_max'] = total_value_usd > max_amount_usd
                result['formatted_max'] = f"${max_amount_usd:,.2f}"
                
                if result['exceeds_max']:
                    result['max_shares_allowed'] = int(max_amount_usd / current_price_usd)
            
            return result
            
        except ValueError as e:
            return {
                'success': False,
                'error': f'Invalid number format: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

def main():
    """
    Command line interface for the stock service
    """
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Usage: stock_service.py <command> [args...]'}))
        return
    
    service = StockService()
    command = sys.argv[1]
    
    if command == 'info' and len(sys.argv) >= 3:
        ticker = sys.argv[2]
        result = service.get_stock_info(ticker)
        print(json.dumps(result))
        
    elif command == 'calculate' and len(sys.argv) >= 4:
        ticker = sys.argv[2]
        shares = sys.argv[3]
        max_amount = sys.argv[4] if len(sys.argv) >= 5 else None
        result = service.calculate_trade_value(ticker, shares, max_amount)
        print(json.dumps(result))
        
    else:
        print(json.dumps({
            'success': False, 
            'error': 'Invalid command. Use: info <ticker> or calculate <ticker> <shares> [max_amount]'
        }))

if __name__ == '__main__':
    main()