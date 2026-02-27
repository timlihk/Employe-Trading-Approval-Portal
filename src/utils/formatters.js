/**
 * Utility functions for formatting data
 */

/**
 * Format UUID for display - shows first 8 characters
 * @param {string} uuid - Full UUID string
 * @returns {string} Formatted UUID for display
 */
function formatUuid(uuid) {
  if (!uuid) return 'N/A';
  uuid = String(uuid);

  // If it's a full UUID, show first 8 chars
  if (uuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return uuid.substring(0, 8).toUpperCase();
  }
  
  // If it's a legacy numeric ID, show it with # prefix
  if (/^\d+$/.test(uuid)) {
    return `#${uuid}`;
  }
  
  // Otherwise return as-is
  return uuid;
}

/**
 * Get display ID for a trading request
 * Always uses UUID as primary identifier
 * @param {object} request - Trading request object
 * @returns {string} Display ID
 */
function getDisplayId(request) {
  // UUID is now the primary identifier
  return formatUuid(request.uuid || request.id);
}

module.exports = {
  formatUuid,
  getDisplayId
};