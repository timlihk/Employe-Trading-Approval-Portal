/**
 * Render admin login page
 * @param {Object} data
 * @param {string} data.banner - notification banner HTML
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @returns {string} HTML content (inner content, not full page)
 */
function loginTemplate({ banner, csrfInput }) {
  return `
    ${banner}
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-title">Administrator Sign In</div>
          <p class="login-subtitle">Inspiration Capital Management Limited</p>
        </div>
        <div class="login-body">
          <form method="post" action="/admin-authenticate">
            ${csrfInput}
            <div class="mb-4">
              <label class="form-label">Username</label>
              <input type="text" name="username" required class="form-control">
            </div>
            <div class="mb-4">
              <label class="form-label">Password</label>
              <input type="password" name="password" required class="form-control">
            </div>
            <button type="submit" class="btn btn-primary w-full">Sign In</button>
          </form>
        </div>
        <div class="login-footer">
          <a href="/" class="link">Back to Home</a>
        </div>
      </div>
    </div>
  `;
}

module.exports = { loginTemplate };
