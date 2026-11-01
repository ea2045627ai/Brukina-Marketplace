import { useState } from 'react';
import {
  signInWithOAuth,
  signInWithOtp,
  signInWithPassword,
  signUpWithPassword,
  verifyPhoneOtp
} from '../auth.js';
import './AuthPanel.css';

const getErrorMessage = error => (
  error instanceof Error ? error.message : 'Authentication failed. Please try again.'
);

export default function AuthPanel({ onClose, prompt }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const runAuth = async action => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordSubmit = event => {
    event.preventDefault();
    return runAuth(async () => {
      if (isSignUp) {
        const { session } = await signUpWithPassword({ email, password, fullName });
        if (!session) setMessage('Check your email to confirm your account, then sign in.');
      } else {
        await signInWithPassword({ email, password });
      }
    });
  };

  const handleSendOtp = event => {
    event.preventDefault();
    return runAuth(async () => {
      await signInWithOtp(phone);
      setOtpSent(true);
      setMessage('A verification code was sent to your phone.');
    });
  };

  const handleVerifyOtp = event => {
    event.preventDefault();
    return runAuth(() => verifyPhoneOtp(phone, otp));
  };

  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" aria-modal="true" className="auth-card" role="dialog">
        {onClose && (
          <button className="auth-close" onClick={onClose} type="button">
            Back to marketplace
          </button>
        )}
        <p className="eyebrow">Brukina Marketplace</p>
        <h1 id="auth-title">Welcome to the market hub</h1>
        <p className="auth-intro">Sign in or create an account to check out.</p>

        {prompt && <p className="auth-message" role="status">{prompt}</p>}
        {errorMessage && <p className="auth-message error" role="alert">{errorMessage}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}

        <form className="auth-form" onSubmit={handlePasswordSubmit}>
          {isSignUp && (
            <label>
              Full name <span>(optional)</span>
              <input
                autoComplete="name"
                maxLength={120}
                onChange={event => setFullName(event.target.value)}
                value={fullName}
              />
            </label>
          )}
          <label>
            Email
            <input
              autoComplete="email"
              onChange={event => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={isSignUp ? 8 : undefined}
              onChange={event => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="auth-primary" disabled={busy} type="submit">
            {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in with email'}
          </button>
        </form>

        <button
          className="auth-text-button"
          disabled={busy}
          onClick={() => {
            setIsSignUp(current => !current);
            setMessage('');
            setErrorMessage('');
          }}
          type="button"
        >
          {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>

        <div aria-hidden="true" className="auth-divider"><span>or continue with</span></div>
        <div className="auth-provider-buttons">
          {['google', 'apple'].map(provider => (
            <button
              className="auth-secondary"
              disabled={busy}
              key={provider}
              onClick={() => runAuth(async () => {
                await signInWithOAuth(provider);
                setMessage(`Redirecting to ${provider === 'google' ? 'Google' : 'Apple'}…`);
              })}
              type="button"
            >
              {provider === 'google' ? 'Continue with Google' : 'Continue with Apple'}
            </button>
          ))}
        </div>

        <div className="auth-divider"><span>or use your phone</span></div>
        <form className="auth-form" onSubmit={otpSent ? handleVerifyOtp : handleSendOtp}>
          <label>
            Phone number
            <input
              autoComplete="tel"
              inputMode="tel"
              onChange={event => setPhone(event.target.value)}
              placeholder="+233XXXXXXXXX"
              required
              type="tel"
              value={phone}
            />
          </label>
          {otpSent && (
            <label>
              Verification code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                onChange={event => setOtp(event.target.value)}
                required
                value={otp}
              />
            </label>
          )}
          <button className="auth-secondary" disabled={busy} type="submit">
            {busy ? 'Please wait…' : otpSent ? 'Verify code' : 'Send SMS code'}
          </button>
          {otpSent && (
            <button
              className="auth-text-button"
              disabled={busy}
              onClick={() => {
                setOtpSent(false);
                setOtp('');
                setMessage('');
              }}
              type="button"
            >
              Use a different phone number
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
