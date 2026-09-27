import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Monitor, Save, Loader2, CheckSquare, Square, Info, Plus, Trash2, GripVertical, Search } from 'lucide-react';

interface ScreenConfig {
  id?: string;
  cinema_id: string;
  screen_number: number;
  screen_name: string;
  assigned_categories: string[];
  assigned_staffs?: string[];
}

// ── Master category list — all possible categories across all outlets ─────────
// Outlet managers can freely assign any of these to any KDS screen.
const ALL_CATEGORIES = [
  { key: 'COMBOS',                label: '🎁 Combos' },
  { key: 'POPCORN',               label: '🍿 Popcorn' },
  { key: 'BEVERAGES',             label: '🧃 Beverages' },
  { key: 'BOBA',                  label: '🧋 Boba' },
  { key: 'NACHOS',                label: '🌽 Nachos' },
  { key: 'LASSI',                 label: '🥛 Lassi' },
  { key: 'MILKSHAKE',             label: '🥤 Milkshake' },
  { key: 'ICE_CREAM',             label: '🍦 Ice Cream' },
  { key: 'LOVE_SPECIAL',          label: '❤️ Love Special' },
  { key: 'SNACKS',                label: '🍟 Snacks' },
  { key: 'SANDWICH',              label: '🥪 Sandwich' },
  { key: 'BURGER',                label: '🍔 Burger' },
  { key: 'TIKKA',                 label: '🍗 Tikka' },
  { key: 'WRAPS',                 label: '🌯 Wraps' },
  { key: 'TACO',                  label: '🌮 Taco' },
  { key: 'MOMO',                  label: '🥟 Momo' },
  { key: 'PASTA',                 label: '🍝 Pasta' },
  { key: 'CHINESE_PASTA',         label: '🍝 Chinese Pasta' },
  { key: 'CHINESE_RICE_COMBO',    label: '🍚 Chinese Rice Combo' },
  { key: 'CHINESE_NOODLES_COMBO', label: '🍜 Chinese Noodles Combo' },
  { key: 'PIZZA',                 label: '🍕 Pizza' },
  { key: 'FUSION_FOODS',          label: '🌟 Fusion Foods' },
];

const ALL_CATEGORY_MAP = Object.fromEntries(ALL_CATEGORIES.map(c => [c.key, c.label]));

export default function KDSConfig({ user }: { user: any }) {
  const [configs, setConfigs]     = useState<ScreenConfig[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState<number | null>(null);
  const [search, setSearch]       = useState('');

  // Drag-and-drop state for reordering assigned categories
  const [dragging, setDragging]   = useState<{ screenNum: number; catKey: string } | null>(null);
  const dragOverKey = useRef<string | null>(null);

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
      const updated = assigned.includes(staffId) ? assigned.filter(x => x !== staffId) : [...assigned, staffId];
      return { ...c, assigned_staffs: updated };
    }));
  };

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────
  const handleDragStart = (screenNum: number, catKey: string) => setDragging({ screenNum, catKey });

  const handleDragOver = (e: React.DragEvent, catKey: string) => {
    e.preventDefault();
    dragOverKey.current = catKey;
  };

  const handleDrop = (screenNum: number) => {
    if (!dragging || dragging.screenNum !== screenNum || !dragOverKey.current) { setDragging(null); return; }
    const from = dragging.catKey;
    const to = dragOverKey.current;
    if (from === to) { setDragging(null); return; }
    setConfigs(prev => prev.map(c => {
      if (c.screen_number !== screenNum) return c;
      const cats = [...c.assigned_categories];
      const fromIdx = cats.indexOf(from);
      const toIdx   = cats.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return c;
      cats.splice(fromIdx, 1);
      cats.splice(toIdx, 0, from);
      return { ...c, assigned_categories: cats };
    }));
    setDragging(null);
    dragOverKey.current = null;
  };

  const filteredCategories = ALL_CATEGORIES.filter(cat =>
    cat.label.toLowerCase().includes(search.toLowerCase()) ||
    cat.key.toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <header className="kds-page-header" style={{ paddingRight: '52px', boxSizing: 'border-box' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ wordBreak: 'break-word' }}>Kitchen Screen Routing (KDS)</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>Assign any category to any screen. Drag assigned categories to reorder them on the KDS display.</p>
        </div>
      </header>

      {/* Category search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '10px 16px', maxWidth: '360px' }}>
        <Search size={15} color="var(--text-muted)" />
        <input
          type="text"
          placeholder="Filter categories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '13px', flex: 1 }}
        />
      </div>

      <div className="kds-screen-grid">
        {configs.map(screen => {
          const num = screen.screen_number;
          const assigned = screen.assigned_categories;
          const unassigned = filteredCategories.filter(c => !assigned.includes(c.key));

          return (
            <div
              key={num}
              className="glass-card hover-lift"
              style={{
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: assigned.length > 0 ? '0 10px 30px rgba(0,210,255,0.05)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header */}
              <div className="kds-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', background: 'rgba(0, 210, 255, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary-glow)' }}>
                    <Monitor size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>PHYSICAL DISPLAY SCREEN {num}</div>
                    <input
                      type="text"
                      value={screen.screen_name}
                      onChange={e => handleNameChange(num, e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '16px', fontWeight: 'bold', outline: 'none', borderBottom: '1px solid transparent', paddingBottom: '2px' }}
                      onFocus={e => (e.target.style.borderBottom = '1px solid var(--secondary-glow)')}
                      onBlur={e  => (e.target.style.borderBottom = '1px solid transparent')}
                      placeholder={`Display Screen ${num}`}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleSave(num)} disabled={saving !== null} className="btn-lucrative" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {saving === num ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    <span>SAVE</span>
                  </button>
                  <button onClick={() => handleRemoveScreen(num, screen.id)} style={{ padding: '8px 12px', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', color: '#ff6b6b', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove Screen">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Status */}
              <div style={{ fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', color: assigned.length > 0 ? '#4CAF50' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={12} opacity={0.6} />
                <span>{assigned.length} {assigned.length === 1 ? 'category' : 'categories'} routed to this screen</span>
              </div>

              {/* Assigned categories — draggable to reorder */}
              {assigned.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 'bold' }}>✅ Assigned — drag to reorder</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} onDrop={() => handleDrop(num)} onDragOver={e => e.preventDefault()}>
                    {(search
                      ? assigned.filter(key => { const l = ALL_CATEGORY_MAP[key] ?? key; return l.toLowerCase().includes(search.toLowerCase()) || key.toLowerCase().includes(search.toLowerCase()); })
                      : assigned
                    ).map(catKey => {
                      const label = ALL_CATEGORY_MAP[catKey] ?? `📦 ${catKey}`;
                      const isDragging = dragging?.screenNum === num && dragging?.catKey === catKey;
                      return (
                        <div key={catKey} draggable
                          onDragStart={() => handleDragStart(num, catKey)}
                          onDragOver={e => handleDragOver(e, catKey)}
                          onClick={() => toggleCategory(num, catKey)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: isDragging ? 'rgba(0,210,255,0.12)' : 'rgba(0,210,255,0.05)', border: '1px solid rgba(0,210,255,0.25)', cursor: 'grab', opacity: isDragging ? 0.5 : 1, transition: 'all 0.15s ease' }}
                        >
                          <GripVertical size={14} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0 }} />
                          <CheckSquare size={16} color="var(--secondary-glow)" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: 'white', flex: 1 }}>{label}</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>click to unassign</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unassigned categories */}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 'bold' }}>
                  {assigned.length > 0 ? 'Add More Categories' : 'All Categories — click to assign'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                  {unassigned.length === 0 && search === '' && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px' }}>All categories assigned to this screen.</div>}
                  {unassigned.length === 0 && search !== '' && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px' }}>No unassigned categories match your search.</div>}
                  {unassigned.map(cat => (
                    <div key={cat.key} onClick={() => toggleCategory(num, cat.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.01)')}
                    >
                      <Square size={16} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', flex: 1 }}>{cat.label}</span>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>click to assign</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Staff Assignment */}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 'bold' }}>Assigned Staff (Optional)</div>
                {staffList.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px' }}>No staff members found for this cinema.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {staffList.map(staff => {
                    const assignedStaffs = screen.assigned_staffs || [];
                    const isChecked = assignedStaffs.includes(staff.id);
                    return (
                      <div key={staff.id} onClick={() => toggleStaff(num, staff.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: isChecked ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255,255,255,0.01)', border: isChecked ? '1px solid rgba(76, 175, 80, 0.2)' : '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                      >
                        {isChecked ? <CheckSquare size={16} color="#4CAF50" /> : <Square size={16} color="rgba(255,255,255,0.2)" />}
                        <span style={{ fontSize: '13px', color: isChecked ? 'white' : 'rgba(255,255,255,0.7)' }}>
                          {staff.full_name} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>({staff.role === 'OUTLET_MANAGER' ? 'Manager' : 'Staff'})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
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
