/**
 * Verifies that registration inputs meet basic marketplace safety guidelines
 */
export function validateSignupForm({ fullName, email, password }) {
  const errors = {};

  if (!fullName || fullName.trim().length < 2) {
    errors.fullName = "Please enter your real full name.";
  }

  if (!email || !email.includes('@') || !email.includes('.')) {
    errors.email = "Please enter a valid email address.";
  }

  if (!password || password.length < 6) {
    errors.password = "Your password must contain at least 6 characters.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Handles database authentication lookup using Supabase client instances
 */
export async function executeDatabaseLogin(supabaseInstance, email, password) {
  if (!supabaseInstance) {
    return { success: false, error: "Database engine initialization failed." };
  }

  try {
    const { data, error } = await supabaseInstance.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) throw error;

    return {
      success: true,
      user: data.user,
      role: data.user.user_metadata?.role || 'customer'
    };
  } catch (errorInstance) {
    return {
      success: false,
      error: errorInstance.message || "Invalid email or password credential."
    };
  }
}