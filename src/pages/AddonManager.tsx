import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Save, ChevronRight, Tag, Sliders, AlertCircle, CheckCircle, Package, X } from 'lucide-react';

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#22c55e' : '#ef4444',
      color: '#fff', padding: '12px 20px', borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 600,
    }}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

const emptyGroup = {
  name: '', display_name: '', selection_type: 'SINGLE',
  is_required: false, min_selection: 0, max_selection: null, sort_order: 0,
};

export default function AddonManager({ user }) {
  const [groups, setGroups] = useState([]);
  const [options, setOptions] = useState({});
  const [assignments, setAssignments] = useState({});
  const [menuItems, setMenuItems] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newOption, setNewOption] = useState({ name: '', price: 0 });
  const [assignSearch, setAssignSearch] = useState('');
  const [activeRightTab, setActiveRightTab] = useState('options');
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroup, setNewGroup] = useState(emptyGroup);

  const cinemaId = user?.cinema_id || user?.cinemaId;

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const loadGroups = useCallback(async () => {
    if (!cinemaId) return;
    const { data, error } = await supabase
      .from('addon_groups')
      .select('*')
      .eq('cinema_id', cinemaId)
      .order('sort_order', { ascending: true });
    if (!error) setGroups(data || []);
  }, [cinemaId]);

  const loadOptions = useCallback(async (groupId) => {
    const { data } = await supabase
      .from('addon_options')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true });
    setOptions(prev => ({ ...prev, [groupId]: data || [] }));
  }, []);

  const loadAssignments = useCallback(async (groupId) => {
    const { data } = await supabase
      .from('addon_group_assignments')
      .select('*')
      .eq('group_id', groupId);
    setAssignments(prev => ({ ...prev, [groupId]: data || [] }));
  }, []);

  const loadMenuItems = useCallback(async () => {
    if (!cinemaId) return;
    const { data } = await supabase
      .from('food_items')
      .select('id, name, category')
      .or(`cinema_id.eq.${cinemaId},cinema_id.is.null`)
      .eq('is_available', true)
      .order('category', { ascending: true });
    setMenuItems(data || []);
  }, [cinemaId]);

  useEffect(() => {
    loadGroups();
    loadMenuItems();
  }, [loadGroups, loadMenuItems]);

  useEffect(() => {
    if (selectedGroupId) {
      loadOptions(selectedGroupId);
      loadAssignments(selectedGroupId);
    }
  }, [selectedGroupId, loadOptions, loadAssignments]);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim() || !newGroup.display_name.trim()) {
      showToast('Please fill in group name and display name', 'error');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('addon_groups')
      .insert({ ...newGroup, cinema_id: cinemaId })
      .select()
      .single();
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    setGroups(prev => [...prev, data]);
    setSelectedGroupId(data.id);
    setEditingGroup(data);
    setNewGroup(emptyGroup);
    setShowNewGroupForm(false);
    showToast('Add-on group created!');
  };

  const handleSaveGroup = async () => {
    if (!editingGroup) return;
    setSaving(true);
    const { error } = await supabase
      .from('addon_groups')
      .update({
        name: editingGroup.name,
        display_name: editingGroup.display_name,
        selection_type: editingGroup.selection_type,
        is_required: editingGroup.is_required,
        min_selection: Number(editingGroup.min_selection) || 0,
        max_selection: editingGroup.max_selection ? Number(editingGroup.max_selection) : null,
        sort_order: Number(editingGroup.sort_order) || 0,
      })
      .eq('id', editingGroup.id);
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    setGroups(prev => prev.map(g => g.id === editingGroup.id ? editingGroup : g));
    showToast('Group saved!');
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Delete this add-on group and all its options?')) return;
    const { error } = await supabase.from('addon_groups').delete().eq('id', groupId);
    if (error) { showToast(error.message, 'error'); return; }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (selectedGroupId === groupId) { setSelectedGroupId(null); setEditingGroup(null); }
    showToast('Group deleted');
  };

  const handleAddOption = async () => {
    if (!newOption.name.trim()) { showToast('Option name required', 'error'); return; }
    const { data, error } = await supabase
      .from('addon_options')
      .insert({ group_id: selectedGroupId, name: newOption.name, price: Number(newOption.price) || 0, sort_order: (options[selectedGroupId] || []).length })
      .select()
      .single();
    if (error) { showToast(error.message, 'error'); return; }
    setOptions(prev => ({ ...prev, [selectedGroupId]: [...(prev[selectedGroupId] || []), data] }));
    setNewOption({ name: '', price: 0 });
    showToast('Option added!');
  };

  const handleUpdateOption = async (option, field, value) => {
    const updated = { ...option, [field]: field === 'price' ? Number(value) : value };
    setOptions(prev => ({ ...prev, [selectedGroupId]: (prev[selectedGroupId] || []).map(o => o.id === option.id ? updated : o) }));
    await supabase.from('addon_options').update({ [field]: updated[field] }).eq('id', option.id);
  };

  const handleDeleteOption = async (optionId) => {
    const { error } = await supabase.from('addon_options').delete().eq('id', optionId);
    if (error) { showToast(error.message, 'error'); return; }
    setOptions(prev => ({ ...prev, [selectedGroupId]: (prev[selectedGroupId] || []).filter(o => o.id !== optionId) }));
  };

  const currentAssignments = assignments[selectedGroupId] || [];
  const isAssignedToItem = (itemId) => currentAssignments.some(a => a.food_item_id === itemId);
  const isAssignedToCategory = (cat) => currentAssignments.some(a => a.category === cat);

  const handleToggleItemAssign = async (item) => {
    if (isAssignedToItem(item.id)) {
      const row = currentAssignments.find(a => a.food_item_id === item.id);
      await supabase.from('addon_group_assignments').delete().eq('id', row.id);
      setAssignments(prev => ({ ...prev, [selectedGroupId]: currentAssignments.filter(a => a.id !== row.id) }));
    } else {
      const { data } = await supabase.from('addon_group_assignments')
        .insert({ group_id: selectedGroupId, cinema_id: cinemaId, food_item_id: item.id })
        .select().single();
      if (data) setAssignments(prev => ({ ...prev, [selectedGroupId]: [...currentAssignments, data] }));
    }
  };

  const handleToggleCategoryAssign = async (cat) => {
    if (isAssignedToCategory(cat)) {
      const row = currentAssignments.find(a => a.category === cat);
      await supabase.from('addon_group_assignments').delete().eq('id', row.id);
      setAssignments(prev => ({ ...prev, [selectedGroupId]: currentAssignments.filter(a => a.id !== row.id) }));
    } else {
      const { data } = await supabase.from('addon_group_assignments')
        .insert({ group_id: selectedGroupId, cinema_id: cinemaId, category: cat })
        .select().single();
      if (data) setAssignments(prev => ({ ...prev, [selectedGroupId]: [...currentAssignments, data] }));
    }
  };

  const categories = [...new Set(menuItems.map(i => i.category))].sort();
  const filteredItems = menuItems.filter(i => !assignSearch || i.name.toLowerCase().includes(assignSearch.toLowerCase()) || i.category.toLowerCase().includes(assignSearch.toLowerCase()));
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
  const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 };
  const btnGhost = { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
  const badgeStyle = (color: string) => ({ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: `${color}22`, color, border: `1px solid ${color}44`, letterSpacing: 0.3 });

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 100px)', padding: '0 4px' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* LEFT: Groups List */}
      <div className="glass-card" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 20 }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Add-on Groups</h3>
            <button onClick={() => setShowNewGroupForm(v => !v)} style={btnPrimary}>
              <Plus size={14} /> New
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
        </div>

        {showNewGroupForm && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
            <input placeholder="Internal name (e.g. choose_crust)" value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            <input placeholder="Display name (e.g. Choose Crust)" value={newGroup.display_name} onChange={e => setNewGroup(p => ({ ...p, display_name: e.target.value }))} style={{ ...inputStyle, marginTop: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleCreateGroup} disabled={saving} style={btnPrimary}>{saving ? 'Creating...' : 'Create'}</button>
              <button onClick={() => setShowNewGroupForm(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 13 }}>No add-on groups yet.</p>
            </div>
          )}
          {groups.map(group => (
            <div key={group.id} onClick={() => { setSelectedGroupId(group.id); setEditingGroup({ ...group }); }}
              style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 6, cursor: 'pointer',
                background: selectedGroupId === group.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: selectedGroupId === group.id ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent', transition: 'all 0.15s' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.display_name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={badgeStyle(group.selection_type === 'SINGLE' ? '#6366f1' : '#f59e0b')}>{group.selection_type}</span>
                {group.is_required && <span style={badgeStyle('#ef4444')}>REQUIRED</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Group Details */}
      {selectedGroup && editingGroup ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          {/* Group Settings */}
          <div className="glass-card" style={{ borderRadius: 20, padding: 24, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedGroup.display_name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Configure group settings</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveGroup} disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => handleDeleteGroup(selectedGroupId)} style={{ ...btnGhost, color: '#ef4444' }}><Trash2 size={14} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div><label style={labelStyle}>Internal Name</label><input value={editingGroup.name} onChange={e => setEditingGroup(p => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Display Name</label><input value={editingGroup.display_name} onChange={e => setEditingGroup(p => ({ ...p, display_name: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Selection Type</label>
                <select value={editingGroup.selection_type} onChange={e => setEditingGroup(p => ({ ...p, selection_type: e.target.value }))} style={inputStyle}>
                  <option value="SINGLE">SINGLE (Pick one)</option>
                  <option value="MULTI">MULTI (Pick many)</option>
                </select>
              </div>
              <div><label style={labelStyle}>Required?</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
                  <input type="checkbox" checked={editingGroup.is_required} onChange={e => setEditingGroup(p => ({ ...p, is_required: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: editingGroup.is_required ? '#ef4444' : 'var(--text-muted)' }}>{editingGroup.is_required ? 'Mandatory' : 'Optional'}</span>
                </div>
              </div>
              {editingGroup.selection_type === 'MULTI' && (
                <>
                  <div><label style={labelStyle}>Min Selections</label><input type="number" min={0} value={editingGroup.min_selection} onChange={e => setEditingGroup(p => ({ ...p, min_selection: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Max Selections</label><input type="number" min={1} value={editingGroup.max_selection ?? ''} placeholder="Unlimited" onChange={e => setEditingGroup(p => ({ ...p, max_selection: e.target.value || null }))} style={inputStyle} /></div>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            {['options', 'assign'].map(tab => (
              <button key={tab} onClick={() => setActiveRightTab(tab)} style={{ padding: '8px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: activeRightTab === tab ? 'var(--primary)' : 'rgba(255,255,255,0.06)', color: activeRightTab === tab ? '#fff' : 'var(--text-muted)' }}>
                {tab === 'options' ? 'Options' : 'Assign to Items'}
              </button>
            ))}
          </div>

          {/* Options Tab */}
          {activeRightTab === 'options' && (
            <div className="glass-card" style={{ borderRadius: 20, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Options in "{selectedGroup.display_name}"</h4>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                  <input placeholder="Option name (e.g. Thin Crust)" value={newOption.name} onChange={e => setNewOption(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddOption()} style={{ ...inputStyle, flex: 2 }} />
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>₹</span>
                    <input type="number" min={0} placeholder="0" value={newOption.price} onChange={e => setNewOption(p => ({ ...p, price: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddOption()} style={{ ...inputStyle, paddingLeft: 28 }} />
                  </div>
                  <button onClick={handleAddOption} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}><Plus size={14} /> Add</button>
                </div>
                {(options[selectedGroupId] || []).length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 40 }}>No options yet. Add some above.</p>}
                {(options[selectedGroupId] || []).map((opt, idx) => (
                  <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, marginBottom: 8, border: '1px solid var(--glass-border)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, width: 20, textAlign: 'center' }}>{idx + 1}</span>
                    <input value={opt.name} onChange={e => handleUpdateOption(opt, 'name', e.target.value)} onBlur={e => supabase.from('addon_options').update({ name: e.target.value }).eq('id', opt.id)} style={{ ...inputStyle, flex: 2, padding: '8px 12px' }} />
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                      <input type="number" min={0} value={opt.price} onChange={e => handleUpdateOption(opt, 'price', e.target.value)} onBlur={e => supabase.from('addon_options').update({ price: Number(e.target.value) }).eq('id', opt.id)} style={{ ...inputStyle, paddingLeft: 26, padding: '8px 12px 8px 26px' }} />
                    </div>
                    <div onClick={() => handleUpdateOption(opt, 'is_available', !opt.is_available)} style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: opt.is_available ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: opt.is_available ? '#22c55e' : '#ef4444' }}>
                      {opt.is_available ? 'ON' : 'OFF'}
                    </div>
                    <button onClick={() => handleDeleteOption(opt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign Tab */}
          {activeRightTab === 'assign' && (
            <div className="glass-card" style={{ borderRadius: 20, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Assign to Items or Categories</h4>
                <input placeholder="Search items or categories..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} style={{ ...inputStyle, marginTop: 12 }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>By Category</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {categories.filter(c => !assignSearch || c.toLowerCase().includes(assignSearch.toLowerCase())).map(cat => (
                    <div key={cat} onClick={() => handleToggleCategoryAssign(cat)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: isAssignedToCategory(cat) ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', border: isAssignedToCategory(cat) ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent', color: isAssignedToCategory(cat) ? 'var(--primary)' : 'var(--text-secondary)' }}>
                      <Tag size={12} />{cat}{isAssignedToCategory(cat) && <X size={12} />}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>By Specific Item</p>
                {filteredItems.map(item => (
                  <div key={item.id} onClick={() => handleToggleItemAssign(item)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 12, marginBottom: 6, cursor: 'pointer', background: isAssignedToItem(item.id) ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', border: isAssignedToItem(item.id) ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent' }}>
                    <div><span style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{item.category}</span></div>
                    {isAssignedToItem(item.id) ? <CheckCircle size={18} style={{ color: 'var(--primary)' }} /> : <Plus size={18} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card" style={{ flex: 1, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <Sliders size={48} style={{ opacity: 0.2 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Select a group to manage its options and assignments</p>
        </div>
      )}
    </div>
  );
}
