/**
 * Hardened Universal Email Validation Regex (RFC 5322 Compliant baseline)
 */
export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\$/.test(email.trim());
}

/**
 * FIXED: Secure Ghanaian Mobile Money & Cellular Validation Engine
 * Validates local dial strings (0XX XXXXXXX) and international format configurations (+233 XX XXXXXXX)
 */
export function validatePhone(phone) {
  if (typeof phone !== 'string') return false;
  
  // Strip white spaces, hyphens, and structural brackets safely
  const cleaned = phone.replace(/[\s\-()]/g, '');
  
  // Validates: Local 10-digit (e.g. 0244123456) OR International 12-digit without leading 0 (e.g. +233244123456)
  return /^(?:0|\+233)[235][0-9]{8}\$/.test(cleaned);
}

/**
 * FIXED: Tightened numeric boundaries to block trailing string contamination
 */
export function validatePrice(price) {
  // If passed as an absolute number, handle boundaries directly
  if (typeof price === 'number') return !isNaN(price) && price > 0;
  if (typeof price !== 'string') return false;
  
  // Ensure the string contains ONLY numbers and a single optional decimal dot
  if (!/^\d+(?:\.\d{1,2})?\$/.test(price.trim())) return false;
  
  const parsed = parseFloat(price);
  return !isNaN(parsed) && parsed > 0;
}

/**
 * FIXED: Enforces integer constraints to block float numbers from stock fields
 */
export function validateStock(count) {
  if (typeof count === 'number') return Number.isInteger(count) && count >= 0;
  if (typeof count !== 'string') return false;
  
  // Enforce digits only (blocks decimal points like "5.5" units)
  if (!/^\d+\$/.test(count.trim())) return false;
  
  const parsed = parseInt(count, 10);
  return !isNaN(parsed) && parsed >= 0;
}

/**
 * Basic authentication criteria check
 */
export function validatePassword(password) {
  return typeof password === 'string' && password.trim().length >= 6;
}

/**
 * FIXED: Hardened Sanitizer targeting Cross-Site Scripting (XSS) vectors
 * Escapes characters to ensure string variables can safely output across React components
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  
  const trimmed = str.trim().slice(0, 500);
  
  // Map and replace structural HTML characters with safe browser entities
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;'
  };
  
  return trimmed.replace(/[&<>"'`\/]/g, (char) => entityMap[char]);
}
