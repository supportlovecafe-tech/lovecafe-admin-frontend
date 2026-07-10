import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Film, Settings, Percent, CheckSquare, Square, Save, Loader2 } from 'lucide-react';

const ALL_CATEGORIES = [
  { key: 'POPCORN', label: '🍿 Popcorn' },
  { key: 'LASSI', label: '🥛 Lassi' },
  { key: 'MILKSHAKE', label: '🥤 Milkshake' },
  { key: 'ICE_CREAM', label: '🍦 Ice Cream' },
  { key: 'BEVERAGES', label: '🧃 Beverages' },
  { key: 'LOVE_SPECIAL', label: '❤️ Love Special' },
  { key: 'SNACKS', label: '🍟 Snacks' },
  { key: 'SANDWICH', label: '🥪 Sandwich' },
  { key: 'BURGER', label: '🍔 Burger' },
  { key: 'TIKKA', label: '🍗 Tikka' },
  { key: 'WRAPS', label: '🌯 Wraps' },
  { key: 'TACO', label: '🌮 Taco' },
  { key: 'MOMO', label: '🥟 Momo' },
  { key: 'CHINESE_RICE_COMBO', label: '🍚 Rice Combos' },
  { key: 'CHINESE_NOODLES_COMBO', label: '🍜 Noodles Combos' },
  { key: 'CHINESE_PASTA', label: '🍝 Pasta' },
  { key: 'PIZZA', label: '🍕 Pizza' },
  { key: 'FUSION_FOODS', label: '🌟 Fusion Foods' }
];

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalCinemas: 0,
    totalManagers: 0
  });

  const [loading, setLoading] = useState(true);
  
  // Platform Fee Settings State
  const [onlineFee, setOnlineFee] = useState('1.0');
  const [posFee, setPosFee] = useState('0.0');
  const [selectedCategories, setSelectedCategories] = useState(['ALL']);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    // Fetch aggregated statistics and platform fee settings
    const [cinemas, profiles, feeSettings] = await Promise.all([
      supabase.from('cinemas').select('id', { count: 'exact' }),
      supabase.from('profiles').select('id').eq('role', 'OUTLET_MANAGER'),
      supabase.from('global_settings').select('*').eq('key', 'platform_fees').single()
    ]);

    setStats({
      totalCinemas: cinemas.data?.length || 0,
      totalManagers: profiles.data?.length || 0
    });

    if (feeSettings.data && feeSettings.data.value) {
      const val = feeSettings.data.value;
      if (val.online_fee_percent !== undefined) setOnlineFee(val.online_fee_percent.toString());
      if (val.pos_fee_percent !== undefined) setPosFee(val.pos_fee_percent.toString());
      if (val.applicable_categories) setSelectedCategories(val.applicable_categories);
    }

    setLoading(false);
  };

  const handleToggleCategory = (categoryKey) => {
    if (categoryKey === 'ALL') {
      if (selectedCategories.includes('ALL')) {
        setSelectedCategories([]);
      } else {
        setSelectedCategories(['ALL']);
      }
      return;
    }

    let updated = [...selectedCategories];
    if (updated.includes('ALL')) {
      updated = updated.filter(x => x !== 'ALL');
    }

    if (updated.includes(categoryKey)) {
      updated = updated.filter(x => x !== categoryKey);
    } else {
      updated.push(categoryKey);
    }

    // Default back to ALL if all categories are manually checked
    if (updated.length === ALL_CATEGORIES.length) {
      setSelectedCategories(['ALL']);
    } else {
      setSelectedCategories(updated);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('global_settings')
        .upsert({
          key: 'platform_fees',
          value: {
            online_fee_percent: parseFloat(onlineFee) || 0.0,
            pos_fee_percent: parseFloat(posFee) || 0.0,
            applicable_categories: selectedCategories
          },
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      alert('Global Platform Fee configurations saved successfully.');
    } catch (e) {
      console.error('Failed to save Platform Fee settings:', e);
      alert('Failed to save settings: ' + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>Global Overview</h1>
        <p style={{ color: 'var(--text-muted)' }}>Manage all outlets and staff across the platform.</p>
      </header>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        <StatCard 
            icon={<Film size={24} color="white" />} 
            title="Total Outlets" 
            value={stats.totalCinemas} 
            color="var(--primary-glow)"
        />
        <StatCard 
            icon={<Users size={24} color="white" />} 
            title="Outlet Managers" 
            value={stats.totalManagers} 
            color="var(--secondary-glow)"
        />
      </div>

      {/* Global Platform Fee Configuration Card */}
      <div className="glass-card" style={{ padding: '32px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ 
            width: '40px', height: '40px', 
            background: 'rgba(255, 179, 106, 0.1)', 
            borderRadius: '12px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-gold)'
          }}>
            <Settings size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Global Platform Fee Configuration</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>Define default platform charges applied across all outlets.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Left side: Fee Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>App / Online Fee (%)</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    className="input-premium" 
                    placeholder="1.0" 
                    value={onlineFee} 
                    onChange={e => setOnlineFee(e.target.value)} 
                    style={{ paddingRight: '40px' }}
                  />
                  <Percent size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Charged to customers placing orders via the APK customer app.</span>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Walk-in POS Fee (%)</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    className="input-premium" 
                    placeholder="0.0" 
                    value={posFee} 
                    onChange={e => setPosFee(e.target.value)} 
                    style={{ paddingRight: '40px' }}
                  />
                  <Percent size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Charged to customers placing walk-in orders via the outlet POS.</span>
              </div>
            </div>

            {/* Right side: Product categories eligibility */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', display: 'block' }}>Apply Platform Fee To:</label>
              
              <div 
                onClick={() => handleToggleCategory('ALL')}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 16px', 
                  borderRadius: '12px', 
                  background: selectedCategories.includes('ALL') ? 'rgba(255,179,106,0.06)' : 'rgba(255,255,255,0.01)',
                  border: selectedCategories.includes('ALL') ? '1px solid rgba(255,179,106,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontWeight: 'bold'
                }}
              >
                {selectedCategories.includes('ALL') ? (
                  <CheckSquare size={18} color="var(--accent-gold)" />
                ) : (
                  <Square size={18} color="rgba(255,255,255,0.2)" />
                )}
                <span>All Products</span>
              </div>

              <div style={{ 
                maxHeight: '180px', 
                overflowY: 'auto', 
                paddingRight: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '8px'
              }}>
                {ALL_CATEGORIES.map(cat => {
                  const isChecked = selectedCategories.includes('ALL') || selectedCategories.includes(cat.key);
                  const isIndividuallyChecked = selectedCategories.includes(cat.key);
                  return (
                    <div 
                      key={cat.key}
                      onClick={() => handleToggleCategory(cat.key)}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isIndividuallyChecked ? 'rgba(255,179,106,0.04)' : 'rgba(255,255,255,0.01)',
                        border: isIndividuallyChecked ? '1px solid rgba(255,179,106,0.15)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        opacity: selectedCategories.includes('ALL') ? 0.6 : 1,
                        pointerEvents: selectedCategories.includes('ALL') ? 'none' : 'auto',
                        transition: 'all 0.2s ease',
                        fontSize: '13px'
                      }}
                    >
                      {isChecked ? (
                        <CheckSquare size={16} color="var(--accent-gold)" />
                      ) : (
                        <Square size={16} color="rgba(255,255,255,0.15)" />
                      )}
                      <span>{cat.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
            <button 
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="btn-lucrative"
              style={{ 
                padding: '12px 28px', 
                borderRadius: '14px', 
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {savingSettings ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>SAVING...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>SAVE CONFIGURATIONS</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }) {
    return (
        <div className="glass-card hover-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: `linear-gradient(135deg, ${color}, rgba(0,0,0,0.8))`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${color}40` }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '32px', fontWeight: '900', letterSpacing: '-1px' }}>{value}</div>
            </div>
        </div>
    );
}
