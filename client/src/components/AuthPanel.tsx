import { useState } from 'react';
import type { FormEvent } from 'react';

type AuthPanelProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onSuccess: () => void;
};

function AuthPanel({ onLogin, onSuccess }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);

    try {
      await onLogin(email, password);
      setEmail('');
      setPassword('');
      onSuccess();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to sign in.';
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="auth-panel auth-panel--login" onSubmit={handleSubmit}>
      <label className="auth-field">
        <span className="auth-field__label">Corporate Email</span>
        <span className="auth-field__control">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.5 20c.5-3.4 2.7-5.2 6.5-5.2s6 1.8 6.5 5.2" />
          </svg>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </span>
      </label>
      <label className="auth-field">
        <span className="auth-field__label">Password</span>
        <span className="auth-field__control">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5.5" y="10" width="13" height="10" rx="1.8" />
            <path d="M8.5 10V7.2a3.5 3.5 0 0 1 7 0V10m-3.5 4v2" />
          </svg>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </span>
      </label>
      <button type="submit" className="button button--primary" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
      {error ? <small className="auth-error" role="alert">{error}</small> : null}
    </form>
  );
}

export default AuthPanel;
