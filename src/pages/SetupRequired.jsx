import {  useState, useEffect } from 'react';

export default function SetupRequired() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-container-lowest)' }}>
      <div className="glass-panel" style={{ maxWidth: '600px', padding: '48px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', background: 'rgba(255, 179, 106, 0.1)', color: 'var(--secondary-orange)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>
            ⚠️
        </div>
        <h1 style={{ marginBottom: '16px', fontSize: '28px' }}>Database Setup Required</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
          The PIN login failed because your Supabase Database is currently empty. You must create the Super Admin profile and the initial Outlet data to sync properly.
        </p>
        
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px', textAlign: 'left', marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '12px', color: 'white' }}>1. Open Supabase Dashboard</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>Go to your project's SQL Editor.</p>

            <h3 style={{ marginBottom: '12px', color: 'white' }}>2. Run the Setup Script</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Copy the contents of <code>admin_setup.sql</code> located in your Love Cafe folder, paste it into Supabase, and click RUN.
            </p>
        </div>

        <button className="btn-primary" onClick={() => window.location.reload()} style={{ width: '100%' }}>
            I HAVE RUN THE SCRIPT - RELOAD
        </button>
      </div>
    </div>
  );
}
