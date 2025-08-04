const { spawn } = require('child_process');
const path = require('path');

class StockService {
    constructor() {
        this.pythonPath = path.join(__dirname, '../../venv/bin/python');
        this.scriptPath = path.join(__dirname, '../stock_service.py');
    }

    /**
     * Execute Python stock service script
     */
    async executePythonScript(command, args = []) {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(this.pythonPath, [this.scriptPath, command, ...args]);
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python script failed with code ${code}: ${stderr}`));
                    return;
                }
                
                try {
                    const result = JSON.parse(stdout.trim());
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Failed to parse Python script output: ${error.message}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python script: ${error.message}`));
            });
        });
    }

    /**
     * Get stock information by ticker
     */
    async getStockInfo(ticker) {
        try {
            // Ensure ticker is treated as string and preserve leading zeros
            const tickerString = String(ticker);
            const result = await this.executePythonScript('info', [tickerString]);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                ticker: ticker
            };
        }
    }

    /**
     * Calculate trade value and validate against max amount
     */
    async calculateTradeValue(ticker, shares, maxTradeAmount = null) {
        try {
            // Ensure ticker is treated as string and preserve leading zeros
            const args = [String(ticker), shares.toString()];
            if (maxTradeAmount !== null) {
                args.push(maxTradeAmount.toString());
            }
            
            const result = await this.executePythonScript('calculate', args);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                ticker: ticker,
                shares: shares
            };
        }
    }

    /**
     * Validate stock ticker exists
     */
    async validateTicker(ticker) {
        const info = await this.getStockInfo(ticker);
        return {
            valid: info.success && info.current_price !== null,
            ticker: info.ticker,
            company_name: info.company_name,
            error: info.success ? null : info.error
        };
    }
}

module.exports = new StockService();