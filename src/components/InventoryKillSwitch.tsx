import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { X, Power, AlertTriangle, Search, Loader2 } from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  is_available: boolean;
  type: 'FOOD' | 'COMBO';
}

export const InventoryKillSwitch = ({ cinemaId, onClose }: { cinemaId: string, onClose: () => void }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
  }, [cinemaId]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const [foodRes, comboRes] = await Promise.all([
        supabase.from('food_items').select('id, name, category, is_available').eq('cinema_id', cinemaId),
        supabase.from('combos').select('id, name, category, is_available').eq('cinema_id', cinemaId)
      ]);

      const foodItems: InventoryItem[] = (foodRes.data || []).map(i => ({ ...i, type: 'FOOD' }));
      const comboItems: InventoryItem[] = (comboRes.data || []).map(i => ({ ...i, type: 'COMBO' }));

      setItems([...foodItems, ...comboItems]);
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async (item: InventoryItem) => {
    setUpdatingId(item.id);
    const table = item.type === 'FOOD' ? 'food_items' : 'combos';
    const newStatus = !item.is_available;

    try {
      const { error } = await supabase
        .from(table)
        .update({ is_available: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));

      // Trigger Redis Cache Invalidation via Backend API
      await fetch(`${API_BASE_URL}/api/menu/invalidate?cinemaId=${cinemaId}`, { method: 'POST' }).catch(console.error);

    } finally {
      setUpdatingId(null);
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ 
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 
    }}>
      <div className="glass-card" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--primary-glow)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Power size={24} /> Inventory Kill Switch
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Instantly disable unavailable items for customers.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X /></button>
        </div>

        <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items or categories..."
              style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredItems.map(item => (
                <div key={item.id} style={{ 
                  padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', background: item.type === 'COMBO' ? 'var(--accent-gold)' : 'var(--primary-glow)', borderRadius: '4px', color: 'black' }}>{item.type}</span>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.category}</div>
                  </div>
                  
                  <button 
                    onClick={() => toggleAvailability(item)}
                    disabled={updatingId === item.id}
                    style={{ 
                      padding: '8px 20px', borderRadius: '12px', cursor: 'pointer',
                      background: item.is_available ? 'rgba(76,175,80,0.1)' : 'rgba(244, 67, 54, 0.1)',
                      color: item.is_available ? '#4CAF50' : '#F44336',
                      border: `1px solid ${item.is_available ? '#4CAF5040' : '#F4433640'}`,
                      display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {updatingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                    {item.is_available ? 'AVAILABLE' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && filteredItems.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <AlertTriangle size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p>No items found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};
