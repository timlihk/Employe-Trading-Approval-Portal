// Template: Invalid upload link page
// Receives no data, returns an HTML string

/**
 * @returns {string} HTML string
 */
function renderInvalidLink() {
  return `
        <div class="upload-container">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Invalid or Expired Link</h3>
            </div>
            <div class="card-body text-center">
              <p class="mb-4">This upload link is no longer valid. It may have expired or the statement has already been uploaded.</p>
              <a href="/" class="btn btn-primary">Go to Portal</a>
            </div>
          </div>
        </div>`;
}

module.exports = renderInvalidLink;
