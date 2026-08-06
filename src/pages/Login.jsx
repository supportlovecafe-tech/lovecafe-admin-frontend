import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Film, Mail, Lock, LogIn, Eye, EyeOff, Wifi, Hash, ArrowLeft } from 'lucide-react';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const authInProgress = useRef(false);
  const [error, setError] = useState('');

  // PIN step state
  const [pinStep, setPinStep] = useState(false);
  const [matchedCinema, setMatchedCinema] = useState(null);
  const [pin, setPin] = useState('');

  // Email Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleEmailLogin = async (e) => {
    e?.preventDefault();
    if (authInProgress.current) return;
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    
    authInProgress.current = true;
    setLoading(true);
    setError('');
    
    try {
      // Ensure any old session is signed out cleanly
      await supabase.auth.signOut().catch(() => {});
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
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
        const { data: cinema } = await supabase
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
        
        throw new Error('This account is not authorized as an admin or outlet manager.');
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message || 'Authentication failed.');
      await supabase.auth.signOut().catch(() => {});
    } finally {
      setLoading(false);
      authInProgress.current = false;
    }
  };

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
              <img src="/app_icon.png" alt="Love Cafe" style={{ width: 64, height: 64, borderRadius: 18, boxShadow: '0 0 40px rgba(0,0,0,0.5)', objectFit: 'cover' }} />
              <div>
                <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, margin: 0 }}>Love Cafe</h1>
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
                <img src="/app_icon.png" alt="Love Cafe" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
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
            <img src="/app_icon.png" alt="Love Cafe" style={{ width: 64, height: 64, borderRadius: 18, boxShadow: '0 0 40px rgba(0,0,0,0.5)', objectFit: 'cover' }} />
            <div>
              <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, margin: 0 }}>Love Cafe</h1>
              <div style={{ fontSize: 12, color: 'var(--primary-glow)', letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase' }}>Admin Portal</div>
            </div>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 16, lineHeight: 1.3 }}>
            The future of<br />cafe dining.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Multi-tenant management for cafe operators — menus, real-time orders, and analytics in one powerful dashboard.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
            {['Real-time Orders', 'PIN Authentication', 'Multi-Outlet', 'Staff Access'].map(f => (
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
            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Welcome back! Access your cafe dashboard.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && (
              <div style={{ color: '#ff6b9d', background: 'rgba(255,47,146,0.08)', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,47,146,0.2)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    style={{ width: '100%', padding: '14px 16px 14px 44px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white', fontSize: 15, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{ width: '100%', padding: '14px 44px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white', fontSize: 15, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="hover-lift"
                style={{
                  width: '100%', padding: '14px', marginTop: 8, background: 'var(--primary-glow)',
                  border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s', boxSizing: 'border-box'
                }}
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <LogIn size={18} />
                  </>
                )}
              </button>
            </form>
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


