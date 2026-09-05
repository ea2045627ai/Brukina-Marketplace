export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone) {
  const cleaned = phone.replace(/[\s-]/g, '');
  return /^(\+?233|0)\d{9}$/.test(cleaned);
}

export function validatePrice(price) {
  const parsed = parseFloat(price);
  return !isNaN(parsed) && parsed > 0;
}

export function validateStock(count) {
  const parsed = parseInt(count, 10);
  return !isNaN(parsed) && parsed >= 0;
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 500);
}
