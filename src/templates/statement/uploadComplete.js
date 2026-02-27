// Template: Upload completion page
// Receives a plain data object, returns an HTML string

/**
 * @param {object} data
 * @param {string} data.period - display period string (e.g., "January 2026")
 * @param {string} data.originalFilename - name of the uploaded file
 * @returns {string} HTML string
 */
function renderUploadComplete(data) {
  const { period, originalFilename } = data;

  return `
        <div class="upload-container">
          <div class="card">
            <div class="card-body">
              <div class="upload-success">
                <div class="upload-success-icon">&#10003;</div>
                <h3>Statement Uploaded</h3>
                <p class="mb-4">Your <strong>${period}</strong> trading statement has been received and securely stored.</p>
                <p class="mb-6"><strong>File:</strong> ${originalFilename}</p>
                <a href="/" class="btn btn-primary">Go to Portal</a>
              </div>
            </div>
          </div>
        </div>`;
}

module.exports = renderUploadComplete;
