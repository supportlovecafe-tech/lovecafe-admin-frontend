import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, Film, X, Search, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

export default function StaffManager() {
  const [cinemas, setCinemas] = useState([]);
  const [staffByOutlet, setStaffByOutlet] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedOutlet, setExpandedOutlet] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '',
    pin: '', 
    role: 'OUTLET_MANAGER', 
    cinemaId: '',
    permissions: ['orders', 'menu', 'history', 'sales']
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cinemasRes, profilesRes] = await Promise.all([
        supabase.from('cinemas').select('id, name, location, login_email'),
        supabase.from('profiles').select('*').in('role', ['OUTLET_MANAGER', 'OUTLET_STAFF']).order('updated_at', { ascending: false })
      ]);

      if (cinemasRes.data) setCinemas(cinemasRes.data);
      
      const grouped = {};
      (profilesRes.data || []).forEach(staff => {
        if (!staff.cinema_id) return;
        if (!grouped[staff.cinema_id]) grouped[staff.cinema_id] = [];
        grouped[staff.cinema_id].push(staff);
      });
      setStaffByOutlet(grouped);
    } catch (e) {
      console.error("Failed to fetch staff data:", e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingStaff(null);
    setFormData({ name: '', email: '', pin: '', role: 'OUTLET_MANAGER', cinemaId: '', permissions: ['orders', 'menu', 'history', 'sales'] });
  };

  const handleEditStaff = (staff) => {
    setEditingStaff(staff.id);
    setFormData({
      name: staff.full_name || '',
      email: staff.email || '',
      pin: staff.pin || '',
      role: staff.role || 'OUTLET_MANAGER',
      cinemaId: staff.cinema_id || '',
      permissions: staff.permissions || ['orders', 'menu', 'history', 'sales']
    });
  };

  const handleDeleteStaff = async (staffId) => {
    if (!window.confirm('Remove this staff member?')) return;
    setLoading(true);
    await supabase.from('profiles').delete().eq('id', staffId);
    resetForm();
    fetchData();
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.cinemaId) {
      alert('Please select an outlet first.');
      return;
    }
    if (!formData.pin || formData.pin.length < 4) {
      alert('PIN must be at least 4 digits.');
      return;
    }

    setLoading(true);

    const payload = {
      full_name: formData.name,
      email: formData.email ? formData.email.trim() : null,
      pin: formData.pin,
      role: formData.role,
      cinema_id: formData.cinemaId,
      permissions: formData.permissions,
      updated_at: new Date().toISOString()
    };

    if (editingStaff) {
      const { error } = await supabase.from('profiles').update(payload).eq('id', editingStaff);
      if (error) alert(`Update Error: ${error.message}`);
      else { resetForm(); fetchData(); }
    } else {
      const { error } = await supabase.from('profiles').insert([payload]);
      if (error) alert(`Error: ${error.message}`);
      else { resetForm(); fetchData(); }
    }
    setLoading(false);
  };

  const startAddStaff = (cinemaId) => {
    resetForm();
    setFormData(prev => ({ ...prev, cinemaId }));
    setExpandedOutlet(cinemaId);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: 'calc(100vh - 120px)' }}>
      <header>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>Outlet Credentials</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage outlet login access and staff PINs for each location.</p>
      </header>

      <div style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1.8, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {cinemas.length === 0 && !loading && (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Film size={48} opacity={0.2} style={{ marginBottom: '16px' }} />
              <div>No outlets found. Create outlets from the Outlets tab first.</div>
            </div>
          )}

          {cinemas.map(cinema => {
            const isExpanded = expandedOutlet === cinema.id;
            const staff = staffByOutlet[cinema.id] || [];
            const managerCount = staff.filter(s => s.role === 'OUTLET_MANAGER').length;
            const staffCount = staff.filter(s => s.role === 'OUTLET_STAFF').length;

            return (
              <div key={cinema.id} className="glass-card" style={{ border: isExpanded ? '1px solid rgba(255,47,146,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={() => setExpandedOutlet(isExpanded ? null : cinema.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px', width: '100%', background: 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'left' }}
                >
                  {isExpanded ? <ChevronDown size={20} color="var(--primary-glow)" /> : <ChevronRight size={20} color="var(--text-muted)" />}
                  <Film size={20} color="var(--primary-glow)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '800', fontSize: '15px' }}>{cinema.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{cinema.location}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,47,146,0.1)', color: 'var(--primary-glow)', fontWeight: '800' }}>
                      {managerCount} MGR
                    </span>
                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontWeight: '800' }}>
                      {staffCount} STAFF
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', fontWeight: '800', marginBottom: '8px' }}>Outlet Login</div>
                      {cinema.login_email ? (
                        <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>Email: </span><span style={{ fontFamily: 'monospace', color: 'white' }}>{cinema.login_email}</span></div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No login credentials set.</div>
                      )}
                    </div>

                    {staff.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No staff members yet.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.25)' }}>
                            <th style={{ padding: '12px 24px', textAlign: 'left' }}>Name</th>
                            <th style={{ padding: '12px 24px', textAlign: 'left' }}>Email</th>
                            <th style={{ padding: '12px 24px', textAlign: 'left' }}>Role</th>
                            <th style={{ padding: '12px 24px', textAlign: 'left' }}>PIN</th>
                            <th style={{ padding: '12px 24px', textAlign: 'left' }}>Access</th>
                            <th style={{ padding: '12px 24px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staff.map(s => (
                            <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: '14px 24px', fontWeight: '700', fontSize: '14px' }}>{s.full_name || 'Unnamed'}</td>
                              <td style={{ padding: '14px 24px', color: 'var(--text-secondary)' }}>{s.email || '—'}</td>
                              <td style={{ padding: '14px 24px' }}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '900',
                                  background: s.role === 'OUTLET_MANAGER' ? 'rgba(255,47,146,0.12)' : 'rgba(255,179,106,0.1)',
                                  color: s.role === 'OUTLET_MANAGER' ? 'var(--primary-glow)' : 'var(--secondary-orange)'
                                }}>
                                  {s.role === 'OUTLET_MANAGER' ? 'MANAGER' : 'STAFF'}
                                </span>
                              </td>
                              <td style={{ padding: '14px 24px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold', color: 'var(--success)', letterSpacing: '3px' }}>{s.pin || '—'}</td>
                              <td style={{ padding: '14px 24px' }}>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {(s.permissions || []).map(p => (
                                    <span key={p} style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>{p}</span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={() => handleEditStaff(s)} className="btn-lucrative" style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px' }}>EDIT</button>
                                  <button onClick={() => handleDeleteStaff(s.id)} style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', background: 'rgba(255,60,60,0.1)', color: '#ff6b6b', border: '1px solid rgba(255,60,60,0.2)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <button onClick={() => startAddStaff(cinema.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', width: '100%', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>
                        <Plus size={14} /> Add Manager / Staff
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ width: '360px' }}>
          <div className="glass-card animate-fade-in" style={{ padding: '28px', position: 'sticky', top: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '28px' }}>
              <div style={{ padding: '10px', background: 'rgba(255,47,146,0.1)', borderRadius: '12px', color: 'var(--primary-red)' }}>
                {editingStaff ? <KeyRound size={22} /> : <Plus size={22} />}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '-0.5px' }}>{editingStaff ? 'Update Staff' : 'Add Staff'}</h2>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Modify PIN and permissions.</div>
              </div>
              {editingStaff && <button onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Outlet</label>
                <select className="input-premium" value={formData.cinemaId} onChange={e => setFormData({...formData, cinemaId: e.target.value})} required>
                  <option value="" disabled style={{ background: 'var(--bg-dark)' }}>Select Outlet...</option>
                  {cinemas.map(c => <option key={c.id} value={c.id} style={{ background: 'var(--bg-dark)' }}>{c.name}</option>)}
                </select>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Full Name</label>
                <input className="input-premium" placeholder="Staff Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Google Login Email (Optional)</label>
                <input className="input-premium" type="email" placeholder="staff@lovecafe.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Login PIN</label>
                <input className="input-premium" placeholder="1234" value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} maxLength={6} required style={{ fontFamily: 'monospace', fontSize: '20px', letterSpacing: '6px', textAlign: 'center' }} />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Role</label>
                <select className="input-premium" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                  <option value="OUTLET_MANAGER" style={{ background: 'var(--bg-dark)' }}>Manager</option>
                  <option value="OUTLET_STAFF" style={{ background: 'var(--bg-dark)' }}>Staff</option>
                </select>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', display: 'block' }}>Module Access</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { id: 'dashboard', label: 'Live POS' },
                    { id: 'outlet-pos', label: 'Outlet POS' },
                    { id: 'history', label: 'Order History' },
                    { id: 'sales', label: 'Sales Analytics' },
                    { id: 'menu', label: 'Menu Editor' },
                    { id: 'combos', label: 'Combo Deals' },
                    { id: 'offers', label: 'Promos & Offers' },
                    { id: 'inventory', label: 'Inventory Stock' },
                    { id: 'kds-config', label: 'KDS Routing' }
                  ].map(mod => (
                    <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={formData.permissions.includes(mod.id)} onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({ ...prev, permissions: checked ? [...prev.permissions, mod.id] : prev.permissions.filter(p => p !== mod.id) }));
                      }} style={{ width: '14px', height: '14px', accentColor: 'var(--primary-glow)' }} />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" className="btn-lucrative" style={{ padding: '14px', fontSize: '13px', marginTop: '8px' }} disabled={loading}>
                {loading ? 'PROCESSING...' : (editingStaff ? 'SAVE CHANGES' : 'CREATE STAFF PIN')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
