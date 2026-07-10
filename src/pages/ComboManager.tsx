import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { Plus, Trash2, Edit2, X, Loader2, Package, Upload, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react';

const COMBO_CATEGORIES = ['Snacks Combo', 'Family Combo', 'Beverage Combo', 'Premium Combo'];

export default function ComboManager({ user }: { user: any }) {
  const [combos, setCombos] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const emptyForm = {
    name: '', description: '', price: '', originalPrice: '',
    category: 'Snacks Combo', imageUrl: '', cinemaId: user?.cinema_id || '', applyGst: true, isVeg: true,
    selectedItems: [] as { foodItemId: string; foodItemName: string; foodItemPrice: number; quantity: number }[]
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    setLoading(true);
    let comboQ = supabase.from('combos').select('*, combo_items(*)').order('created_at', { ascending: false });
    let menuQ = supabase.from('food_items').select('id, name, price, category');
    if (user?.role === 'OUTLET_MANAGER' && user?.cinema_id) {
      comboQ = comboQ.or(`cinema_id.eq.${user.cinema_id},cinema_id.is.null`);
      menuQ = menuQ.or(`cinema_id.eq.${user.cinema_id},cinema_id.is.null`);
    }
    const [{ data: combosData }, { data: menuData }] = await Promise.all([comboQ, menuQ]);
    if (combosData) setCombos(combosData);
    if (menuData) setMenuItems(menuData);
    setLoading(false);
  };

  const triggerCacheInvalidation = async (cinemaId?: string | null) => {
    try {
        await fetch(`${API_BASE_URL}/api/menu/invalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cinemaId: cinemaId || user?.cinema_id })
        });
    } catch (e) {
        console.error("Cache invalidation failed:", e);
    }
  };

  const resetForm = () => { setForm(emptyForm); setIsEditing(false); setCurrentId(null); };

  const handleEdit = (combo: any) => {
    setForm({
      name: combo.name, description: combo.description || '',
      price: combo.price.toString(), originalPrice: combo.original_price?.toString() || '',
      category: combo.category, imageUrl: combo.image_url || '',
      cinemaId: combo.cinema_id || user?.cinema_id || '',
      applyGst: combo.apply_gst !== false,
      isVeg: combo.is_veg !== false,
      selectedItems: (combo.combo_items || []).map((ci: any) => ({
        foodItemId: ci.food_item_id, foodItemName: ci.food_item_name,
        foodItemPrice: ci.food_item_price, quantity: ci.quantity
      }))
    });
    setIsEditing(true); setCurrentId(combo.id);
  };

  const addMenuItem = (item: any) => {
    if (form.selectedItems.find(i => i.foodItemId === item.id)) return;
    setForm(prev => ({
      ...prev,
      selectedItems: [...prev.selectedItems, { foodItemId: item.id, foodItemName: item.name, foodItemPrice: item.price, quantity: 1 }]
    }));
  };

  const updateItemQty = (foodItemId: string, delta: number) => {
    setForm(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(i =>
        i.foodItemId === foodItemId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
      )
    }));
  };

  const removeMenuItem = (foodItemId: string) => {
    setForm(prev => ({ ...prev, selectedItems: prev.selectedItems.filter(i => i.foodItemId !== foodItemId) }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `combos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('images').upload(path, file, { cacheControl: '0', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('images').getPublicUrl(path);
      setForm(prev => ({ ...prev, imageUrl: data.publicUrl }));
    } catch (err: any) { alert('Upload failed: ' + err.message); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.selectedItems.length === 0) { alert('Add at least one item to the combo.'); return; }
    // Duplicate check
    if (!isEditing) {
      const { data: existing } = await supabase.from('combos').select('id').eq('cinema_id', form.cinemaId).ilike('name', form.name).maybeSingle();
      if (existing) { alert(`A combo named "${form.name}" already exists for this outlet.`); return; }
    }
    setLoading(true);
    const payload = {
      cinema_id: form.cinemaId, name: form.name, description: form.description,
      price: parseFloat(form.price), original_price: form.originalPrice ? parseFloat(form.originalPrice) : null,
      category: form.category, image_url: form.imageUrl, apply_gst: form.applyGst, is_veg: form.isVeg
    };
    try {
      let comboId = currentId;
      if (isEditing && currentId) {
        await supabase.from('combos').update(payload).eq('id', currentId);
        await supabase.from('combo_items').delete().eq('combo_id', currentId);
      } else {
        const { data } = await supabase.from('combos').insert([payload]).select('id').single();
        comboId = data?.id;
      }
      const itemRows = form.selectedItems.map(i => ({
        combo_id: comboId, food_item_id: i.foodItemId,
        food_item_name: i.foodItemName, food_item_price: i.foodItemPrice, quantity: i.quantity
      }));
      await supabase.from('combo_items').insert(itemRows);
      resetForm(); 
      await triggerCacheInvalidation(form.cinemaId);
      fetchData();
    } catch (err: any) { alert('Error saving combo: ' + err.message); }
    setLoading(false);
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    await supabase.from('combos').update({ is_available: !current }).eq('id', id);
    await triggerCacheInvalidation(combos.find(c => c.id === id)?.cinema_id);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this combo? This cannot be undone.')) return;
    const cinemaId = combos.find(c => c.id === id)?.cinema_id;
    await supabase.from('combos').delete().eq('id', id);
    await triggerCacheInvalidation(cinemaId);
    fetchData();
  };

  const calcOriginalPrice = () => form.selectedItems.reduce((sum, i) => sum + i.foodItemPrice * i.quantity, 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: 'calc(100vh - 120px)' }}>
      <header>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>Combo Manager</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Create and manage outlet-specific combo meal deals.</p>
      </header>

      <div style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
        {/* Left: Combo list */}
        <div style={{ flex: 1.8, overflowY: 'auto', paddingRight: '8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto' }} /></div>
          ) : combos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', border: '1px dashed var(--glass-border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
              <Package size={40} opacity={0.3} style={{ marginBottom: '12px', margin: '0 auto 12px' }} />
              <p>No combos yet. Create your first combo deal!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {combos.map(combo => (
                <div key={combo.id} className="glass-card hover-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: combo.is_available ? 1 : 0.55 }}>
                  <div style={{ height: '140px', position: 'relative', background: 'var(--surface-container-high)' }}>
                    <img
                      src={combo.image_url || 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400'}
                      alt={combo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400'; }}
                    />
                    <div style={{ position: 'absolute', top: 10, left: 10, background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>🔥 COMBO DEAL</div>
                    {combo.original_price && combo.original_price > combo.price && (
                      <div style={{ position: 'absolute', top: 10, right: 10, background: '#4CAF50', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                        ₹{Math.round(combo.original_price - combo.price)} OFF
                      </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', gap: '6px', padding: '8px' }}>
                      <button onClick={() => handleEdit(combo)} style={{ flex: 1, background: 'rgba(0,0,0,0.7)', color: 'white', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Edit2 size={12} /> Edit</button>
                      <button onClick={() => toggleAvailability(combo.id, combo.is_available)} style={{ flex: 1, background: combo.is_available ? 'rgba(76,175,80,0.8)' : 'rgba(0,0,0,0.7)', color: 'white', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        {combo.is_available ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        {combo.is_available ? 'Live' : 'Off'}
                      </button>
                      <button onClick={() => handleDelete(combo.id)} style={{ background: 'rgba(211,47,47,0.7)', color: 'white', border: 'none', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div style={{ padding: '16px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{combo.name}</h3>
                      <div style={{ color: 'var(--secondary-orange)', fontWeight: 'bold' }}>₹{combo.price}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>{combo.category}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(combo.combo_items || []).map((ci: any, i: number) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                          <span style={{ color: '#FF6B35', fontWeight: 'bold' }}>{ci.quantity}×</span>
                          <span>{ci.food_item_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Form */}
        <div style={{ width: '380px' }}>
          <div className="glass-card animate-fade-in" style={{ padding: '28px', border: '1px solid rgba(255,107,53,0.2)', maxHeight: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '900' }}>{isEditing ? 'Edit Combo' : 'New Combo Deal'}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Bundle items at a special price</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Name */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Combo Name</label>
                <input className="input-premium" placeholder="e.g. Couple Combo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>

              {/* Category */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Category</label>
                <select className="input-premium" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ appearance: 'none' }}>
                  {COMBO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Price + Original Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Combo Price ₹</label>
                  <input type="number" className="input-premium" placeholder="499" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Original ₹</label>
                  <input type="number" className="input-premium" placeholder={calcOriginalPrice().toFixed(0)} value={form.originalPrice} onChange={e => setForm({ ...form, originalPrice: e.target.value })} />
                </div>
              </div>
              {calcOriginalPrice() > 0 && (
                <div style={{ fontSize: '11px', color: '#4CAF50', background: 'rgba(76,175,80,0.08)', padding: '6px 10px', borderRadius: '8px' }}>
                  📦 Items total: ₹{calcOriginalPrice().toFixed(0)} — Auto-fill original price above to show savings
                </div>
              )}

              {/* Description */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Description</label>
                <textarea className="input-premium" placeholder="Perfect for couples..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>

              {/* Image */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Combo Image</label>
                <div style={{ height: '90px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,107,53,0.3)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {uploading ? <Loader2 className="animate-spin" size={20} color="#FF6B35" /> : form.imageUrl ? <img src={form.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', opacity: 0.4 }}><Upload size={18} style={{ margin: '0 auto 4px' }} /><div style={{ fontSize: '10px' }}>Upload Image</div></div>}
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </div>
                <input className="input-premium" placeholder="or paste image URL..." value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} style={{ marginTop: '8px' }} />
              </div>

              {/* Apply GST & Veg Toggle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <input 
                        type="checkbox" 
                        id="applyGstCombo" 
                        checked={form.applyGst} 
                        onChange={e => setForm({...form, applyGst: e.target.checked})} 
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-red)' }} 
                    />
                    <label htmlFor="applyGstCombo" style={{ fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Apply GST</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                     <button 
                        type="button"
                        onClick={() => setForm({...form, isVeg: true})}
                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: form.isVeg ? '#4CAF50' : 'transparent', color: form.isVeg ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                     >VEG</button>
                     <button 
                        type="button"
                        onClick={() => setForm({...form, isVeg: false})}
                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: !form.isVeg ? '#D32F2F' : 'transparent', color: !form.isVeg ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                     >NON-VEG</button>
                </div>
              </div>

              {/* Item Selector */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Add Menu Items</label>
                <select className="input-premium" defaultValue="" onChange={e => { const item = menuItems.find(i => i.id === e.target.value); if (item) addMenuItem(item); e.target.value = ''; }} style={{ appearance: 'none' }}>
                  <option value="" disabled>— Select an item to add —</option>
                  {menuItems.map(item => <option key={item.id} value={item.id}>{item.name} (₹{item.price})</option>)}
                </select>
              </div>

              {/* Selected items */}
              {form.selectedItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {form.selectedItems.map(ci => (
                    <div key={ci.foodItemId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,107,53,0.06)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,107,53,0.15)' }}>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: '600' }}>{ci.foodItemName}</span>
                      <button type="button" onClick={() => updateItemQty(ci.foodItemId, -1)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontWeight: 'bold', minWidth: '16px', textAlign: 'center' }}>{ci.quantity}</span>
                      <button type="button" onClick={() => updateItemQty(ci.foodItemId, 1)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <button type="button" onClick={() => removeMenuItem(ci.foodItemId)} style={{ background: 'rgba(211,47,47,0.15)', border: 'none', color: '#ff4757', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                {isEditing && <button type="button" onClick={resetForm} style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}><X size={16} /></button>}
                <button type="submit" className="btn-lucrative" style={{ flex: 2, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  {isEditing ? 'UPDATE COMBO' : 'CREATE COMBO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
