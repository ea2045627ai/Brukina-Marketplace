const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const symbolPattern = /[!@#$%^&*(),.?":{}|<>_]/;

export function validateSignupForm({ fullName = '', email = '', password = '' }) {
  const errors = {};
  const normalizedName = fullName.trim();
  const normalizedEmail = email.trim();

  if(!normalizedName) errors.fullName = 'Please enter your full name.';
  else if(normalizedName.split(/\s+/).length < 2) errors.fullName = 'Please provide both your first name and last name.';
  if(!normalizedEmail) errors.email = 'An email address is required.';
  else if(!emailPattern.test(normalizedEmail)) errors.email = 'Please enter a valid email address.';
  if(!password) errors.password = 'Password field cannot be blank.';
  else if(password.length < 8) errors.password = 'Password must be at least 8 characters long.';
  else if(!/\d/.test(password)) errors.password = 'Password must include at least one number.';
  else if(!symbolPattern.test(password)) errors.password = 'Password must include at least one special character.';

  return { isValid: Object.keys(errors).length === 0, errors };
}