import React, { useState } from 'react';
import { navigate } from '../lib/router';
import { LogOut, Home, Users, PieChart, Film, Coffee, Settings, Bell, KeyRound, History, Menu, X, Store, Package, Activity, Percent, Monitor, Archive } from 'lucide-react';

export default function Layout({ user, onLogout, currentTab, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  
  if (!user) return children;

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar Toggle Button */}
      <button className="sidebar-toggle-btn" onClick={toggleSidebar}>
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', 
            backdropFilter: 'blur(4px)', zIndex: 900
          }} 
        />
      )}

      {/* Premium Floating Sidebar */}
      <aside className={`glass-card floating-sidebar ${sidebarOpen ? 'active' : ''}`} style={{ 
        width: 'var(--sidebar-width)', height: 'calc(100vh - 40px)', margin: '20px 0 20px 20px',
        padding: '32px 20px', display: 'flex', flexDirection: 'column', position: 'fixed',
        top: 0, zIndex: 1000, borderRadius: 28
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40, padding: '0 8px' }}>
          <img src="/app_icon.png" alt="Love Cafe" style={{ width: 48, height: 48, borderRadius: 14, boxShadow: '0 8px 16px rgba(0,0,0,0.3)', flexShrink: 0, objectFit: 'cover' }} />
          <div>
            <h2 style={{ fontSize: 20, margin: 0, fontWeight: 900, letterSpacing: -1 }}>Love Cafe</h2>
            <div style={{ fontSize: 10, color: 'var(--primary-glow)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 800, marginTop: 2 }}>
              {(user.role || '').replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-scroll" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 2, overflowY: 'auto', paddingRight: '4px', marginBottom: '12px' }}>
          {user.role === 'SUPER_ADMIN' ? (
            <>
              <SectionLabel>Global Management</SectionLabel>
              <NavItem icon={<Film size={20} />}   label="Outlets"       tabId="outlets"    currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Activity size={20} />} label="System Health" tabId="health"      currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<KeyRound size={20} />}   label="Credentials"   tabId="staff"      currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Settings size={20} />}   label="Platform Fees" tabId="dashboard"  currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              
              <SectionLabel style={{ marginTop: 16 }}>Live Operations</SectionLabel>
              <NavItem icon={<Monitor size={20} />} label="Live Orders (KDS)" tabId="live-orders" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Store size={20} />} label="Outlet POS" tabId="outlet-pos" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<History size={20} />} label="Order History" tabId="history" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              
              <SectionLabel style={{ marginTop: 16 }}>Outlet Management</SectionLabel>
              <NavItem icon={<PieChart size={20} />} label="Sales Analytics" tabId="sales" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Coffee size={20} />}  label="Menu Editor"  tabId="menu"       currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Package size={20} />} label="Combo Deals"  tabId="combos"     currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Percent size={20} />} label="Promos & Offers" tabId="offers"  currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Archive size={20} />} label="Inventory Stock" tabId="inventory" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              <NavItem icon={<Monitor size={20} />} label="KDS Routing" tabId="kds-config" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
            </>
          ) : (
            <>
              <SectionLabel>Live Operations</SectionLabel>
              {(!user.permissions || user.permissions.includes('orders')) && (
                <NavItem icon={<Monitor size={20} />} label="Live Orders (KDS)" tabId="live-orders" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('outlet-pos')) && (
                <NavItem icon={<Store size={20} />} label="Outlet POS" tabId="outlet-pos" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('history')) && (
                <NavItem icon={<History size={20} />} label="Order History" tabId="history" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              
              <SectionLabel style={{ marginTop: 16 }}>Management</SectionLabel>
              {(!user.permissions || user.permissions.includes('sales')) && (
                <NavItem icon={<PieChart size={20} />} label="Sales Analytics" tabId="sales" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('menu')) && (
                <NavItem icon={<Coffee size={20} />}  label="Menu Editor"  tabId="menu"       currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('combos')) && (
                <NavItem icon={<Package size={20} />} label="Combo Deals"  tabId="combos"     currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('offers')) && (
                <NavItem icon={<Percent size={20} />} label="Promos & Offers" tabId="offers"  currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('inventory')) && (
                <NavItem icon={<Archive size={20} />} label="Inventory Stock" tabId="inventory" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
              {(!user.permissions || user.permissions.includes('kds-config')) && (
                <NavItem icon={<Monitor size={20} />} label="KDS Routing" tabId="kds-config" currentTab={currentTab} onNav={() => setSidebarOpen(false)} />
              )}
            </>
          )}
        </nav>

        {/* User Card + Logout */}
        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            padding: '14px 16px', background: 'rgba(255,255,255,0.03)', 
            borderRadius: 18, border: '1px solid var(--glass-border)'
          }}>
            <div style={{ 
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,var(--primary-glow),#ff6b6b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 900, color: 'white'
            }}>
              {(user.full_name || user.email || 'A')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.full_name || user.email || 'Admin'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>● Online</div>
            </div>
          </div>
          <button onClick={onLogout} className="btn-lucrative" style={{ width: '100%', padding: 14, fontSize: 13 }}>
            <LogOut size={16} /> LOGOUT
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`} style={{ 
        padding: '40px 60px 40px 0', flex: 1, minHeight: '100vh'
      }}>
        {children}
      </main>
    </div>
  );
}



function SectionLabel({ children, style }) {
  return (
    <div style={{ 
      fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', 
      letterSpacing: 2, fontWeight: 800, marginBottom: 8, paddingLeft: 20, marginTop: 8,
      ...style
    }}>
      {children}
    </div>
  );
}

function NavItem({ icon, label, tabId, currentTab, onNav }) {
  const active = tabId === currentTab;
  return (
    <button
      onClick={() => {
        navigate(tabId);
        onNav?.();
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderRadius: 14, cursor: 'pointer', width: '100%', textAlign: 'left',
        fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)',
        background: active ? 'rgba(255,47,146,0.12)' : 'transparent',
        color: active ? 'var(--primary-glow)' : 'var(--text-muted)',
        border: active ? '1px solid rgba(255,47,146,0.25)' : '1px solid transparent',
        transition: 'all 0.2s ease', marginBottom: 2
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'white'; }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}}
    >
      {icon}
      <span>{label}</span>
      {active && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-glow)', boxShadow: '0 0 8px var(--primary-glow)' }} />}
    </button>
  );
}
