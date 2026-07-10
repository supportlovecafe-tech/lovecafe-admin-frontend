import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTabRouting } from './lib/router'
import Login from './pages/Login'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import OutletManagerDashboard from './pages/OutletManagerDashboard'
import SalesDashboard from './pages/SalesDashboard'
import MenuManager from './pages/MenuManager'
import OutletPOS from './pages/OutletPOS'
import OutletsManager from './pages/OutletsManager'
import StaffManager from './pages/StaffManager'
import OrderHistory from './pages/OrderHistory'
import Layout from './components/Layout'
import ComboManager from './pages/ComboManager'
import SystemHealth from './pages/SystemHealth'
import OffersManager from './pages/OffersManager'
import KDSConfig from './pages/KDSConfig'
import InventoryManager from './pages/InventoryManager'
import './App.css'

function App() {
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for persisted session in localStorage and Supabase Auth (for OAuth)
  useEffect(() => {
    const saved = localStorage.getItem('ce_admin_profile')
    if (saved) {
      try {
        setUserProfile(JSON.parse(saved))
      } catch (_) {}
    }

    // Listen for Supabase OAuth login callbacks
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Fetch the profile for the authenticated Google user by EMAIL
        // since the Super Admin creates profiles by email before the user ever logs in via OAuth
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', session.user.email)
          .single();

        if (profile) {
          // Optional: Update the profile with the user's actual auth UUID if it's missing
          if (profile.id !== session.user.id) {
            await supabase.from('profiles').update({ id: session.user.id }).eq('email', session.user.email);
            profile.id = session.user.id;
          }

          const fullProfile = { ...profile, email: session.user.email };
          localStorage.setItem('ce_admin_profile', JSON.stringify(fullProfile));
          setUserProfile(fullProfile);
        } else {
          // Check if they are an Outlet Manager (in cinemas table)
          const { data: cinema } = await supabase
            .from('cinemas')
            .select('*')
            .eq('login_email', session.user.email)
            .single();
            
          if (!cinema) {
            // If no profile and no cinema exists, they are completely unauthorized
            supabase.auth.signOut();
          }
          // If cinema exists, we do NOT set userProfile yet.
          // Login.jsx will handle the PIN screen and call onLogin when verified.
        }
      }
    });

    setLoading(false)

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [])

  const handleLogin = (profile) => {
    localStorage.setItem('ce_admin_profile', JSON.stringify(profile))
    setUserProfile(profile)
  }

  const handleLogout = () => {
    localStorage.removeItem('ce_admin_profile')
    supabase.auth.signOut().catch(() => {})
    setUserProfile(null)
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: 14 }}>Loading CinemaEats...</p>
        </div>
      </div>
    )
  }

  if (!userProfile) {
    return <Login onLogin={handleLogin} />
  }

  return <AuthenticatedApp user={userProfile} onLogout={handleLogout} />
}

function AuthenticatedApp({ user, onLogout }) {
  // Set default tab based on role
  const defaultTab = user.role === 'SUPER_ADMIN' ? 'outlets' : 'dashboard'
  const currentTab = useTabRouting(defaultTab)

  return (
    <Layout user={user} onLogout={onLogout} currentTab={currentTab}>
      <TabRenderer role={user.role} user={user} currentTab={currentTab} />
    </Layout>
  )
}

function TabRenderer({ role, user, currentTab }) {
  if (role === 'SUPER_ADMIN') {
    switch (currentTab) {
      case 'dashboard':  return <SuperAdminDashboard user={user} />
      case 'outlets':    return <OutletsManager user={user} />
      case 'staff':      return <StaffManager user={user} />
      case 'health':     return <SystemHealth />
      default:           return <OutletsManager user={user} />
    }
  }

  if (role === 'OUTLET_MANAGER' || role === 'OUTLET_STAFF') {
    const p = user.permissions || ['orders', 'menu'];
    
    if (currentTab === 'dashboard' && p.includes('orders')) return <OutletManagerDashboard user={user} />;
    if (currentTab === 'outlet-pos' && p.includes('orders')) return <OutletPOS user={user} />;
    if (currentTab === 'sales' && p.includes('sales')) return <SalesDashboard user={user} />;
    if (currentTab === 'history' && p.includes('history')) return <OrderHistory user={user} />;
    if (currentTab === 'menu' && p.includes('menu')) return <MenuManager user={user} />;
    if (currentTab === 'combos' && p.includes('menu')) return <ComboManager user={user} />;
    if (currentTab === 'offers' && p.includes('menu')) return <OffersManager user={user} />;
    if (currentTab === 'inventory' && p.includes('menu')) return <InventoryManager user={user} />;
    if (currentTab === 'kds-config' && p.includes('menu')) return <KDSConfig user={user} />;
    if (currentTab === 'health') return <SystemHealth />;

    // Fallbacks
    if (p.includes('orders')) return <OutletManagerDashboard user={user} />;
    if (p.includes('sales')) return <SalesDashboard user={user} />;
    if (p.includes('history')) return <OrderHistory user={user} />;
    if (p.includes('menu')) return <MenuManager user={user} />;
    
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-glow)' }}>No Modules Assigned</h2>
        <p style={{ color: 'var(--text-muted)' }}>Your account has no active module permissions. Please contact your Super Admin.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ color: 'var(--primary-glow)' }}>Access Denied</h2>
      <p style={{ color: 'var(--text-muted)' }}>Your role ({role}) does not have access to this portal.</p>
    </div>
  )
}

export default App
