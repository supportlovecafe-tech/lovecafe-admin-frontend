import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Monitor, Save, Loader2, CheckSquare, Square, Info, ShieldAlert, Users, Plus, Trash2 } from 'lucide-react';

interface ScreenConfig {
  id?: string;
  cinema_id: string;
  screen_number: number;
  screen_name: string;
  assigned_categories: string[];
  assigned_staffs?: string[];
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
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, [user]);

  const fetchConfigs = async () => {
    if (!user?.cinema_id) return;
    setLoading(true);
    try {
      const { data: staffData } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('cinema_id', user.cinema_id)
        .in('role', ['OUTLET_MANAGER', 'OUTLET_STAFF', 'OUTLET_CHEF']);
        
      if (staffData) {
        setStaffList(staffData);
      }

      const { data, error } = await supabase
        .from('kds_screen_configs')
        .select('*')
        .eq('cinema_id', user.cinema_id)
        .order('screen_number');

      if (error) throw error;

      // Populate screens from database, default to 1 if none exist
      let populatedConfigs = data || [];
      if (populatedConfigs.length === 0) {
        populatedConfigs.push({
          cinema_id: user.cinema_id,
          screen_number: 1,
          screen_name: `KDS Station 1`,
          assigned_categories: [],
          assigned_staffs: []
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

  const toggleStaff = (screenNum: number, staffId: string) => {
    setConfigs(prev => prev.map(c => {
      if (c.screen_number !== screenNum) return c;
      const assigned = c.assigned_staffs || [];
      const exists = assigned.includes(staffId);
      const updated = exists 
        ? assigned.filter(x => x !== staffId)
        : [...assigned, staffId];
      return { ...c, assigned_staffs: updated };
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
        assigned_staffs: configToSave.assigned_staffs || [],
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

  const handleAddScreen = () => {
    setConfigs(prev => {
      const maxScreenNum = prev.length > 0 ? Math.max(...prev.map(c => c.screen_number)) : 0;
      const nextNum = maxScreenNum + 1;
      return [...prev, {
        cinema_id: user.cinema_id,
        screen_number: nextNum,
        screen_name: `KDS Station ${nextNum}`,
        assigned_categories: [],
        assigned_staffs: []
      }];
    });
  };

  const handleRemoveScreen = async (screenNum: number, configId?: string) => {
    if (!window.confirm(`Are you sure you want to remove KDS Station ${screenNum}?`)) return;
    
    if (configId) {
      try {
        const { error } = await supabase
          .from('kds_screen_configs')
          .delete()
          .eq('id', configId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to delete screen:', err);
        alert('Failed to remove screen from database.');
        return;
      }
    }
    
    setConfigs(prev => prev.filter(c => c.screen_number !== screenNum));
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

                <div style={{ display: 'flex', gap: '8px' }}>
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
                  <button 
                    onClick={() => handleRemoveScreen(num, screen.id)}
                    style={{ 
                      padding: '8px 12px', 
                      background: 'rgba(255,60,60,0.1)', 
                      border: '1px solid rgba(255,60,60,0.2)', 
                      color: '#ff6b6b', 
                      borderRadius: '10px', 
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Remove Screen"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
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

                  return (
                    <div 
                      key={cat.key} 
                      onClick={() => toggleCategory(num, cat.key)}
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isChecked ? 'rgba(255,179,106,0.04)' : 'rgba(255,255,255,0.01)',
                        border: isChecked ? '1px solid rgba(255,179,106,0.2)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        opacity: 1,
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
                    </div>
                  );
                })}

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Kitchen Food Categories</div>
                {ALL_CATEGORIES.filter(c => !c.isReady).map(cat => {
                  const isChecked = screen.assigned_categories.includes(cat.key);

                  return (
                    <div 
                      key={cat.key} 
                      onClick={() => toggleCategory(num, cat.key)}
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isChecked ? 'rgba(0,210,255,0.04)' : 'rgba(255,255,255,0.01)',
                        border: isChecked ? '1px solid rgba(0,210,255,0.2)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        opacity: 1,
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
                    </div>
                  );
                })}

                {/* Staff Assignment Section */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Assigned Staff (Optional)</div>
                {staffList.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px' }}>No staff members found for this cinema.</div>
                )}
                {staffList.map(staff => {
                  const assigned = screen.assigned_staffs || [];
                  const isChecked = assigned.includes(staff.id);
                  
                  return (
                    <div 
                      key={staff.id} 
                      onClick={() => toggleStaff(num, staff.id)}
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                        padding: '10px 12px', 
                        borderRadius: '10px', 
                        background: isChecked ? 'rgba(76, 175, 80, 0.04)' : 'rgba(255,255,255,0.01)',
                        border: isChecked ? '1px solid rgba(76, 175, 80, 0.2)' : '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        {isChecked ? (
                          <CheckSquare size={16} color="#4CAF50" />
                        ) : (
                          <Square size={16} color="rgba(255,255,255,0.2)" />
                        )}
                        <span style={{ fontSize: '13px', color: isChecked ? 'white' : 'rgba(255,255,255,0.7)' }}>
                          {staff.full_name} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>({staff.role === 'OUTLET_MANAGER' ? 'Manager' : 'Staff'})</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
        
        <div 
          onClick={handleAddScreen}
          className="glass-card hover-lift"
          style={{
            padding: '24px',
            border: '1px dashed rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor: 'pointer',
            minHeight: '200px'
          }}
        >
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', color: 'var(--text-muted)' }}>
            <Plus size={32} />
          </div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Add KDS Screen</div>
        </div>
      </div>
    </div>
  );
}
