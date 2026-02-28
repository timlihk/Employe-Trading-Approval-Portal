// Mock database module before importing anything
jest.mock('../../../src/models/database');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun, mockGetNull, mockQueryError } = require('../../utils/mockHelpers');

// BaseModel is abstract, so we test it through a concrete subclass
const BaseModel = require('../../../src/models/BaseModel');

class TestModel extends BaseModel {
  static get tableName() {
    return 'test_table';
  }
}

describe('BaseModel', () => {
  describe('tableName', () => {
    test('should throw error when tableName is not defined by subclass', () => {
      expect(() => BaseModel.tableName).toThrow('tableName must be defined by subclass');
    });

    test('should return tableName when defined by subclass', () => {
      expect(TestModel.tableName).toBe('test_table');
    });
  });

  describe('query', () => {
    test('should return empty array when pool is null', async () => {
      database.getPool.mockReturnValueOnce(null);
      const result = await TestModel.query('SELECT * FROM test_table');
      expect(result).toEqual([]);
      expect(database.query).not.toHaveBeenCalled();
    });

    test('should call database.query when pool exists', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ id: 1 }]);

      const result = await TestModel.query('SELECT * FROM test_table', []);
      expect(database.query).toHaveBeenCalledWith('SELECT * FROM test_table', []);
      expect(result).toEqual([{ id: 1 }]);
    });

    test('should pass params to database.query', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ id: 1 }]);

      await TestModel.query('SELECT * FROM test_table WHERE id = $1', [1]);
      expect(database.query).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = $1', [1]);
    });
  });

  describe('get', () => {
    test('should return null when pool is null', async () => {
      database.getPool.mockReturnValueOnce(null);
      const result = await TestModel.get('SELECT * FROM test_table WHERE id = $1', [1]);
      expect(result).toBeNull();
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should call database.get when pool exists', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRow = { id: 1, name: 'test' };
      mockGet(mockRow);

      const result = await TestModel.get('SELECT * FROM test_table WHERE id = $1', [1]);
      expect(database.get).toHaveBeenCalledWith('SELECT * FROM test_table WHERE id = $1', [1]);
      expect(result).toEqual(mockRow);
    });
  });

  describe('run', () => {
    test('should return default result when pool is null', async () => {
      database.getPool.mockReturnValueOnce(null);
      const result = await TestModel.run('DELETE FROM test_table WHERE id = $1', [1]);
      expect(result).toEqual({ uuid: null, changes: 0 });
      expect(database.run).not.toHaveBeenCalled();
    });

    test('should call database.run when pool exists', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun('some-uuid', 1);

      const result = await TestModel.run('DELETE FROM test_table WHERE id = $1', [1]);
      expect(database.run).toHaveBeenCalledWith('DELETE FROM test_table WHERE id = $1', [1]);
      expect(result).toEqual({ uuid: 'some-uuid', changes: 1 });
    });
  });

  describe('findAll', () => {
    test('should select all rows with no conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRows = [{ id: 1 }, { id: 2 }];
      mockQuery(mockRows);

      const result = await TestModel.findAll();
      expect(database.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table',
        []
      );
      expect(result).toEqual(mockRows);
    });

    test('should apply WHERE conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRows = [{ id: 1, status: 'active' }];
      mockQuery(mockRows);

      const result = await TestModel.findAll({ status: 'active' });
      expect(database.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1',
        ['active']
      );
      expect(result).toEqual(mockRows);
    });

    test('should apply multiple WHERE conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await TestModel.findAll({ status: 'active', type: 'admin' });
      expect(database.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1 AND type = $2',
        ['active', 'admin']
      );
    });

    test('should apply ORDER BY clause', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await TestModel.findAll({}, 'created_at DESC');
      expect(database.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table ORDER BY created_at DESC',
        []
      );
    });

    test('should apply both conditions and ORDER BY', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await TestModel.findAll({ status: 'pending' }, 'created_at ASC');
      expect(database.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1 ORDER BY created_at ASC',
        ['pending']
      );
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockError = new Error('Connection lost');
      database.query.mockRejectedValueOnce(mockError);

      await expect(TestModel.findAll()).rejects.toThrow('Connection lost');
    });
  });

  describe('findById', () => {
    test('should find a record by UUID', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRow = { uuid: 'abc-123', name: 'test' };
      mockGet(mockRow);

      const result = await TestModel.findById('abc-123');
      expect(database.get).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE uuid = $1',
        ['abc-123']
      );
      expect(result).toEqual(mockRow);
    });

    test('should return null when record not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await TestModel.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    test('should find one record with conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRow = { uuid: 'abc-123', email: 'test@example.com' };
      mockGet(mockRow);

      const result = await TestModel.findOne({ email: 'test@example.com' });
      expect(database.get).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE email = $1 LIMIT 1',
        ['test@example.com']
      );
      expect(result).toEqual(mockRow);
    });

    test('should select with LIMIT 1 and no conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ uuid: 'first' });

      const result = await TestModel.findOne();
      expect(database.get).toHaveBeenCalledWith(
        'SELECT * FROM test_table LIMIT 1',
        []
      );
      expect(result).toEqual({ uuid: 'first' });
    });

    test('should return null when no record matches', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await TestModel.findOne({ email: 'nobody@example.com' });
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    test('should insert a record and return it with id', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const data = { name: 'Test', email: 'test@example.com' };
      const result = await TestModel.create(data);

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO test_table'),
        ['Test', 'test@example.com']
      );
      expect(result).toEqual({ uuid: null, name: 'Test', email: 'test@example.com' });
    });

    test('should build correct placeholders for multiple fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const data = { a: 1, b: 2, c: 3 };
      await TestModel.create(data);

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('$1, $2, $3'),
        [1, 2, 3]
      );
    });

    test('should propagate database errors on create', async () => {
      database.getPool.mockReturnValueOnce({});
      database.run.mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(TestModel.create({ name: 'dup' })).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('update', () => {
    test('should update a record by UUID', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await TestModel.update('abc-123', { name: 'Updated' });

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test_table'),
        ['Updated', 'abc-123']
      );
      expect(result).toEqual({ changes: 1 });
    });

    test('should update multiple fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      await TestModel.update('abc-123', { name: 'Updated', status: 'active' });

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        ['Updated', 'active', 'abc-123']
      );
    });

    test('should return zero changes when record not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 0);

      const result = await TestModel.update('nonexistent', { name: 'X' });
      expect(result).toEqual({ changes: 0 });
    });
  });

  describe('updateWhere', () => {
    test('should update records matching conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 3);

      const result = await TestModel.updateWhere(
        { status: 'pending' },
        { status: 'approved' }
      );

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test_table'),
        ['approved', 'pending']
      );
      expect(result).toEqual({ changes: 3 });
    });

    test('should handle multiple conditions and data fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      await TestModel.updateWhere(
        { status: 'active', type: 'admin' },
        { name: 'new', email: 'new@test.com' }
      );

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('SET name = $1, email = $2'),
        ['new', 'new@test.com', 'active', 'admin']
      );
    });
  });

  describe('delete', () => {
    test('should delete a record by UUID', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await TestModel.delete('abc-123');

      expect(database.run).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE uuid = $1',
        ['abc-123']
      );
      expect(result).toEqual({ changes: 1 });
    });

    test('should return zero changes when record does not exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 0);

      const result = await TestModel.delete('nonexistent');
      expect(result).toEqual({ changes: 0 });
    });
  });

  describe('deleteWhere', () => {
    test('should delete records matching conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 5);

      const result = await TestModel.deleteWhere({ status: 'expired' });

      expect(database.run).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE status = $1',
        ['expired']
      );
      expect(result).toEqual({ changes: 5 });
    });

    test('should handle multiple conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 2);

      await TestModel.deleteWhere({ status: 'expired', type: 'temp' });

      expect(database.run).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE status = $1 AND type = $2',
        ['expired', 'temp']
      );
    });
  });

  describe('count', () => {
    test('should count all records with no conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 42 });

      const result = await TestModel.count();

      expect(database.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table',
        []
      );
      expect(result).toBe(42);
    });

    test('should count records with conditions', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 10 });

      const result = await TestModel.count({ status: 'active' });

      expect(database.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table WHERE status = $1',
        ['active']
      );
      expect(result).toBe(10);
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.get.mockRejectedValueOnce(new Error('DB error'));

      await expect(TestModel.count()).rejects.toThrow('DB error');
    });
  });

  describe('exists', () => {
    test('should return true when records exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 3 });

      const result = await TestModel.exists({ status: 'active' });
      expect(result).toBe(true);
    });

    test('should return false when no records exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 0 });

      const result = await TestModel.exists({ status: 'nonexistent' });
      expect(result).toBe(false);
    });
  });
});

describe('database.withTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should run callback and return its result', async () => {
    const result = await database.withTransaction(async (client) => {
      return { success: true };
    });
    expect(result).toEqual({ success: true });
  });

  test('should re-throw when callback throws (simulating rollback)', async () => {
    await expect(
      database.withTransaction(async () => {
        throw new Error('forced rollback');
      })
    ).rejects.toThrow('forced rollback');
  });

  test('should provide a mock client to the callback', async () => {
    let capturedClient;
    await database.withTransaction(async (client) => {
      capturedClient = client;
    });
    expect(capturedClient).toBeDefined();
    expect(typeof capturedClient.query).toBe('function');
  });
});
