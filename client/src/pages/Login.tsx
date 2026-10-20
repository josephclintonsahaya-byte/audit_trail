import { useNavigate } from 'react-router-dom';
import AuthPanel from '../components/AuthPanel';

type LoginProps = {
  onLogin: (email: string, password: string) => Promise<void>;
};

function Login({ onLogin }: LoginProps) {
  const navigate = useNavigate();

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Logistics Audit sign in">
        <div className="login-card__brand" aria-labelledby="login-brand-title">
          <svg className="login-network" viewBox="0 0 640 440" fill="none" aria-hidden="true">
            <circle cx="176" cy="176" r="164" />
            <ellipse cx="176" cy="176" rx="76" ry="164" />
            <ellipse cx="176" cy="176" rx="142" ry="164" />
            <path d="M17 176h318M34 111c88 38 197 38 284 0M34 241c88-38 197-38 284 0" />
            <path d="m25 203 88-72 91 25 72-84 68 29 47-53m-366 260 84-87 91 30 77-91 69 36 62-55" />
            <path d="m113 131 90 25 73-84m-163 0 80 104 121 54m-153 76 5-104 77-91 96 9" />
            <g>
              <circle cx="25" cy="203" r="6" /><circle cx="113" cy="131" r="5" />
              <circle cx="204" cy="156" r="7" /><circle cx="276" cy="72" r="5" />
              <circle cx="344" cy="101" r="5" /><circle cx="391" cy="48" r="6" />
              <circle cx="39" cy="361" r="5" /><circle cx="123" cy="274" r="6" />
              <circle cx="214" cy="304" r="5" /><circle cx="291" cy="213" r="7" />
              <circle cx="360" cy="249" r="5" /><circle cx="422" cy="194" r="5" />
            </g>
          </svg>
          <div className="login-card__brand-copy">
            <h1 id="login-brand-title">
              LOGISTICS AUDIT &amp;<br />
              SHIPMENT FORENSICS<br />
              PLATFORM
            </h1>
            <p>Enterprise Logistics Intelligence</p>
          </div>
        </div>

        <div className="login-card__form-panel">
          <header className="login-card__header">
            <h2>Enterprise Sign-In</h2>
            <p>New here? Contact an administrator</p>
          </header>
          <AuthPanel
            onLogin={onLogin}
            onSuccess={() => navigate('/', { replace: true })}
          />
        </div>
      </section>
    </main>
  );
}

export default Login;
