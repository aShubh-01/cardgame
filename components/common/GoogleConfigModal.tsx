'use client';

import React from 'react';

interface GoogleConfigModalProps {
  onClose: () => void;
}

export default function GoogleConfigModal({ onClose }: GoogleConfigModalProps) {
  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="config-guide-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>🔑 Google OAuth Credentials Needed</h2>
          <button className="sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, margin: '0 0 12px' }}>
          To enable <b>Sign in with Google</b>, add your Google Cloud credentials to <code>.env.local</code>:
        </p>
        <ol style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
          <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Google Cloud Console &gt; Credentials</a>.</li>
          <li>Create an <b>OAuth 2.0 Client ID</b> (Web Application).</li>
          <li>Add <code>http://localhost:3000/api/auth/callback/google</code> to <b>Authorized redirect URIs</b>.</li>
          <li>Add the following keys to your <code>.env.local</code> file:
            <pre style={{ background: '#0a0a0a', padding: 8, borderRadius: 6, margin: '8px 0', fontSize: 12, overflowX: 'auto' }}>
{`GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here`}
            </pre>
          </li>
          <li>Restart your development server (<code>npm run dev</code>).</li>
        </ol>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="pri grow" onClick={onClose} style={{ width: '100%' }}>Got it!</button>
        </div>
      </div>
    </div>
  );
}

