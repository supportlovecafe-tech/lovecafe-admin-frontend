import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Film, Mail, Lock, LogIn, Eye, EyeOff, Wifi, Hash, ArrowLeft } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const authInProgress = useRef(false);
  const [error, setError] = useState('');

  // PIN step state
  const [pinStep, setPinStep] = useState(false);
  const [matchedCinema, setMatchedCinema] = useState(null);
  const [pin, setPin] = useState('');

  const handlePinSubmit = async (e) => {
    e?.preventDefault();
    if (!pin || pin.length < 4) {
      setError('Please enter your 4-digit PIN.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Find the staff member using the secure RPC (bypasses RLS safely)
      const { data: staffList, error: staffErr } = await supabase
        .rpc('verify_staff_pin', {
          p_cinema_id: matchedCinema.id,
          p_pin: pin.trim()
        });
 
      if (staffErr) {
        console.error('PIN RPC Error:', staffErr);
        throw new Error(`Connection Error: ${staffErr.message || 'Check Supabase config.'}`);
      }
 
      if (!staffList || staffList.length === 0) {
        throw new Error('Invalid PIN. Please try again.');
      }

      const staff = staffList[0];
      onLogin({
        ...staff,
        cinema_name: matchedCinema.name,
      });

    } catch (err) {
      setError(err.message || 'PIN verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setPinStep(false);
    setMatchedCinema(null);
    setPin('');
    setError('');
  };

  // ======== PIN ENTRY SCREEN ========
  if (pinStep && matchedCinema) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-dark)' }}>
        
        {/* Left: Brand panel */}
        <div style={{ flex: 1.2, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
          <img
            src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=2070"
            alt="Cinema"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.45) saturate(1.2)' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,47,146,0.15) 0%, transparent 50%), linear-gradient(to right, transparent 60%, var(--bg-dark) 100%)' }} />
          
          <div style={{ position: 'relative', padding: '0 10% 10%', maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
              <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,var(--primary-glow),#ff6b6b)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255,47,146,0.5)' }}>
                <Film size={32} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, margin: 0 }}>CinemaEats</h1>
                <div style={{ fontSize: 12, color: 'var(--primary-glow)', letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase' }}>Admin Portal</div>
              </div>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 16, lineHeight: 1.3 }}>
              Staff<br />Authentication.
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              Enter your personal PIN to access your assigned modules at this outlet.
            </p>
          </div>
        </div>

        {/* Right: PIN Entry */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 8%', background: 'var(--bg-dark)' }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <button onClick={handleBackToLogin} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 32, fontSize: 13, fontWeight: 600 }}>
              <ArrowLeft size={16} /> Back to Login
            </button>

            <div style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 48, height: 48, background: 'rgba(255,47,146,0.1)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Film size={24} color="var(--primary-glow)" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>{matchedCinema.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{matchedCinema.location}</div>
                </div>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, letterSpacing: -1 }}>Enter Your PIN</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Type your personal staff PIN to continue.</p>
            </div>

            <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ position: 'relative' }}>
                <Hash size={18} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />
                <input
                  type="password"
                  className="input-premium"
                  style={{ paddingLeft: 50, textAlign: 'center', fontSize: 28, letterSpacing: 12, fontFamily: 'monospace', fontWeight: 900 }}
                  placeholder="••••"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div style={{ color: '#ff6b9d', background: 'rgba(255,47,146,0.08)', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,47,146,0.2)' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-lucrative" style={{ padding: '18px', fontSize: 15, letterSpacing: 1 }} disabled={loading}>
                {loading ? 'VERIFYING...' : <><LogIn size={18} /> ENTER DASHBOARD</>}
              </button>
            </form>

            <div style={{ marginTop: 48, padding: 20, borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 12, letterSpacing: 1.5 }}>
                How It Works
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, margin: 0 }}>
                Each staff member has a unique PIN assigned by the Super Admin. Your PIN determines what modules you can access (Orders, Menu, Settings).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ======== MAIN LOGIN SCREEN ========
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-dark)' }}>
      
      {/* Left: Cinematic brand panel */}
      <div style={{ flex: 1.2, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
        <img
          src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=2070"
          alt="Cinema"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.45) saturate(1.2)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,47,146,0.15) 0%, transparent 50%), linear-gradient(to right, transparent 60%, var(--bg-dark) 100%)' }} />
        
        <div style={{ position: 'relative', padding: '0 10% 10%', maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,var(--primary-glow),#ff6b6b)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255,47,146,0.5)' }}>
              <Film size={32} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, margin: 0 }}>CinemaEats</h1>
              <div style={{ fontSize: 12, color: 'var(--primary-glow)', letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase' }}>Admin Portal</div>
            </div>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 16, lineHeight: 1.3 }}>
            The future of<br />cinema dining.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Multi-tenant management for cinema operators — menus, real-time orders, and analytics in one powerful dashboard.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
            {['Real-time Orders', 'PIN Authentication', 'Multi-Cinema', 'Staff Access'].map(f => (
              <div key={f} style={{ padding: '6px 14px', background: 'rgba(255,47,146,0.12)', border: '1px solid rgba(255,47,146,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 700, color: 'var(--primary-glow)' }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 8%', background: 'var(--bg-dark)' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 10, letterSpacing: -1 }}>Staff Entry</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Welcome back! Access your cinema dashboard.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && (
              <div style={{ color: '#ff6b9d', background: 'rgba(255,47,146,0.08)', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,47,146,0.2)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (authInProgress.current) return;
                  authInProgress.current = true;
                  setLoading(true);
                  setError('');
                  try {
                    // Clear any existing stale session or lock first
                    for (let key in localStorage) {
                      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                        localStorage.removeItem(key);
                      }
                    }
                    await supabase.auth.signOut().catch(() => {});
                    
                    const { data, error } = await supabase.auth.signInWithIdToken({
                      provider: 'google',
                      token: credentialResponse.credential,
                    });
                    if (error) throw error;
                    
                    if (data?.user) {
                      // 1. Check if Super Admin
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('email', data.user.email)
                        .single();
                        
                      if (profile) {
                        onLogin({ ...profile, email: data.user.email });
                        return;
                      }
                      
                      // 2. Check if Outlet Manager
                      const { data: cinema, error: cinemaErr } = await supabase
                        .from('cinemas')
                        .select('*')
                        .eq('login_email', data.user.email.toLowerCase())
                        .single();
                        
                      if (cinema) {
                        setMatchedCinema(cinema);
                        setPinStep(true);
                        setLoading(false);
                        authInProgress.current = false;
                        return;
                      }
                      
                      // 3. Unauthorized
                      setError('Access Denied: Your email is not authorized.');
                      await supabase.auth.signOut();
                    }
                  } catch (err) {
                    setError(err.message || 'Google Login failed.');
                  } finally {
                    setLoading(false);
                    authInProgress.current = false;
                  }
                }}
                onError={() => {
                  setError('Google Login Failed');
                }}
                prompt="select_account"
                shape="rectangular"
                theme="filled_black"
                text="continue_with"
                size="large"
                width="300"
              />
            </div>
            
            {loading && (
               <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>
                 Authenticating...
               </div>
            )}
          </div>


        </div>
      </div>
      {/* Debug Info - Remove in Production */}
      <div className="absolute bottom-4 left-4 text-[10px] text-white/10 select-none">
        URL: {import.meta.env.VITE_SUPABASE_URL ? 'Connected' : 'Missing'} | 
        Key: {import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing'} |
        v1.0.4
      </div>
    </div>
  );
}


