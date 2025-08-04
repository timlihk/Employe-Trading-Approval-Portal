const database = require('./database');

class RestrictedStock {
  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stocks ORDER BY ticker';
      
      database.getDb().all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static isRestricted(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM restricted_stocks WHERE ticker = ?';
      
      database.getDb().get(sql, [ticker.toUpperCase()], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  }

  static getByTicker(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stocks WHERE ticker = ?';
      
      database.getDb().get(sql, [ticker.toUpperCase()], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static add(ticker, company_name, exchange = null) {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO restricted_stocks (ticker, company_name, exchange) VALUES (?, ?, ?)';
      
      database.getDb().run(sql, [ticker.toUpperCase(), company_name, exchange], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ticker: ticker.toUpperCase(), company_name, exchange });
        }
      });
    });
  }

  static remove(ticker) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM restricted_stocks WHERE ticker = ?';
      
      database.getDb().run(sql, [ticker.toUpperCase()], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }
}

module.exports = RestrictedStock;