const database = require('./database');

class BaseModel {
  static get tableName() {
    throw new Error('tableName must be defined by subclass');
  }

  static query(sql, params = []) {
    if (!database.getPool()) {
      return Promise.resolve([]);
    }
    return database.query(sql, params);
  }

  static get(sql, params = []) {
    if (!database.getPool()) {
      return Promise.resolve(null);
    }
    return database.get(sql, params);
  }

  static run(sql, params = []) {
    if (!database.getPool()) {
      return Promise.resolve({ lastID: null, changes: 0 });
    }
    return database.run(sql, params);
  }

  static findAll(conditions = {}, orderBy = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM ${this.tableName}`;
      let params = [];
      let paramIndex = 1;

      // Build WHERE conditions
      const conditionStrings = [];
      for (const [key, value] of Object.entries(conditions)) {
        conditionStrings.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      if (conditionStrings.length > 0) {
        query += ` WHERE ${conditionStrings.join(' AND ')}`;
      }

      if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
      }

      this.query(query, params).then(resolve).catch(reject);
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
      this.get(query, [id]).then(resolve).catch(reject);
    });
  }

  static findOne(conditions = {}) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM ${this.tableName}`;
      let params = [];
      let paramIndex = 1;

      const conditionStrings = [];
      for (const [key, value] of Object.entries(conditions)) {
        conditionStrings.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      if (conditionStrings.length > 0) {
        query += ` WHERE ${conditionStrings.join(' AND ')}`;
      }

      query += ' LIMIT 1';

      this.get(query, params).then(resolve).catch(reject);
    });
  }

  static create(data) {
    return new Promise((resolve, reject) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = values.map((_, index) => `$${index + 1}`);

      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES (${placeholders.join(', ')})
      `;

      this.run(query, values).then(result => {
        resolve({ id: result.lastID, ...data });
      }).catch(reject);
    });
  }

  static update(id, data) {
    return new Promise((resolve, reject) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE id = $${keys.length + 1}
      `;

      this.run(query, [...values, id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(reject);
    });
  }

  static updateWhere(conditions, data) {
    return new Promise((resolve, reject) => {
      const dataKeys = Object.keys(data);
      const dataValues = Object.values(data);
      const conditionKeys = Object.keys(conditions);
      const conditionValues = Object.values(conditions);

      let paramIndex = 1;
      const setClause = dataKeys.map(key => `${key} = $${paramIndex++}`).join(', ');
      const whereClause = conditionKeys.map(key => `${key} = $${paramIndex++}`).join(' AND ');

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE ${whereClause}
      `;

      this.run(query, [...dataValues, ...conditionValues]).then(result => {
        resolve({ changes: result.changes });
      }).catch(reject);
    });
  }

  static delete(id) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
      this.run(query, [id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(reject);
    });
  }

  static deleteWhere(conditions) {
    return new Promise((resolve, reject) => {
      const conditionKeys = Object.keys(conditions);
      const conditionValues = Object.values(conditions);
      const whereClause = conditionKeys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');

      const query = `DELETE FROM ${this.tableName} WHERE ${whereClause}`;

      this.run(query, conditionValues).then(result => {
        resolve({ changes: result.changes });
      }).catch(reject);
    });
  }

  static count(conditions = {}) {
    return new Promise((resolve, reject) => {
      let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      let params = [];
      let paramIndex = 1;

      const conditionStrings = [];
      for (const [key, value] of Object.entries(conditions)) {
        conditionStrings.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      if (conditionStrings.length > 0) {
        query += ` WHERE ${conditionStrings.join(' AND ')}`;
      }

      this.get(query, params).then(row => {
        resolve(row.count);
      }).catch(reject);
    });
  }

  static exists(conditions) {
    return new Promise((resolve, reject) => {
      this.count(conditions).then(count => {
        resolve(count > 0);
      }).catch(reject);
    });
  }
}

module.exports = BaseModel;