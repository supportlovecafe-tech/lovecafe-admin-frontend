import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Monitor, Save, Loader2, CheckSquare, Square, Info, ShieldAlert } from 'lucide-react';

interface ScreenConfig {
  id?: string;
  cinema_id: string;
  screen_number: number;
  screen_name: string;
  assigned_categories: string[];
}

const ALL_CATEGORIES = [
  // Ready Foods
  { key: 'POPCORN', label: '🍿 Popcorn', isReady: true },
  { key: 'LASSI', label: '🥛 Lassi', isReady: true },
  { key: 'MILKSHAKE', label: '🥤 Milkshake', isReady: true },
  { key: 'ICE_CREAM', label: '🍦 Ice Cream', isReady: true },
  { key: 'BEVERAGES', label: '🧃 Beverages', isReady: true },
  { key: 'LOVE_SPECIAL', label: '❤️ Love Special', isReady: true },
  // Kitchen Foods
  { key: 'SNACKS', label: '🍟 Snacks', isReady: false },
  { key: 'SANDWICH', label: '🥪 Sandwich', isReady: false },
  { key: 'BURGER', label: '🍔 Burger', isReady: false },
  { key: 'TIKKA', label: '🍗 Tikka', isReady: false },
  { key: 'WRAPS', label: '🌯 Wraps', isReady: false },
  { key: 'TACO', label: '🌮 Taco', isReady: false },
  { key: 'MOMO', label: '🥟 Momo', isReady: false },
  { key: 'CHINESE_RICE_COMBO', label: '🍚 Chinese Rice Combo', isReady: false },
  { key: 'CHINESE_NOODLES_COMBO', label: '🍜 Chinese Noodles Combo', isReady: false },
  { key: 'CHINESE_PASTA', label: '🍝 Chinese Pasta', isReady: false },
  { key: 'PIZZA', label: '🍕 Pizza', isReady: false },
  { key: 'FUSION_FOODS', label: '🌟 Fusion Foods', isReady: false }
];

export default function KDSConfig({ user }: { user: any }) {
  const [configs, setConfigs] = useState<ScreenConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, [user]);

  const fetchConfigs = async () => {
    if (!user?.cinema_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kds_screen_configs')
        .select('*')
        .eq('cinema_id', user.cinema_id)
        .order('screen_number');

      if (error) throw error;

      // Populate 5 screens if they don't exist
      const populatedConfigs: ScreenConfig[] = [];
      for (let i = 1; i <= 5; i++) {
        const existing = data?.find(c => c.screen_number === i);
        populatedConfigs.push(existing || {
          cinema_id: user.cinema_id,
          screen_number: i,
          screen_name: `KDS Station ${i}`,
          assigned_categories: []
        });
      }
      setConfigs(populatedConfigs);
    } catch (e) {
      console.error('Error fetching KDS config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (screenNum: number, name: string) => {
    setConfigs(prev => prev.map(c => 
      c.screen_number === screenNum ? { ...c, screen_name: name } : c
    ));
  };

  const toggleCategory = (screenNum: number, categoryKey: string) => {
    setConfigs(prev => prev.map(c => {
      if (c.screen_number !== screenNum) return c;
      const exists = c.assigned_categories.includes(categoryKey);
      const updated = exists 
        ? c.assigned_categories.filter(x => x !== categoryKey)
        : [...c.assigned_categories, categoryKey];
      return { ...c, assigned_categories: updated };
    }));
  };

  const handleSave = async (screenNum: number) => {
    const configToSave = configs.find(c => c.screen_number === screenNum);
    if (!configToSave) return;

    setSaving(screenNum);
    try {
      const payload: any = {
        cinema_id: configToSave.cinema_id,
        screen_number: configToSave.screen_number,
        screen_name: configToSave.screen_name,
        assigned_categories: configToSave.assigned_categories,
        updated_at: new Date().toISOString()
      };
      if (configToSave.id) {
        payload.id = configToSave.id;
      }

      const { data, error } = await supabase
        .from('kds_screen_configs')
        .upsert(payload, { onConflict: 'cinema_id,screen_number' })
        .select()
        .single();

      if (error) throw error;
      
      // Update local state with the returned ID if it was an insert
      if (data) {
        setConfigs(prev => prev.map(c => 
          c.screen_number === screenNum ? { ...c, id: data.id } : c
        ));
      }
      alert(`Screen ${screenNum} layout saved successfully.`);
    } catch (e: any) {
      console.error('Failed to save KDS Screen layout:', e);
      alert('Failed to save screen layout: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  // Helper to find which screen owns a category
  const getCategoryOwner = (categoryKey: string, currentScreenNum: number) => {
    const owner = configs.find(c => 
      c.screen_number !== currentScreenNum && 
      c.assigned_categories.includes(categoryKey)
    );
    return owner ? owner.screen_name || `Screen ${owner.screen_number}` : null;
  };

  if (loading) {
    return (
      <div style={{ height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={40} color="var(--primary-glow)" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Retrieving KDS Screen Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>Kitchen Screen Routing (KDS)</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Route menu items dynamically to 5 physical kitchen display screens based on category.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {configs.map(screen => {
          const num = screen.screen_number;
          return (
            <div 
              key={num} 
              className="glass-card hover-lift" 
              style={{ 
                padding: '24px', 
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: screen.assigned_categories.length > 0 ? '0 10px 30px rgba(0,210,255,0.05)' : 'none',
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ 
                    width: '36px', height: '36px', 
                    background: 'rgba(0, 210, 255, 0.1)', 
                    borderRadius: '8px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--secondary-glow)'
                  }}>
                    <Monitor size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>PHYSICAL DISPLAY SCREEN {num}</div>
                    <input 
                      type="text" 
                      value={screen.screen_name} 
                      onChange={e => handleNameChange(num, e.target.value)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'white', 
                        fontSize: '16px', 
                        fontWeight: 'bold', 
                        outline: 'none',
                        borderBottom: '1px solid transparent',
                        paddingBottom: '2px'
                      }}
                      onFocus={e => e.target.style.borderBottom = '1px solid var(--secondary-glow)'}
                      onBlur={e => e.target.style.borderBottom = '1px solid transparent'}
                      placeholder={`Display Screen ${num}`}
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSave(num)}
                  disabled={saving !== null}
                  className="btn-lucrative"
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '12px', 
                    borderRadius: '10px', 
                    display: 'flex', alignItems: 'center', gap: '6px' 
                  }}
                >
                  {saving === num ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  <span>SAVE</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div style={{ 
                fontSize: '12px', 
                background: 'rgba(255,255,255,0.02)', 
                padding: '10px 14px', 
                borderRadius: '8px', 
                color: screen.assigned_categories.length > 0 ? '#4CAF50' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <Info size={12} opacity={0.6} />
                <span>
                  {screen.assigned_categories.length} categories routed to this screen
                </span>
              </div>

              {/* Categories list checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', fontWeight: 'bold' }}>Ready Food Categories</div>
                {ALL_CATEGORIES.filter(c => c.isReady).map(cat => {
                  const isChecked = screen.assigned_categories.includes(cat.key);
                  const owner = getCategoryOwner(cat.key, num);
                  const isDisabled = !!owner;

                  return (
                    <div 
                      key={cat.key} 
                      onClick={() => !isDisabled && toggleCategory(num, cat.key)}
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isChecked ? 'rgba(255,179,106,0.04)' : 'rgba(255,255,255,0.01)',
                        border: isChecked ? '1px solid rgba(255,179,106,0.2)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.35 : 1,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        {isChecked ? (
                          <CheckSquare size={16} color="var(--accent-gold)" />
                        ) : (
                          <Square size={16} color="rgba(255,255,255,0.2)" />
                        )}
                        <span style={{ fontSize: '13px', color: isChecked ? 'white' : 'rgba(255,255,255,0.7)' }}>{cat.label}</span>
                      </div>
                      {isDisabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', background: 'rgba(244,67,54,0.1)', color: '#F44336', padding: '2px 6px', borderRadius: '4px' }}>
                          <ShieldAlert size={10} />
                          <span>On {owner}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Kitchen Food Categories</div>
                {ALL_CATEGORIES.filter(c => !c.isReady).map(cat => {
                  const isChecked = screen.assigned_categories.includes(cat.key);
                  const owner = getCategoryOwner(cat.key, num);
                  const isDisabled = !!owner;

                  return (
                    <div 
                      key={cat.key} 
                      onClick={() => !isDisabled && toggleCategory(num, cat.key)}
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isChecked ? 'rgba(0,210,255,0.04)' : 'rgba(255,255,255,0.01)',
                        border: isChecked ? '1px solid rgba(0,210,255,0.2)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.35 : 1,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        {isChecked ? (
                          <CheckSquare size={16} color="var(--secondary-glow)" />
                        ) : (
                          <Square size={16} color="rgba(255,255,255,0.2)" />
                        )}
                        <span style={{ fontSize: '13px', color: isChecked ? 'white' : 'rgba(255,255,255,0.7)' }}>{cat.label}</span>
                      </div>
                      {isDisabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', background: 'rgba(244,67,54,0.1)', color: '#F44336', padding: '2px 6px', borderRadius: '4px' }}>
                          <ShieldAlert size={10} />
                          <span>On {owner}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
