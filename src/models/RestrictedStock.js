const BaseModel = require('./BaseModel');

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

  static add(ticker, company_name, exchange = null, instrument_type = 'equity') {
    return this.create({
      ticker: ticker.toUpperCase(),
      company_name,
      exchange,
      instrument_type
    });
  }

  static remove(ticker) {
    return this.deleteWhere({ ticker: ticker.toUpperCase() });
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