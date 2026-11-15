/**
 * Builds and applies an all-column search filter to a Supabase orders query.
 * Searches across:
 * - Order Info: display_id, location, customer_phone, metadata screen_name & seat_number, order ID
 * - Staff / Employee Info: metadata staff_name (e.g. Q953035896), staff_code, staff_email,
 *   delivered_by_name, delivered_by_code
 * - Items & Products: items JSONB full-text search (plfts for full phrase/words, fts for prefix)
 * - Payment & Amount: payment_method, total_amount
 * - Status: status (PENDING, PREPARING, READY, DELIVERED, CANCELLED)
 *
 * @param {any} query - The active Supabase Postgrest query builder
 * @param {string} searchTerm - The user-entered search term
 * @returns {any} The query with the search filter applied
 */
export function applyOrderSearch(query, searchTerm) {
  if (!query || !searchTerm || typeof searchTerm !== 'string' || !searchTerm.trim()) {
    return query;
  }

  // Clean characters that interfere with PostgREST or(...) delimiter syntax
  const cleanTerm = searchTerm.replace(/[(),]/g, ' ').trim();
  if (!cleanTerm) return query;

  // Build orConditions covering every column in the orders table and UI
  const orConditions = [
    `display_id.ilike.%${cleanTerm}%`,
    `location.ilike.%${cleanTerm}%`,
    `customer_phone.ilike.%${cleanTerm}%`,
    `payment_method.ilike.%${cleanTerm}%`,
    `status.ilike.%${cleanTerm}%`,
    `metadata->>staff_name.ilike.%${cleanTerm}%`,
    `metadata->>staff_code.ilike.%${cleanTerm}%`,
    `metadata->>staff_email.ilike.%${cleanTerm}%`,
    `metadata->>delivered_by_name.ilike.%${cleanTerm}%`,
    `metadata->>delivered_by_code.ilike.%${cleanTerm}%`,
    `metadata->>screen_name.ilike.%${cleanTerm}%`,
    `metadata->>seat_number.ilike.%${cleanTerm}%`,
    `items.plfts.${cleanTerm}`
  ];

  // Add prefix search for single alphanumeric word (e.g. "pop" -> "Popcorn", "peri" -> "Peri Peri Popcorn")
  if (/^[a-zA-Z0-9]+$/.test(cleanTerm)) {
    orConditions.push(`items.fts.${cleanTerm}:*`);
  }

  // Exact UUID matching for order id or staff_id if valid UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTerm);
  if (isUuid) {
    orConditions.push(`id.eq.${cleanTerm}`);
    orConditions.push(`staff_id.eq.${cleanTerm}`);
    orConditions.push(`delivered_by.eq.${cleanTerm}`);
  }

  // Total amount numeric match if cleanTerm is a valid positive number
  if (!isNaN(Number(cleanTerm)) && Number(cleanTerm) > 0) {
    orConditions.push(`total_amount.eq.${Number(cleanTerm)}`);
  }

  return query.or(orConditions.join(','));
}
