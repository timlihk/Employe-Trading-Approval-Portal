// Mock all dependencies before importing anything
jest.mock('../../../src/models/database');
jest.mock('../../../src/models/StatementRequest');
jest.mock('../../../src/models/AuditLog');
jest.mock('../../../src/services/GraphAPIService');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const StatementRequest = require('../../../src/models/StatementRequest');
const GraphAPIService = require('../../../src/services/GraphAPIService');
const AuditLog = require('../../../src/models/AuditLog');
const { AppError } = require('../../../src/middleware/errorHandler');

// StatementRequestService exports a singleton instance
const statementRequestService = require('../../../src/services/StatementRequestService');

describe('StatementRequestService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.STATEMENT_UPLOAD_DEADLINE_DAYS = '14';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ──────────────────────────────────────────────
  // executeMonthlyRequest
  // ──────────────────────────────────────────────
  describe('executeMonthlyRequest', () => {
    test('should fetch employees and create requests for each', async () => {
      const employees = [
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' }
      ];
      GraphAPIService.getEmployees.mockResolvedValue(employees);

      StatementRequest.createRequest.mockResolvedValueOnce({
        uuid: 'req-1',
        upload_token: 'token-alice-abc123'
      });
      StatementRequest.createRequest.mockResolvedValueOnce({
        uuid: 'req-2',
        upload_token: 'token-bob-def456'
      });

      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.executeMonthlyRequest();

      expect(GraphAPIService.getEmployees).toHaveBeenCalled();
      expect(StatementRequest.createRequest).toHaveBeenCalledTimes(2);
      expect(GraphAPIService.sendEmail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.period).toHaveProperty('year');
      expect(result.period).toHaveProperty('month');
    });

    test('should skip employees that already have a request for the period', async () => {
      GraphAPIService.getEmployees.mockResolvedValue([
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' }
      ]);

      // Alice already has one (conflict -> null), Bob is new
      StatementRequest.createRequest.mockResolvedValueOnce(null);
      StatementRequest.createRequest.mockResolvedValueOnce({
        uuid: 'req-2',
        upload_token: 'token-bob'
      });

      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.executeMonthlyRequest();

      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
      expect(GraphAPIService.sendEmail).toHaveBeenCalledTimes(1);
    });

    test('should count failed employees when sendEmail throws', async () => {
      GraphAPIService.getEmployees.mockResolvedValue([
        { email: 'fail@example.com', name: 'Fail' }
      ]);

      StatementRequest.createRequest.mockResolvedValue({
        uuid: 'req-fail',
        upload_token: 'token-fail'
      });

      // Simulate send failure in sendStatementRequestEmail
      GraphAPIService.sendEmail.mockRejectedValue(new Error('SMTP error'));
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.executeMonthlyRequest();

      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
    });

    test('should return zeroes when no employees found', async () => {
      GraphAPIService.getEmployees.mockResolvedValue([]);

      const result = await statementRequestService.executeMonthlyRequest();

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(StatementRequest.createRequest).not.toHaveBeenCalled();
    });

    test('should return zeroes when employees is null', async () => {
      GraphAPIService.getEmployees.mockResolvedValue(null);

      const result = await statementRequestService.executeMonthlyRequest();

      expect(result.sent).toBe(0);
    });

    test('should throw and log audit when getEmployees fails', async () => {
      GraphAPIService.getEmployees.mockRejectedValue(new Error('Azure AD down'));
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await expect(
        statementRequestService.executeMonthlyRequest()
      ).rejects.toThrow('Azure AD down');

      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'system', 'admin', 'statement_request_cycle_failed',
        'system', null,
        expect.stringContaining('Failed to fetch employees')
      );
    });

    test('should log audit after successful cycle completion', async () => {
      GraphAPIService.getEmployees.mockResolvedValue([
        { email: 'alice@example.com', name: 'Alice' }
      ]);
      StatementRequest.createRequest.mockResolvedValue({
        uuid: 'req-1',
        upload_token: 'token-1'
      });
      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService.executeMonthlyRequest();

      // The last call to AuditLog.logActivity should be the cycle completion
      const lastCall = AuditLog.logActivity.mock.calls[AuditLog.logActivity.mock.calls.length - 1];
      expect(lastCall[0]).toBe('system');
      expect(lastCall[2]).toBe('statement_request_cycle_completed');
      expect(lastCall[5]).toContain('Sent: 1');
    });
  });

  // ──────────────────────────────────────────────
  // sendStatementRequestEmail
  // ──────────────────────────────────────────────
  describe('sendStatementRequestEmail', () => {
    const employee = { email: 'alice@example.com', name: 'Alice' };
    const uploadToken = 'token-abc123';
    const period = { year: 2026, month: 1 };

    test('should send email with correct subject and log audit', async () => {
      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService.sendStatementRequestEmail(employee, uploadToken, period);

      expect(GraphAPIService.sendEmail).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringContaining('Monthly Trading Statement Request'),
        expect.stringContaining('Upload Statement')
      );
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'system', 'admin', 'statement_email_sent',
        'statement_request', null,
        expect.stringContaining('alice@example.com')
      );
    });

    test('should include upload URL with token in email body', async () => {
      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService.sendStatementRequestEmail(employee, uploadToken, period);

      const emailBody = GraphAPIService.sendEmail.mock.calls[0][2];
      expect(emailBody).toContain(`/upload-statement/${uploadToken}`);
    });

    test('should throw and log failure audit when sendEmail fails', async () => {
      GraphAPIService.sendEmail.mockRejectedValue(new Error('Rate limited'));
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await expect(
        statementRequestService.sendStatementRequestEmail(employee, uploadToken, period)
      ).rejects.toThrow('Rate limited');

      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'system', 'admin', 'statement_email_failed',
        'statement_request', null,
        expect.stringContaining('Failed to send')
      );
    });
  });

  // ──────────────────────────────────────────────
  // generateEmailBody
  // ──────────────────────────────────────────────
  describe('generateEmailBody', () => {
    test('should generate HTML with employee name, upload URL, period, and deadline', () => {
      const period = { year: 2026, month: 1, monthName: 'January' };
      const deadline = new Date('2026-02-14');
      const uploadUrl = 'https://app.example.com/upload-statement/token123';

      const html = statementRequestService.generateEmailBody('Alice', uploadUrl, period, deadline);

      expect(html).toContain('Alice');
      expect(html).toContain(uploadUrl);
      expect(html).toContain('January 2026');
      expect(html).toContain('Upload Statement');
      expect(html).toContain('Monthly Trading Statement Request');
    });

    test('should use email as name fallback in calling code (service passes name or email)', () => {
      const period = { year: 2026, month: 2, monthName: 'February' };
      const deadline = new Date('2026-03-15');
      const uploadUrl = 'https://app.example.com/upload-statement/token456';

      const html = statementRequestService.generateEmailBody('user@example.com', uploadUrl, period, deadline);

      expect(html).toContain('user@example.com');
    });
  });

  // ──────────────────────────────────────────────
  // validateUploadToken
  // ──────────────────────────────────────────────
  describe('validateUploadToken', () => {
    test('should return null for empty or non-string token', async () => {
      expect(await statementRequestService.validateUploadToken(null)).toBeNull();
      expect(await statementRequestService.validateUploadToken(undefined)).toBeNull();
      expect(await statementRequestService.validateUploadToken('')).toBeNull();
      expect(await statementRequestService.validateUploadToken(12345)).toBeNull();
    });

    test('should return null for token with wrong length (not 64 chars)', async () => {
      const shortToken = 'a'.repeat(63);
      const longToken = 'b'.repeat(65);

      expect(await statementRequestService.validateUploadToken(shortToken)).toBeNull();
      expect(await statementRequestService.validateUploadToken(longToken)).toBeNull();
      expect(StatementRequest.findByUploadToken).not.toHaveBeenCalled();
    });

    test('should return null when no request found for token', async () => {
      const validToken = 'a'.repeat(64);
      StatementRequest.findByUploadToken.mockResolvedValue(null);

      const result = await statementRequestService.validateUploadToken(validToken);
      expect(result).toBeNull();
    });

    test('should return null when request status is already uploaded', async () => {
      const validToken = 'a'.repeat(64);
      StatementRequest.findByUploadToken.mockResolvedValue({
        uuid: 'req-1',
        status: 'uploaded',
        upload_token: validToken
      });

      const result = await statementRequestService.validateUploadToken(validToken);
      expect(result).toBeNull();
    });

    test('should return the request when token is valid and status is pending', async () => {
      const validToken = 'a'.repeat(64);
      const mockRequest = {
        uuid: 'req-1',
        status: 'pending',
        upload_token: validToken,
        employee_email: 'alice@example.com'
      };
      StatementRequest.findByUploadToken.mockResolvedValue(mockRequest);

      const result = await statementRequestService.validateUploadToken(validToken);
      expect(result).toEqual(mockRequest);
    });

    test('should return the request for overdue status (still allows upload)', async () => {
      const validToken = 'a'.repeat(64);
      const mockRequest = {
        uuid: 'req-2',
        status: 'overdue',
        upload_token: validToken
      };
      StatementRequest.findByUploadToken.mockResolvedValue(mockRequest);

      const result = await statementRequestService.validateUploadToken(validToken);
      expect(result).toEqual(mockRequest);
    });
  });

  // ──────────────────────────────────────────────
  // processUpload
  // ──────────────────────────────────────────────
  describe('processUpload', () => {
    const validToken = 'c'.repeat(64);
    const mockFile = {
      originalname: 'statement.pdf',
      buffer: Buffer.from('fake-pdf'),
      size: 1024,
      mimetype: 'application/pdf'
    };

    test('should throw AppError(400) when upload token is invalid', async () => {
      StatementRequest.findByUploadToken.mockResolvedValue(null);

      await expect(
        statementRequestService.processUpload(validToken, mockFile, 'notes', 'Schwab')
      ).rejects.toThrow(AppError);

      await expect(
        statementRequestService.processUpload(validToken, mockFile, 'notes', 'Schwab')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should update brokerage name and upload to SharePoint', async () => {
      const mockRequest = {
        uuid: 'req-1',
        status: 'pending',
        upload_token: validToken,
        employee_email: 'alice@example.com',
        period_year: 2026,
        period_month: 1
      };
      StatementRequest.findByUploadToken.mockResolvedValue(mockRequest);
      StatementRequest.updateBrokerage.mockResolvedValue({ changes: 1 });

      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'sp-item-123',
        webUrl: 'https://sharepoint.example.com/file.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({ ...mockRequest, status: 'uploaded' });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.processUpload(
        validToken, mockFile, 'my notes', 'Schwab'
      );

      expect(StatementRequest.updateBrokerage).toHaveBeenCalledWith('req-1', 'Schwab');
      expect(GraphAPIService.uploadToSharePoint).toHaveBeenCalledWith(
        mockFile.buffer,
        expect.stringContaining('statement.pdf'),
        expect.any(String)
      );
      expect(StatementRequest.markUploaded).toHaveBeenCalled();
      expect(result).toHaveProperty('originalFilename', 'statement.pdf');
      expect(result).toHaveProperty('sharepointUrl');
    });

    test('should not update brokerage when brokerageName is not provided', async () => {
      const mockRequest = {
        uuid: 'req-1',
        status: 'pending',
        upload_token: validToken,
        employee_email: 'alice@example.com',
        period_year: 2026,
        period_month: 1
      };
      StatementRequest.findByUploadToken.mockResolvedValue(mockRequest);
      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'sp-item-123',
        webUrl: 'https://sharepoint.example.com/file.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({ ...mockRequest, status: 'uploaded' });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService.processUpload(validToken, mockFile, null, null);

      expect(StatementRequest.updateBrokerage).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // _uploadToSharePointAndMark (shared upload logic)
  // ──────────────────────────────────────────────
  describe('_uploadToSharePointAndMark', () => {
    const mockRequest = {
      uuid: 'req-upload-1',
      employee_email: 'alice@example.com',
      period_year: 2026,
      period_month: 1,
      brokerage_name: 'Fidelity'
    };
    const mockFile = {
      originalname: 'jan-statement.pdf',
      buffer: Buffer.from('fake-pdf'),
      size: 2048,
      mimetype: 'application/pdf'
    };

    test('should upload to SharePoint, mark as uploaded, and log audit', async () => {
      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'sp-item-456',
        webUrl: 'https://sharepoint.example.com/jan-statement.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({
        ...mockRequest,
        status: 'uploaded'
      });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService._uploadToSharePointAndMark(
        mockRequest, mockFile, 'Review notes'
      );

      expect(GraphAPIService.uploadToSharePoint).toHaveBeenCalledWith(
        mockFile.buffer,
        expect.stringContaining('Fidelity'),
        expect.stringContaining('alice')
      );
      expect(StatementRequest.markUploaded).toHaveBeenCalledWith(
        'req-upload-1',
        expect.objectContaining({
          itemId: 'sp-item-456',
          webUrl: 'https://sharepoint.example.com/jan-statement.pdf',
          originalFilename: 'jan-statement.pdf',
          fileSize: 2048,
          contentType: 'application/pdf',
          notes: 'Review notes'
        })
      );
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'alice@example.com', 'employee', 'statement_uploaded',
        'statement_request', 'req-upload-1',
        expect.stringContaining('jan-statement.pdf')
      );
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('sharepointUrl');
    });

    test('should throw AppError(502) when SharePoint upload fails', async () => {
      GraphAPIService.uploadToSharePoint.mockRejectedValue(new Error('SharePoint 503'));
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await expect(
        statementRequestService._uploadToSharePointAndMark(mockRequest, mockFile, null)
      ).rejects.toThrow(AppError);

      await expect(
        statementRequestService._uploadToSharePointAndMark(mockRequest, mockFile, null)
      ).rejects.toMatchObject({ statusCode: 502 });

      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'alice@example.com', 'employee', 'statement_sharepoint_upload_failed',
        'statement_request', 'req-upload-1',
        expect.stringContaining('SharePoint upload failed')
      );
    });

    test('should build folder path with brokerage-sanitized filename', async () => {
      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'item-1',
        webUrl: 'https://sp.example.com/file.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({});
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService._uploadToSharePointAndMark(mockRequest, mockFile, null);

      const uploadCall = GraphAPIService.uploadToSharePoint.mock.calls[0];
      const filename = uploadCall[1];
      // Filename should include sanitized brokerage name
      expect(filename).toMatch(/^Fidelity_/);
      expect(filename).toContain('jan-statement.pdf');
    });

    test('should handle request with no brokerage name', async () => {
      const noBrokerageRequest = {
        ...mockRequest,
        brokerage_name: null
      };
      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'item-2',
        webUrl: 'https://sp.example.com/file.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({});
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService._uploadToSharePointAndMark(noBrokerageRequest, mockFile, null);

      const filename = GraphAPIService.uploadToSharePoint.mock.calls[0][1];
      // Should not start with brokerage prefix
      expect(filename).not.toMatch(/^Fidelity/);
      expect(filename).toContain('jan-statement.pdf');
    });
  });

  // ──────────────────────────────────────────────
  // processEmployeeUpload
  // ──────────────────────────────────────────────
  describe('processEmployeeUpload', () => {
    const employee = { email: 'bob@example.com', name: 'Bob' };
    const mockFile = {
      originalname: 'feb-statement.pdf',
      buffer: Buffer.from('pdf-content'),
      size: 4096,
      mimetype: 'application/pdf'
    };
    const period = { year: 2026, month: 2 };

    test('should create self-service request and upload', async () => {
      StatementRequest.createSelfServiceRequest.mockResolvedValue({
        uuid: 'self-req-1',
        employee_email: 'bob@example.com',
        period_year: 2026,
        period_month: 2,
        brokerage_name: 'TD Ameritrade'
      });
      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'sp-self-1',
        webUrl: 'https://sp.example.com/bob-feb.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({});
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.processEmployeeUpload(
        employee, mockFile, period, 'TD Ameritrade', 'some notes'
      );

      expect(StatementRequest.createSelfServiceRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          period_year: 2026,
          period_month: 2,
          employee_email: 'bob@example.com',
          employee_name: 'Bob',
          brokerage_name: 'TD Ameritrade'
        })
      );
      expect(result).toHaveProperty('originalFilename', 'feb-statement.pdf');
    });

    test('should throw AppError(400) when statement already uploaded for period+brokerage', async () => {
      StatementRequest.createSelfServiceRequest.mockResolvedValue(null);
      StatementRequest.query.mockResolvedValue([{
        uuid: 'existing-req',
        status: 'uploaded',
        employee_email: 'bob@example.com'
      }]);

      await expect(
        statementRequestService.processEmployeeUpload(employee, mockFile, period, 'Schwab', null)
      ).rejects.toThrow(AppError);

      await expect(
        statementRequestService.processEmployeeUpload(employee, mockFile, period, 'Schwab', null)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw AppError(500) when no existing record found after conflict', async () => {
      StatementRequest.createSelfServiceRequest.mockResolvedValue(null);
      StatementRequest.query.mockResolvedValue(null);

      await expect(
        statementRequestService.processEmployeeUpload(employee, mockFile, period, 'Schwab', null)
      ).rejects.toMatchObject({ statusCode: 500 });
    });

    test('should proceed with existing pending record after conflict', async () => {
      StatementRequest.createSelfServiceRequest.mockResolvedValue(null);
      StatementRequest.query.mockResolvedValue([{
        uuid: 'existing-pending-req',
        status: 'pending',
        employee_email: 'bob@example.com',
        period_year: 2026,
        period_month: 2,
        brokerage_name: 'Schwab'
      }]);

      GraphAPIService.uploadToSharePoint.mockResolvedValue({
        itemId: 'sp-existing',
        webUrl: 'https://sp.example.com/existing.pdf'
      });
      StatementRequest.markUploaded.mockResolvedValue({});
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await statementRequestService.processEmployeeUpload(
        employee, mockFile, period, 'Schwab', null
      );

      expect(result).toHaveProperty('originalFilename', 'feb-statement.pdf');
    });
  });

  // ──────────────────────────────────────────────
  // getAdminDashboardData
  // ──────────────────────────────────────────────
  describe('getAdminDashboardData', () => {
    test('should return summary, requests, and available periods', async () => {
      const mockSummary = { total: 10, pending: 3, uploaded: 5, overdue: 2, skipped: 0 };
      const mockRequests = [{ uuid: 'req-1' }, { uuid: 'req-2' }];
      const mockPeriods = [{ period_year: 2026, period_month: 1 }];

      StatementRequest.getPeriodSummary.mockResolvedValue(mockSummary);
      StatementRequest.getByPeriod.mockResolvedValue(mockRequests);
      StatementRequest.getAvailablePeriods.mockResolvedValue(mockPeriods);

      const result = await statementRequestService.getAdminDashboardData(2026, 1);

      expect(StatementRequest.getPeriodSummary).toHaveBeenCalledWith(2026, 1);
      expect(StatementRequest.getByPeriod).toHaveBeenCalledWith(2026, 1);
      expect(StatementRequest.getAvailablePeriods).toHaveBeenCalled();
      expect(result).toEqual({
        summary: mockSummary,
        requests: mockRequests,
        availablePeriods: mockPeriods
      });
    });
  });

  // ──────────────────────────────────────────────
  // markOverdueRequests
  // ──────────────────────────────────────────────
  describe('markOverdueRequests', () => {
    test('should return array of marked overdue requests', async () => {
      const overdueList = [
        { uuid: 'req-overdue-1', employee_email: 'late@example.com' }
      ];
      StatementRequest.markOverdue.mockResolvedValue(overdueList);

      const result = await statementRequestService.markOverdueRequests();

      expect(StatementRequest.markOverdue).toHaveBeenCalled();
      expect(result).toEqual(overdueList);
    });

    test('should return empty array when no requests are overdue', async () => {
      StatementRequest.markOverdue.mockResolvedValue([]);

      const result = await statementRequestService.markOverdueRequests();
      expect(result).toEqual([]);
    });

    test('should return empty array when markOverdue returns null', async () => {
      StatementRequest.markOverdue.mockResolvedValue(null);

      const result = await statementRequestService.markOverdueRequests();
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // sendReminders
  // ──────────────────────────────────────────────
  describe('sendReminders', () => {
    test('should send reminders for all pending requests and return count', async () => {
      const pendingRequests = [
        {
          uuid: 'rem-1',
          employee_email: 'alice@example.com',
          employee_name: 'Alice',
          upload_token: 'token-a',
          period_year: 2026,
          period_month: 1
        },
        {
          uuid: 'rem-2',
          employee_email: 'bob@example.com',
          employee_name: 'Bob',
          upload_token: 'token-b',
          period_year: 2026,
          period_month: 1
        }
      ];

      StatementRequest.getPendingForReminders.mockResolvedValue(pendingRequests);
      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');
      StatementRequest.incrementReminderCount.mockResolvedValue({ changes: 1 });

      const result = await statementRequestService.sendReminders();

      expect(result).toBe(2);
      expect(GraphAPIService.sendEmail).toHaveBeenCalledTimes(2);
      expect(StatementRequest.incrementReminderCount).toHaveBeenCalledTimes(2);
    });

    test('should handle individual reminder failures gracefully', async () => {
      const pendingRequests = [
        {
          uuid: 'rem-fail',
          employee_email: 'fail@example.com',
          employee_name: 'Fail',
          upload_token: 'token-fail',
          period_year: 2026,
          period_month: 1
        },
        {
          uuid: 'rem-ok',
          employee_email: 'ok@example.com',
          employee_name: 'Ok',
          upload_token: 'token-ok',
          period_year: 2026,
          period_month: 1
        }
      ];

      StatementRequest.getPendingForReminders.mockResolvedValue(pendingRequests);
      // First call to sendReminderEmail fails, second succeeds.
      // sendReminderEmail calls GraphAPIService.sendEmail
      GraphAPIService.sendEmail.mockRejectedValueOnce(new Error('SMTP error'));
      GraphAPIService.sendEmail.mockResolvedValueOnce(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');
      StatementRequest.incrementReminderCount.mockResolvedValue({ changes: 1 });

      const result = await statementRequestService.sendReminders();

      // First one failed in sendReminderEmail (throws), so only second is counted
      // But note: sendReminderEmail throws, which is caught by sendReminders try/catch
      expect(result).toBe(1);
    });

    test('should return 0 when no pending requests exist', async () => {
      StatementRequest.getPendingForReminders.mockResolvedValue([]);

      const result = await statementRequestService.sendReminders();

      expect(result).toBe(0);
      expect(GraphAPIService.sendEmail).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // sendReminderEmail
  // ──────────────────────────────────────────────
  describe('sendReminderEmail', () => {
    const employee = { email: 'alice@example.com', name: 'Alice' };
    const uploadToken = 'reminder-token-123';
    const period = { year: 2026, month: 1 };

    test('should send reminder email with correct subject', async () => {
      GraphAPIService.sendEmail.mockResolvedValue(undefined);
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await statementRequestService.sendReminderEmail(employee, uploadToken, period);

      expect(GraphAPIService.sendEmail).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringContaining('Reminder'),
        expect.stringContaining('Upload Statement')
      );
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        'system', 'admin', 'statement_reminder_sent',
        'statement_request', null,
        expect.stringContaining('Reminder email sent to alice@example.com')
      );
    });

    test('should throw when GraphAPIService.sendEmail fails', async () => {
      GraphAPIService.sendEmail.mockRejectedValue(new Error('Throttled'));

      await expect(
        statementRequestService.sendReminderEmail(employee, uploadToken, period)
      ).rejects.toThrow('Throttled');
    });
  });
});
