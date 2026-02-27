const { renderCard } = require('../../utils/templates');

/**
 * Render clear database confirmation page
 * @param {Object} data
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @returns {string} HTML content
 */
function clearDatabaseTemplate({ csrfInput }) {
  const warningContent = `
      <div class="alert alert-warning mb-4">
        <h4 class="alert-heading mb-3">WARNING: This action cannot be undone!</h4>
        <p class="mb-0">
          You are about to <strong>permanently delete ALL data</strong> from the database and reset it to brand new state.
        </p>
      </div>

      <div class="mb-4">
        <h5 class="text-danger mb-3">This will delete:</h5>
        <ul class="text-danger">
          <li>All trading requests (approved, rejected, pending)</li>
          <li>All restricted stocks and changelog</li>
          <li>All audit logs and activity history</li>
          <li>All employee trading history</li>
        </ul>
      </div>

      <div class="alert alert-danger mb-4">
        <p class="mb-0 text-center font-weight-bold">
          FINAL WARNING: This action is IRREVERSIBLE
        </p>
      </div>

      <div class="text-center d-flex gap-3 justify-center">
        <a href="/admin-dashboard" class="btn btn-secondary text-decoration-none">
          ← Cancel (Go Back)
        </a>
        <form method="post" action="/admin-clear-database" class="d-inline">
          ${csrfInput}
          <button type="submit" class="btn btn-danger">
            YES, PERMANENTLY DELETE ALL DATA
          </button>
        </form>
      </div>
    `;

  const confirmContent = renderCard(
    'DANGER - Confirm Database Reset',
    warningContent,
    'Please read carefully before proceeding'
  );

  return `<div class="container">${confirmContent}</div>`;
}

module.exports = { clearDatabaseTemplate };
