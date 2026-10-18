import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import type { User } from '../types';

const REDUCE_MOTION_KEY = 'audit-trail-reduce-motion';

const readMotionPreference = (): boolean => {
  try {
    const storedPreference = window.localStorage.getItem(REDUCE_MOTION_KEY);
    if (storedPreference !== null) return storedPreference === 'true';
  } catch {
    // Fall back to the system preference when browser storage is unavailable.
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const hasSavedMotionPreference = (): boolean => {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_KEY) !== null;
  } catch {
    return false;
  }
};

function Settings({ user }: { user: User | null }) {
  const [reduceMotion, setReduceMotion] = useState(readMotionPreference);
  const [hasMotionOverride, setHasMotionOverride] = useState(hasSavedMotionPreference);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (hasMotionOverride) {
      root.dataset.reduceMotion = String(reduceMotion);
      return;
    }

    delete root.dataset.reduceMotion;
    const handleSystemPreferenceChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    systemPreference.addEventListener('change', handleSystemPreferenceChange);
    return () => systemPreference.removeEventListener('change', handleSystemPreferenceChange);
  }, [hasMotionOverride, reduceMotion]);

  const handleMotionChange = (enabled: boolean) => {
    setReduceMotion(enabled);
    setHasMotionOverride(true);
    document.documentElement.dataset.reduceMotion = String(enabled);
    try {
      window.localStorage.setItem(REDUCE_MOTION_KEY, String(enabled));
      setStorageNotice(null);
    } catch {
      setStorageNotice('This preference will apply for this session, but browser storage is unavailable.');
    }
  };

  return (
    <section className="page-panel settings-page">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Review your account details and choose an interface preference."
      />

      <div className="settings-grid">
        <article className="panel-card">
          <div className="panel-card__header">
            <div><p className="eyebrow">Account</p><h3>Profile information</h3></div>
          </div>
          <dl className="settings-profile">
            <div><dt>Name</dt><dd>{user?.name ?? 'Unavailable'}</dd></div>
            <div><dt>Email</dt><dd>{user?.email ?? 'Unavailable'}</dd></div>
            <div><dt>Role</dt><dd><span className="page-tag">{user?.role ?? 'Unavailable'}</span></dd></div>
          </dl>
          <p className="settings-help">Profile details are managed through your account administration.</p>
        </article>

        <article className="panel-card">
          <div className="panel-card__header">
            <div><p className="eyebrow">Accessibility</p><h3>Motion preference</h3></div>
          </div>
          <label className="settings-toggle">
            <span><strong>Reduce motion</strong><small>Limit nonessential transitions and animations throughout the workspace.</small></span>
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(event) => handleMotionChange(event.target.checked)}
              aria-label="Reduce nonessential motion"
            />
          </label>
          <p className="settings-help">Saved in this browser. When no preference is saved, the system accessibility setting is used.</p>
          {storageNotice ? <p className="settings-notice" role="status">{storageNotice}</p> : null}
        </article>
      </div>
    </section>
  );
}

export default Settings;
