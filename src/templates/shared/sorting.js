// Shared sorting UI helpers extracted from AdminController

function generateSortableHeader(sortBy, displayName, baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;

  const isCurrentSort = currentSortBy === sortBy;
  const nextOrder = isCurrentSort && currentSortOrder === 'ASC' ? 'DESC' : 'ASC';

  const sortIcon = isCurrentSort
    ? (currentSortOrder === 'ASC' ? ' ↑' : ' ↓')
    : '';

  const paramString = new URLSearchParams({
    ...cleanParams,
    sort_by: sortBy,
    sort_order: nextOrder
  }).toString();

  return `
    <th>
      <a href="${baseUrl}?${paramString}"
         class="th-link"
         onmouseover="this.style.color='#0066cc'"
         onmouseout="this.style.color='inherit'">
        ${displayName}${sortIcon}
      </a>
    </th>
  `;
}

function generateRestrictedStocksSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;

  return `
    <div class="sort-controls-sm">
      <span class="text-gray-600 font-weight-600">Sort by:</span>
      <form method="get" action="${baseUrl}" class="sort-controls-sm">
        ${Object.entries(cleanParams).map(([key, value]) =>
          `<input type="hidden" name="${key}" value="${value || ''}">`
        ).join('')}

        <select name="sort_by" class="form-control-xs">
          <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
          <option value="company_name" ${currentSortBy === 'company_name' ? 'selected' : ''}>Company Name</option>
          <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date Added</option>
        </select>
        <select name="sort_order" class="form-control-xs">
          <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
          <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        </select>
        <button type="submit" class="btn btn-primary btn-xs">
          Apply Sort
        </button>
      </form>
    </div>
  `;
}

function generateSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;

  return `
    <form method="get" action="${baseUrl}" class="sort-controls">
      ${Object.entries(cleanParams).map(([key, value]) =>
        `<input type="hidden" name="${key}" value="${value || ''}">`
      ).join('')}

      <span class="font-weight-600 text-gray-600">Sort by:</span>
      <select name="sort_by" class="form-control-xs">
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
        <option value="employee_email" ${currentSortBy === 'employee_email' ? 'selected' : ''}>Employee</option>
      </select>
      <select name="sort_order" class="form-control-xs">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
      <button type="submit" class="btn btn-primary btn-xs">
        Apply Sort
      </button>
    </form>
  `;
}

module.exports = { generateSortableHeader, generateRestrictedStocksSortingControls, generateSortingControls };
