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

  static add(ticker, company_name, exchange = null) {
    return this.create({
      ticker: ticker.toUpperCase(),
      company_name,
      exchange
    });
  }

  static remove(ticker) {
    return this.deleteWhere({ ticker: ticker.toUpperCase() });
  }
}

module.exports = RestrictedStock;