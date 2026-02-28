const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class RestrictedStock extends BaseModel {
  static get tableName() {
    return 'restricted_stocks';
  }

  static getAll() {
    return this.findAll({}, 'ticker');
  }

  static isRestricted(ticker) {
    return this.exists({ ticker: ticker.toUpperCase() });
  }

  static getByTicker(ticker) {
    return this.findOne({ ticker: ticker.toUpperCase() });
  }

  static add(ticker, company_name, exchange = null, instrument_type = 'equity', client = null) {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();

      const sql = `
        INSERT INTO restricted_stocks (uuid, ticker, company_name, exchange, instrument_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING uuid
      `;

      const params = [uuid, ticker.toUpperCase(), company_name, exchange, instrument_type];

      this.query(sql, params, client).then(result => {
        const insertedRow = Array.isArray(result) ? result[0] : result.rows?.[0];
        resolve({ uuid: insertedRow?.uuid || uuid, ticker: ticker.toUpperCase(), company_name, exchange, instrument_type });
      }).catch(reject);
    });
  }

  static remove(ticker, client = null) {
    const sql = 'DELETE FROM restricted_stocks WHERE ticker = $1';
    return this.run(sql, [ticker.toUpperCase()], client)
      .then(result => ({ changes: result.changes }));
  }

  static getCount() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM restricted_stocks';
      this.get(sql, []).then(row => {
        resolve(row.count);
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = RestrictedStock;