const database = require('./database');

class RestrictedStock {
  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stocks ORDER BY ticker';
      
      database.query(sql, []).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static isRestricted(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM restricted_stocks WHERE ticker = $1';
      
      database.get(sql, [ticker.toUpperCase()]).then(row => {
        resolve(row.count > 0);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getByTicker(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stocks WHERE ticker = $1';
      
      database.get(sql, [ticker.toUpperCase()]).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static add(ticker, company_name, exchange = null) {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO restricted_stocks (ticker, company_name, exchange) VALUES ($1, $2, $3)';
      
      database.run(sql, [ticker.toUpperCase(), company_name, exchange]).then(result => {
        resolve({ id: result.lastID, ticker: ticker.toUpperCase(), company_name, exchange });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static remove(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM restricted_stocks WHERE ticker = $1';
      
      database.run(sql, [ticker.toUpperCase()]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = RestrictedStock;