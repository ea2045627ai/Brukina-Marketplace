const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const symbolPattern = /[!@#$%^&*(),.?":{}|<>_]/;

export function validateLogin(email, password) {
  return Boolean(email?.trim() && password && emailPattern.test(email.trim()) && password.length >= 6);
}

export async function executeDatabaseLogin(clientOrEmail, emailOrPassword, passwordArgument) {
  const usesConfiguredClient = typeof clientOrEmail !== 'string';
  const supabase = usesConfiguredClient ? clientOrEmail : globalThis.brukinaSupabase;
  const email = usesConfiguredClient ? emailOrPassword : clientOrEmail;
  const password = usesConfiguredClient ? passwordArgument : emailOrPassword;
  if(!validateLogin(email, password)) return { success:false, error:'Enter a valid email address and password.' };
  if(!supabase) return { success:false, error:'Authentication service is not available.' };
  try {
    const {data, error} = await supabase.auth.signInWithPassword({email:email.trim(), password});
    if(error) throw error;
    const role = data.user?.app_metadata?.role || data.user?.user_metadata?.role || 'customer';
    return { success:true, role, user:data.user, session:data.session };
  } catch(error) {
    return { success:false, error:error.message || 'Unable to sign in.' };
  }
}

export function validateSignupForm(input, emailArgument = '', passwordArgument = '') {
  const positional = typeof input === 'string';
  const fullName = positional ? input : input?.fullName || '';
  const email = positional ? emailArgument : input?.email || '';
  const password = positional ? passwordArgument : input?.password || '';
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

  return positional
    ? { isValid: Object.keys(errors).length === 0, error: Object.values(errors)[0] || '', errors }
    : { isValid: Object.keys(errors).length === 0, errors };
}