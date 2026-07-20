import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Trash2, Edit2, CheckCircle, X, Loader2, Archive, Settings2, History, AlertTriangle, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { Database } from '../lib/database.types';

type InventoryItem = {
  id: string;
  cinema_id: string;
  item_name: string;
  sku: string;
  stock_quantity: number;
  unit: string;
  min_stock_level: number;
  created_at: string;
  updated_at: string;
  cinemas?: { name: string } | null;
};

type ProductMapping = {
  id: string;
  cinema_id: string;
  food_item_id: string | null;
  combo_id: string | null;
  inventory_item_id: string;
  quantity_needed: number;
  created_at: string;
  inventory_items?: { item_name: string; unit: string } | null;
};

type Transaction = {
  id: string;
  cinema_id: string;
  inventory_item_id: string;
  quantity_changed: number;
  transaction_type: 'STOCK_IN' | 'SALE' | 'MANUAL_ADJUSTMENT';
  order_id: string | null;
  description: string | null;
  created_at: string;
  inventory_items?: { item_name: string; unit: string } | null;
};

type FoodItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  is_available: boolean;
};

type Combo = {
  id: string;
  name: string;
  category: string;
  price: number;
  is_available: boolean;
};

type Cinema = {
  id: string;
  name: string;
  location: string;
};

export default function InventoryManager({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'status' | 'mapping' | 'transactions'>('status');
  const [loading, setLoading] = useState(true);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState<string>(user?.cinema_id || '');
  
  // Data States
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [mappingSearchTerm, setMappingSearchTerm] = useState('');

  // Modals & Panels
  const [showItemForm, setShowItemForm] = useState(false);
  const [showStockInForm, setShowStockInForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);

  // Form States
  const [itemFormData, setItemFormData] = useState({
    item_name: '',
    sku: '',
    stock_quantity: '0',
    unit: 'pcs',
    min_stock_level: '10'
  });
  const [stockInQuantity, setStockInQuantity] = useState('50');
  const [stockInNotes, setStockInNotes] = useState('Supplier Stock In');

  // Mapping Workspace States
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; isCombo: boolean } | null>(null);
  const [newMappingItem, setNewMappingItem] = useState('');
  const [newMappingQty, setNewMappingQty] = useState('1');

  useEffect(() => {
    fetchCinemas();
  }, []);

  useEffect(() => {
    if (selectedCinemaId) {
      fetchData();
    }
  }, [selectedCinemaId]);

  const fetchCinemas = async () => {
    const { data } = await supabase.from('cinemas').select('id, name, location');
    if (data) {
      setCinemas(data);
      if (!selectedCinemaId && data.length > 0) {
        setSelectedCinemaId(data[0].id);
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, mapRes, txRes, foodRes, comboRes] = await Promise.all([
        supabase.from('inventory_items').select('*, cinemas(name)').eq('cinema_id', selectedCinemaId).order('item_name'),
        supabase.from('product_inventory_mappings').select('*, inventory_items(item_name, unit)').eq('cinema_id', selectedCinemaId),
        supabase.from('inventory_transactions').select('*, inventory_items(item_name, unit)').eq('cinema_id', selectedCinemaId).order('created_at', { ascending: false }).limit(200),
        supabase.from('food_items').select('id, name, category, price, is_available').or(`cinema_id.eq.${selectedCinemaId},cinema_id.is.null`),
        supabase.from('combos').select('id, name, price, is_available').eq('cinema_id', selectedCinemaId)
      ]);

      if (invRes.data) setInventory(invRes.data as InventoryItem[]);
      if (mapRes.data) setMappings(mapRes.data as ProductMapping[]);
      if (txRes.data) setTransactions(txRes.data as Transaction[]);
      if (foodRes.data) setFoodItems(foodRes.data as FoodItem[]);
      if (comboRes.data) {
        const mappedCombos = comboRes.data.map(c => ({
          ...c,
          category: 'Combo Deal'
        }));
        setCombos(mappedCombos);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Stock In submission
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInItem) return;

    const qty = parseFloat(stockInQuantity);
    if (isNaN(qty) || qty <= 0) return;

    try {
      // 1. Log transaction
      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        cinema_id: selectedCinemaId,
        inventory_item_id: stockInItem.id,
        quantity_changed: qty,
        transaction_type: 'STOCK_IN',
        description: stockInNotes
      });
      if (txErr) throw txErr;

      // 2. Increment stock
      const { error: invErr } = await supabase.from('inventory_items').update({
        stock_quantity: stockInItem.stock_quantity + qty,
        updated_at: new Date().toISOString()
      }).eq('id', stockInItem.id);
      if (invErr) throw invErr;

      setShowStockInForm(false);
      setStockInItem(null);
      fetchData();
    } catch (err) {
      alert('Failed to stock in item: ' + (err as any).message);
    }
  };

  // Add / Edit item submission
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(itemFormData.stock_quantity);
    const minLvl = parseFloat(itemFormData.min_stock_level);

    if (!itemFormData.item_name) return;

    try {
      if (editingItem) {
        // Edit Item
        const { error } = await supabase.from('inventory_items').update({
          item_name: itemFormData.item_name,
          sku: itemFormData.sku,
          stock_quantity: qty,
          unit: itemFormData.unit,
          min_stock_level: minLvl,
          updated_at: new Date().toISOString()
        }).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        // Add Item
        const { data, error } = await supabase.from('inventory_items').insert({
          cinema_id: selectedCinemaId,
          item_name: itemFormData.item_name,
          sku: itemFormData.sku,
          stock_quantity: qty,
          unit: itemFormData.unit,
          min_stock_level: minLvl
        }).select().single();
        if (error) throw error;

        // Log initial stock as manual adjustment if > 0
        if (qty > 0 && data) {
          await supabase.from('inventory_transactions').insert({
            cinema_id: selectedCinemaId,
            inventory_item_id: data.id,
            quantity_changed: qty,
            transaction_type: 'MANUAL_ADJUSTMENT',
            description: 'Initial stock setup'
          });
        }
      }

      setShowItemForm(false);
      setEditingItem(null);
      setItemFormData({ item_name: '', sku: '', stock_quantity: '0', unit: 'pcs', min_stock_level: '10' });
      fetchData();
    } catch (err) {
      alert('Failed to save item: ' + (err as any).message);
    }
  };

  // Delete inventory item
  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inventory item? This will also remove all associated mappings and history.')) return;
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Failed to delete item: ' + (err as any).message);
    }
  };

  // Add Product Mapping
  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !newMappingItem || !newMappingQty) return;

    const qty = parseFloat(newMappingQty);
    if (isNaN(qty) || qty <= 0) return;

    try {
      const { error } = await supabase.from('product_inventory_mappings').insert({
        cinema_id: selectedCinemaId,
        food_item_id: selectedProduct.isCombo ? null : selectedProduct.id,
        combo_id: selectedProduct.isCombo ? selectedProduct.id : null,
        inventory_item_id: newMappingItem,
        quantity_needed: qty
      });
      if (error) throw error;

      setNewMappingItem('');
      setNewMappingQty('1');
      fetchData();
    } catch (err) {
      alert('Failed to create mapping: ' + (err as any).message);
    }
  };

  // Delete product mapping
  const handleDeleteMapping = async (id: string) => {
    try {
      const { error } = await supabase.from('product_inventory_mappings').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Failed to delete mapping: ' + (err as any).message);
    }
  };

  // Filtering states
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => 
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [inventory, searchTerm]);

  const allProducts = useMemo(() => {
    const foodsMapped = foodItems.map(f => ({ id: f.id, name: f.name, category: f.category, isCombo: false }));
    const combosMapped = combos.map(c => ({ id: c.id, name: c.name, category: 'Combo Deals', isCombo: true }));
    return [...foodsMapped, ...combosMapped].filter(p => 
      p.name.toLowerCase().includes(mappingSearchTerm.toLowerCase())
    );
  }, [foodItems, combos, mappingSearchTerm]);

  // Analytics helper metrics
  const stats = useMemo(() => {
    const total = inventory.length;
    const lowStock = inventory.filter(i => i.stock_quantity > 0 && i.stock_quantity <= i.min_stock_level).length;
    const outOfStock = inventory.filter(i => i.stock_quantity <= 0).length;
    return { total, lowStock, outOfStock };
  }, [inventory]);

  return (
    <div style={{ padding: '0 20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Inventory Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Manage warehouse raw stock, map recipes, and audit real-time order deductions.
          </p>
        </div>

        {/* Outlet Selector (Super Admin Only) */}
        {user?.role === 'SUPER_ADMIN' && cinemas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>Active Outlet:</span>
            <select
              value={selectedCinemaId}
              onChange={(e) => setSelectedCinemaId(e.target.value)}
              className="input-premium"
              style={{ padding: '8px 16px', borderRadius: 12, minWidth: 200, width: 'auto', background: 'rgba(255,255,255,0.04)' }}
            >
              {cinemas.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.location})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 28 }}>
        <button
          onClick={() => setActiveTab('status')}
          className={`tab-btn ${activeTab === 'status' ? 'active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none', color: activeTab === 'status' ? 'var(--primary-glow)' : 'var(--text-muted)', borderBottom: activeTab === 'status' ? '2px solid var(--primary-glow)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <Archive size={16} /> Stock Status
        </button>
        <button
          onClick={() => setActiveTab('mapping')}
          className={`tab-btn ${activeTab === 'mapping' ? 'active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none', color: activeTab === 'mapping' ? 'var(--primary-glow)' : 'var(--text-muted)', borderBottom: activeTab === 'mapping' ? '2px solid var(--primary-glow)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <Layers size={16} /> Product Mapping
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none', color: activeTab === 'transactions' ? 'var(--primary-glow)' : 'var(--text-muted)', borderBottom: activeTab === 'transactions' ? '2px solid var(--primary-glow)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <History size={16} /> Stock Log
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <Loader2 className="spinner" size={40} style={{ color: 'var(--primary-glow)' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Loading inventory database...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: STOCK STATUS */}
          {activeTab === 'status' && (
            <div>
              {/* Analytics summary widgets */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 28 }}>
                <div className="glass-card" style={{ padding: 24, borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Total Items</div>
                  <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8, color: 'white' }}>{stats.total}</div>
                </div>
                <div className="glass-card" style={{ padding: 24, borderRadius: 20, border: '1px solid rgba(255,47,146,0.1)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Low Stock Warning</div>
                  <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8, color: '#ff9f43', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {stats.lowStock}
                    {stats.lowStock > 0 && <AlertTriangle size={24} color="#ff9f43" />}
                  </div>
                </div>
                <div className="glass-card" style={{ padding: 24, borderRadius: 20, border: '1px solid rgba(255,0,0,0.1)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Out of Stock</div>
                  <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8, color: '#ff4d4d' }}>{stats.outOfStock}</div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search stock items by name or SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-premium"
                    style={{ paddingLeft: 48, borderRadius: 16 }}
                  />
                </div>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setItemFormData({ item_name: '', sku: '', stock_quantity: '0', unit: 'pcs', min_stock_level: '10' });
                    setShowItemForm(true);
                  }}
                  className="btn-lucrative"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 16, flexShrink: 0 }}
                >
                  <Plus size={18} /> New Item
                </button>
              </div>

              {/* Stock Inventory Table */}
              <div className="glass-card" style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>Item Name</th>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>SKU</th>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>Current Stock</th>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>Min Stock level</th>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                          No stock items found. Add items to track your outlet inventory.
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map(item => {
                        const isOut = item.stock_quantity <= 0;
                        const isLow = item.stock_quantity > 0 && item.stock_quantity <= item.min_stock_level;
                        let statusBadge = (
                          <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(46,213,115,0.1)', color: '#2ed573' }}>
                            In Stock
                          </span>
                        );
                        if (isOut) {
                          statusBadge = (
                            <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                              Out of Stock
                            </span>
                          );
                        } else if (isLow) {
                          statusBadge = (
                            <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(255,159,67,0.1)', color: '#ff9f43' }}>
                              Low Stock
                            </span>
                          );
                        }

                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '18px 24px', fontSize: 14, fontWeight: 700, color: 'white' }}>{item.item_name}</td>
                            <td style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text-muted)' }}>{item.sku || '—'}</td>
                            <td style={{ padding: '18px 24px', fontSize: 15, fontWeight: 800, color: isOut ? '#ff4d4d' : isLow ? '#ff9f43' : 'white' }}>
                              {item.stock_quantity} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>{item.unit}</span>
                            </td>
                            <td style={{ padding: '18px 24px', fontSize: 14, color: 'var(--text-muted)' }}>
                              {item.min_stock_level} {item.unit}
                            </td>
                            <td style={{ padding: '18px 24px' }}>{statusBadge}</td>
                            <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => {
                                    setStockInItem(item);
                                    setStockInQuantity('50');
                                    setStockInNotes('Supplier Stock In');
                                    setShowStockInForm(true);
                                  }}
                                  className="btn-glass"
                                  style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  <ArrowUpRight size={14} /> Stock In
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingItem(item);
                                    setItemFormData({
                                      item_name: item.item_name,
                                      sku: item.sku || '',
                                      stock_quantity: item.stock_quantity.toString(),
                                      unit: item.unit,
                                      min_stock_level: item.min_stock_level.toString()
                                    });
                                    setShowItemForm(true);
                                  }}
                                  className="btn-glass"
                                  style={{ padding: 6, borderRadius: 8 }}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="btn-glass"
                                  style={{ padding: 6, borderRadius: 8, color: '#ff4d4d' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCT TO INVENTORY MAPPING */}
          {activeTab === 'mapping' && (
            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 28 }}>
              {/* Left Column: Product Selection */}
              <div className="glass-card" style={{ padding: 20, borderRadius: 24, border: '1px solid rgba(255,255,255,0.06)', height: 'fit-content' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px 0', color: 'white' }}>Sellable Products</h3>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search menu or combos..."
                    value={mappingSearchTerm}
                    onChange={(e) => setMappingSearchTerm(e.target.value)}
                    className="input-premium"
                    style={{ paddingLeft: 42, borderRadius: 12, fontSize: 13, height: 40 }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', paddingRight: 6 }}>
                  {allProducts.map(p => {
                    const isSelected = selectedProduct?.id === p.id && selectedProduct?.isCombo === p.isCombo;
                    return (
                      <button
                        key={`${p.isCombo ? 'c' : 'f'}-${p.id}`}
                        onClick={() => setSelectedProduct(p)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer', textAlign: 'left',
                          background: isSelected ? 'rgba(255,47,146,0.1)' : 'rgba(255,255,255,0.02)',
                          color: isSelected ? 'var(--primary-glow)' : 'white',
                          borderColor: isSelected ? 'rgba(255,47,146,0.3)' : 'transparent',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{p.category}</div>
                        </div>
                        {p.isCombo && (
                          <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                            Combo
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Mapping configuration workspace */}
              <div>
                {selectedProduct ? (
                  <div className="glass-card" style={{ padding: 28, borderRadius: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div>
                        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>
                          Deduction Mapping: <span style={{ color: 'var(--primary-glow)' }}>{selectedProduct.name}</span>
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                          Define which raw warehouse stock items are automatically deducted when 1 unit of this product is sold.
                        </p>
                      </div>
                    </div>

                    {/* Mappings Table */}
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Mapped Ingredients / Elements</div>
                      {mappings.filter(m => 
                        (selectedProduct.isCombo === false && m.food_item_id === selectedProduct.id) ||
                        (selectedProduct.isCombo === true && m.combo_id === selectedProduct.id)
                      ).length === 0 ? (
                        <div style={{ padding: '30px 20px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                          This product does not deduct any inventory items yet. Add stock mappings below.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {mappings.filter(m => 
                            (selectedProduct.isCombo === false && m.food_item_id === selectedProduct.id) ||
                            (selectedProduct.isCombo === true && m.combo_id === selectedProduct.id)
                          ).map(m => (
                            <div
                              key={m.id}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Archive size={16} color="var(--primary-glow)" />
                                <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{m.inventory_items?.item_name || 'Stock Item'}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>
                                  Deduct: {m.quantity_needed} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>{m.inventory_items?.unit}</span>
                                </span>
                                <button
                                  onClick={() => handleDeleteMapping(m.id)}
                                  className="btn-glass"
                                  style={{ padding: 6, borderRadius: 8, color: '#ff4d4d' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Mapping Form */}
                    <form onSubmit={handleAddMapping} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Map New Inventory Item</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 16, alignItems: 'end' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Select Stock Item</label>
                          <select
                            value={newMappingItem}
                            onChange={(e) => setNewMappingItem(e.target.value)}
                            className="input-premium"
                            required
                          >
                            <option value="">-- Choose Stock Item --</option>
                            {inventory.map(item => (
                              <option key={item.id} value={item.id}>{item.item_name} ({item.unit})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Deduction Qty</label>
                          <input
                            type="number"
                            step="any"
                            value={newMappingQty}
                            onChange={(e) => setNewMappingQty(e.target.value)}
                            className="input-premium"
                            required
                            min="0.001"
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-lucrative"
                          style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, height: '100%' }}
                        >
                          <Plus size={16} /> Link Item
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 350, border: '2px dashed rgba(255,255,255,0.06)', borderRadius: 24, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Settings2 size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>No Product Selected</h3>
                    <p style={{ fontSize: 13, marginTop: 6, maxWidth: 300 }}>
                      Select a sellable product or combo from the sidebar to configure its warehouse stock mapping.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TRANSACTION LOG */}
          {activeTab === 'transactions' && (
            <div className="glass-card" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Real-Time Inventory Movement Log</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Audit trail of additions, sales, and manual adjustments.</p>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Timestamp</th>
                    <th style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Stock Item</th>
                    <th style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Type</th>
                    <th style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Quantity</th>
                    <th style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map(tx => {
                      const isAddition = tx.quantity_changed > 0;
                      let typeBadge = (
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(46,213,115,0.1)', color: '#2ed573' }}>
                          STOCK IN
                        </span>
                      );
                      if (tx.transaction_type === 'SALE') {
                        typeBadge = (
                          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                            SALE DEDUCT
                          </span>
                        );
                      } else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') {
                        typeBadge = (
                          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(255,159,67,0.1)', color: '#ff9f43' }}>
                            ADJUSTMENT
                          </span>
                        );
                      }

                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text-muted)' }}>
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 700, color: 'white' }}>
                            {tx.inventory_items?.item_name || 'Deleted Item'}
                          </td>
                          <td style={{ padding: '16px 24px' }}>{typeBadge}</td>
                          <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 800, color: isAddition ? '#2ed573' : '#ff4d4d', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isAddition ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                            {tx.quantity_changed > 0 ? '+' : ''}{tx.quantity_changed} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{tx.inventory_items?.unit}</span>
                          </td>
                          <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text-muted)' }}>
                            {tx.description || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Item Form Modal (Add / Edit) */}
      {showItemForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: 450, padding: 32, borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>
                {editingItem ? 'Edit Stock Item' : 'New Stock Item'}
              </h3>
              <button onClick={() => setShowItemForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleItemSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Item Name *</label>
                  <input
                    type="text"
                    value={itemFormData.item_name}
                    onChange={(e) => setItemFormData({ ...itemFormData, item_name: e.target.value })}
                    className="input-premium"
                    placeholder="e.g. Popcorn Bucket Large"
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>SKU</label>
                    <input
                      type="text"
                      value={itemFormData.sku}
                      onChange={(e) => setItemFormData({ ...itemFormData, sku: e.target.value })}
                      className="input-premium"
                      placeholder="e.g. PC-LG-BKT"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Unit</label>
                    <select
                      value={itemFormData.unit}
                      onChange={(e) => setItemFormData({ ...itemFormData, unit: e.target.value })}
                      className="input-premium"
                    >
                      <option value="pcs">pcs (pieces)</option>
                      <option value="kg">kg (kilograms)</option>
                      <option value="g">grams</option>
                      <option value="liters">liters</option>
                      <option value="ml">ml (milliliters)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Initial Stock</label>
                    <input
                      type="number"
                      step="any"
                      value={itemFormData.stock_quantity}
                      onChange={(e) => setItemFormData({ ...itemFormData, stock_quantity: e.target.value })}
                      className="input-premium"
                      required
                      min="0"
                      disabled={!!editingItem} // Disable stock modification directly from edit; use Stock In instead
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Min Stock Alert</label>
                    <input
                      type="number"
                      step="any"
                      value={itemFormData.min_stock_level}
                      onChange={(e) => setItemFormData({ ...itemFormData, min_stock_level: e.target.value })}
                      className="input-premium"
                      required
                      min="0"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowItemForm(false)}
                    className="btn-glass"
                    style={{ flex: 1, padding: '12px 0', borderRadius: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-lucrative"
                    style={{ flex: 1, padding: '12px 0', borderRadius: 12 }}
                  >
                    Save Stock
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock In Form Modal */}
      {showStockInForm && stockInItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: 400, padding: 32, borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>Stock In</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Add inventory to: {stockInItem.item_name}</p>
              </div>
              <button onClick={() => setShowStockInForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleStockInSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Quantity to Add ({stockInItem.unit}) *</label>
                  <input
                    type="number"
                    step="any"
                    value={stockInQuantity}
                    onChange={(e) => setStockInQuantity(e.target.value)}
                    className="input-premium"
                    required
                    min="0.001"
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Notes / Supplier</label>
                  <input
                    type="text"
                    value={stockInNotes}
                    onChange={(e) => setStockInNotes(e.target.value)}
                    className="input-premium"
                    placeholder="e.g. Supplier invoice #1042"
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowStockInForm(false)}
                    className="btn-glass"
                    style={{ flex: 1, padding: '12px 0', borderRadius: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-lucrative"
                    style={{ flex: 1, padding: '12px 0', borderRadius: 12 }}
                  >
                    Stock In
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
