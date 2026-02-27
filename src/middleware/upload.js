const multer = require('multer');
const path = require('path');

// Memory storage — file buffer goes directly to SharePoint, no temp files on disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.csv', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, PNG, JPG, CSV, XLSX'), false);
  }
};

const uploadStatement = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1
  }
});

module.exports = { uploadStatement };
