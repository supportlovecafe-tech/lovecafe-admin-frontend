import {  useState, useEffect } from 'react'
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
import AddonManager from './pages/AddonManager'
import StaffBonusDashboard from './pages/StaffBonusDashboard'
import './App.css'

function App() {
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for persisted session in localStorage and verify outlet active status
  useEffect(() => {
    const checkSession = async () => {
      const saved = localStorage.getItem('ce_admin_profile')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed && parsed.role !== 'SUPER_ADMIN' && parsed.cinema_id) {
            const { data: cinema } = await supabase
              .from('cinemas')
              .select('id, name, is_active, status')
              .eq('id', parsed.cinema_id)
              .maybeSingle()

            if (cinema && (cinema.is_active === false || cinema.status === 'INACTIVE')) {
              localStorage.removeItem('ce_admin_profile')
              await supabase.auth.signOut().catch(() => {})
              setUserProfile(null)
              alert(`Notice: ${cinema.name || 'This outlet'} is currently in Service Mode. Access is disabled.`)
              setLoading(false)
              return
            }
          }
          setUserProfile(parsed)
        } catch (_) {}
      }
      setLoading(false)
    }

    checkSession()
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

  // Realtime subscription: if active outlet is deactivated by Super Admin, log out immediately
  useEffect(() => {
    if (!userProfile || userProfile.role === 'SUPER_ADMIN' || !userProfile.cinema_id) return

    const channel = supabase
      .channel(`cinema_active_guard_${userProfile.cinema_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cinemas',
          filter: `id=eq.${userProfile.cinema_id}`
        },
        (payload) => {
          const updated = payload.new
          if (updated && (updated.is_active === false || updated.status === 'INACTIVE')) {
            alert(`Notice: Outlet (${updated.name || 'Current Outlet'}) has been switched to Service Mode. You have been logged out.`)
            handleLogout()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userProfile?.cinema_id, userProfile?.role])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: 14 }}>Loading Love Cafe...</p>
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
      case 'dashboard':      return <SuperAdminDashboard user={user} />
      case 'outlets':        return <OutletsManager user={user} />
      case 'staff':          return <StaffManager user={user} />
      case 'staff-bonuses':  return <StaffBonusDashboard user={user} />
      case 'health':         return <SystemHealth />
      default:               return <OutletsManager user={user} />
    }
  }

  if (role === 'OUTLET_MANAGER' || role === 'OUTLET_STAFF' || role === 'OUTLET_CHEF') {
    const p = user.permissions || ['orders', 'menu', 'outlet-pos', 'history', 'sales', 'combos', 'offers', 'inventory', 'kds-config'];
    
    if (currentTab === 'dashboard' && (p.includes('orders') || p.includes('outlet-pos'))) return <OutletManagerDashboard user={user} />;
    if (currentTab === 'live-orders' && (p.includes('orders') || p.includes('outlet-pos'))) return <OutletManagerDashboard user={user} />;
    if (currentTab === 'outlet-pos' && (p.includes('orders') || p.includes('outlet-pos'))) return <OutletPOS user={user} />;
    if (currentTab === 'sales' && p.includes('sales')) return <SalesDashboard user={user} />;
    if (currentTab === 'history' && (p.includes('history') || p.includes('orders'))) return <OrderHistory user={user} />;
    if (currentTab === 'menu' && p.includes('menu')) return <MenuManager user={user} />;
    if (currentTab === 'combos' && (p.includes('combos') || p.includes('menu'))) return <ComboManager user={user} />;
    if (currentTab === 'offers' && (p.includes('offers') || p.includes('menu'))) return <OffersManager user={user} />;
    if (currentTab === 'inventory' && (p.includes('inventory') || p.includes('menu'))) return <InventoryManager user={user} />;
    if (currentTab === 'kds-config' && (p.includes('kds-config') || p.includes('menu'))) return <KDSConfig user={user} />;
    if (currentTab === 'addons' && (p.includes('addons') || p.includes('menu'))) return <AddonManager user={user} />;
    if (currentTab === 'health') return <SystemHealth />;

    // Fallbacks
    if (p.includes('orders') || p.includes('outlet-pos')) return <OutletManagerDashboard user={user} />;
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
