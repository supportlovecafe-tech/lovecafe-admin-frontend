import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { X, Power, AlertTriangle, Search, Loader2, CheckCircle2, SlidersHorizontal, RefreshCw } from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  is_available: boolean;
  type: 'FOOD' | 'COMBO';
}

type FilterTab = 'ALL' | 'DISABLED' | 'AVAILABLE' | 'FOOD' | 'COMBO';

export const InventoryKillSwitch = ({ cinemaId, onClose }: { cinemaId: string; onClose: () => void }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fallback to localStorage session if cinemaId wasn't passed directly
  const effectiveCinemaId = useMemo(() => {
    if (cinemaId && cinemaId !== 'default') return cinemaId;
    try {
      const stored = localStorage.getItem('ce_admin_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.cinema_id) return parsed.cinema_id;
      }
    } catch (_) {}
    return cinemaId;
  }, [cinemaId]);

  useEffect(() => {
    fetchInventory();
  }, [effectiveCinemaId]);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      let foodQuery = supabase
        .from('food_items')
        .select('id, name, category, is_available')
        .order('name', { ascending: true });

      let comboQuery = supabase
        .from('combos')
        .select('id, name, category, is_available')
        .order('name', { ascending: true });

      if (effectiveCinemaId && effectiveCinemaId !== 'default') {
        foodQuery = foodQuery.or(`cinema_id.eq.${effectiveCinemaId},cinema_id.is.null`);
        comboQuery = comboQuery.or(`cinema_id.eq.${effectiveCinemaId},cinema_id.is.null`);
      }

      const overridesQuery = effectiveCinemaId && effectiveCinemaId !== 'default'
        ? supabase.from('outlet_item_availability').select('item_id, item_type, is_available').eq('cinema_id', effectiveCinemaId)
        : Promise.resolve({ data: [] });

      const [foodRes, comboRes, overridesRes] = await Promise.all([
        foodQuery,
        comboQuery,
        overridesQuery
      ]);

      const overrideMap = new Map<string, boolean>();
      ((overridesRes as any).data || []).forEach((row: any) => {
        overrideMap.set(`${row.item_type}:${row.item_id}`, row.is_available);
      });

      const foodItems: InventoryItem[] = (foodRes.data || []).map(i => {
        const key = `FOOD:${i.id}`;
        const isAvail = overrideMap.has(key) ? overrideMap.get(key)! : i.is_available;
        return { ...i, is_available: isAvail, type: 'FOOD' };
      });

      const comboItems: InventoryItem[] = (comboRes.data || []).map(i => {
        const key = `COMBO:${i.id}`;
        const isAvail = overrideMap.has(key) ? overrideMap.get(key)! : i.is_available;
        return { ...i, is_available: isAvail, type: 'COMBO' };
      });

      setItems([...foodItems, ...comboItems]);
    } catch (err) {
      console.error('Failed to fetch inventory items:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async (item: InventoryItem) => {
    if (updatingId === item.id) return;
    setUpdatingId(item.id);
    const newStatus = !item.is_available;

    // Optimistically update UI immediately
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));

    try {
      if (effectiveCinemaId && effectiveCinemaId !== 'default') {
        // Upsert into outlet_item_availability so ONLY this outlet is affected
        const { error } = await supabase
          .from('outlet_item_availability')
          .upsert({
            cinema_id: effectiveCinemaId,
            item_id: item.id,
            item_type: item.type,
            is_available: newStatus,
            updated_at: new Date().toISOString()
          }, { onConflict: 'cinema_id,item_id,item_type' });

        if (error) {
          console.warn('Override upsert failed, attempting fallback to base table:', error);
          const table = item.type === 'FOOD' ? 'food_items' : 'combos';
          await supabase
            .from(table)
            .update({ is_available: newStatus })
            .eq('id', item.id);
        }
      } else {
        const table = item.type === 'FOOD' ? 'food_items' : 'combos';
        await supabase
          .from(table)
          .update({ is_available: newStatus })
          .eq('id', item.id);
      }

      // Trigger Redis Cache Invalidation for this outlet
      if (effectiveCinemaId) {
        await fetch(`${API_BASE_URL}/api/menu/invalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cinemaId: effectiveCinemaId })
        }).catch(console.error);
      }
    } catch (err) {
      console.error('Error toggling availability:', err);
      // Revert optimistic update on failure
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !newStatus } : i));
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch = 
        i.name.toLowerCase().includes(search.toLowerCase()) || 
        i.category.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'DISABLED') return !i.is_available;
      if (activeTab === 'AVAILABLE') return i.is_available;
      if (activeTab === 'FOOD') return i.type === 'FOOD';
      if (activeTab === 'COMBO') return i.type === 'COMBO';
      return true;
    });
  }, [items, search, activeTab]);

  const disabledCount = useMemo(() => items.filter(i => !i.is_available).length, [items]);
  const availableCount = useMemo(() => items.filter(i => i.is_available).length, [items]);

  const modalContent = (
    <div 
      onClick={onClose}
      style={{ 
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh', 
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{ 
          width: '100%',
          maxWidth: '680px',
          height: '84vh',
          maxHeight: '760px',
          minHeight: '460px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #161822 0%, #0d0f18 100%)',
          border: '1.5px solid rgba(255, 47, 146, 0.35)',
          borderRadius: '24px',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.9), 0 0 40px rgba(255, 47, 146, 0.15)',
          overflow: 'hidden',
          boxSizing: 'border-box',
          color: '#ffffff'
        }}
      >
        {/* ─── Modal Header ─── */}
        <div style={{ 
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ 
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(255, 47, 146, 0.25) 0%, rgba(255, 47, 146, 0.1) 100%)',
              border: '1px solid rgba(255, 47, 146, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-glow)',
              boxShadow: '0 0 15px rgba(255, 47, 146, 0.25)'
            }}>
              <Power size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, letterSpacing: '-0.5px', color: '#ffffff' }}>
                  Inventory Kill Switch
                </h2>
                {disabledCount > 0 && (
                  <span style={{ 
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#f87171',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    letterSpacing: '0.5px'
                  }}>
                    {disabledCount} DISABLED
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Instantly enable or disable items for customer orders at this outlet.
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ 
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Search & Filter Bar ─── */}
        <div style={{ 
          padding: '14px 20px',
          background: 'rgba(0, 0, 0, 0.35)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          flexShrink: 0
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search 
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} 
              size={18} 
            />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items by name or category (e.g. Popcorn, Burger)..."
              style={{ 
                width: '100%',
                padding: '12px 14px 12px 42px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'white',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '4px'
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === 'ALL' ? '1px solid var(--primary-glow)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === 'ALL' ? 'rgba(255, 47, 146, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'ALL' ? '#ffffff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              All Items ({items.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('DISABLED')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === 'DISABLED' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === 'DISABLED' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'DISABLED' ? '#f87171' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              🚫 Disabled ({disabledCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('AVAILABLE')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === 'AVAILABLE' ? '1px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === 'AVAILABLE' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'AVAILABLE' ? '#4ade80' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ✓ Active ({availableCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('FOOD')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === 'FOOD' ? '1px solid rgba(255, 47, 146, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === 'FOOD' ? 'rgba(255, 47, 146, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'FOOD' ? 'var(--primary-glow)' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Food
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('COMBO')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === 'COMBO' ? '1px solid rgba(255, 179, 106, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === 'COMBO' ? 'rgba(255, 179, 106, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'COMBO' ? 'var(--accent-gold)' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Combos
            </button>
          </div>
        </div>

        {/* ─── Scrollable Items Container ─── */}
        <div style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          boxSizing: 'border-box'
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px', color: 'var(--text-muted)' }}>
              <Loader2 className="animate-spin" size={32} color="var(--primary-glow)" />
              <div style={{ fontSize: '14px' }}>Loading menu items for this outlet...</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ 
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}>
              <AlertTriangle size={36} style={{ opacity: 0.4, color: 'var(--accent-gold)' }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>No items found</div>
              <div style={{ fontSize: '13px', maxWidth: '300px' }}>
                {search ? `No items match "${search}". Try clearing search.` : 'No items found under this filter.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredItems.map(item => {
                const isAvail = item.is_available;
                const isUpdating = updatingId === item.id;

                return (
                  <div 
                    key={item.id} 
                    style={{ 
                      padding: '14px 18px',
                      borderRadius: '16px',
                      background: isAvail ? 'rgba(255, 255, 255, 0.03)' : 'rgba(239, 68, 68, 0.06)', 
                      border: isAvail ? '1px solid rgba(255, 255, 255, 0.07)' : '1.5px solid rgba(239, 68, 68, 0.35)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Item Details */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ 
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 7px',
                          background: item.type === 'COMBO' ? 'rgba(255, 179, 106, 0.2)' : 'rgba(255, 47, 146, 0.2)',
                          color: item.type === 'COMBO' ? 'var(--accent-gold)' : 'var(--primary-glow)',
                          border: item.type === 'COMBO' ? '1px solid rgba(255, 179, 106, 0.4)' : '1px solid rgba(255, 47, 146, 0.4)',
                          borderRadius: '6px'
                        }}>
                          {item.type}
                        </span>

                        <span style={{ 
                          fontWeight: 700,
                          fontSize: '15px',
                          color: isAvail ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                          textDecoration: isAvail ? 'none' : 'line-through'
                        }}>
                          {item.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {item.category || 'General'}
                        </span>
                        <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
                        <span style={{ 
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isAvail ? '#4ade80' : '#f87171'
                        }}>
                          {isAvail ? 'Live on Menu' : 'Unavailable / Out of Stock'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Toggle Button */}
                    <button 
                      type="button"
                      onClick={() => toggleAvailability(item)}
                      disabled={isUpdating}
                      style={{ 
                        padding: '10px 18px',
                        borderRadius: '12px',
                        cursor: isUpdating ? 'not-allowed' : 'pointer',
                        background: isAvail 
                          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(34, 197, 94, 0.08) 100%)' 
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.12) 100%)',
                        color: isAvail ? '#4ade80' : '#f87171',
                        border: isAvail ? '1.5px solid rgba(34, 197, 94, 0.45)' : '1.5px solid rgba(239, 68, 68, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 800,
                        fontSize: '12px',
                        letterSpacing: '0.5px',
                        transition: 'all 0.2s ease',
                        flexShrink: 0,
                        minWidth: '120px',
                        justifyContent: 'center',
                        boxShadow: isAvail ? '0 2px 10px rgba(34, 197, 94, 0.1)' : '0 2px 10px rgba(239, 68, 68, 0.15)'
                      }}
                    >
                      {isUpdating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Power size={14} />
                      )}
                      <span>{isAvail ? 'AVAILABLE' : 'DISABLED'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Sticky Footer Bar ─── */}
        <div style={{ 
          padding: '14px 24px',
          background: 'rgba(0, 0, 0, 0.45)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: '#fff' }}>{filteredItems.length}</strong> of <strong style={{ color: '#fff' }}>{items.length}</strong> items
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-lucrative"
            style={{
              padding: '10px 24px',
              fontSize: '13px',
              borderRadius: '12px'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  // Mount into document.body using portal so no parent transforms/overflows ever crop it
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
