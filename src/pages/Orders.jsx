import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, 
  Search, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Download, 
  X, 
  ListFilter, 
  Phone, 
  Trash2, 
  Store, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Filter,
  Clock
} from 'lucide-react';
import { 
  getCinemaCycleStart, 
  getCinemaCycleEnd, 
  getCurrentCinemaBusinessDate, 
  getCinemaCycleDescription 
} from '../lib/cinemaDate';
import { getPaymentDisplayInfo } from '../lib/paymentUtils';
import { applyOrderSearch } from '../lib/orderSearch';

export default function Orders({ user }) {
  // Outlets State
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  // Orders State
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState('all');

  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Double-Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1); // 1 or 2
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Debounce search input for instant, non-blocking response
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 450);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  // 1. Fetch Outlets on Mount
  useEffect(() => {
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    setLoadingOutlets(true);
    try {
      const { data, error } = await supabase
        .from('cinemas')
        .select('id, name, location, is_active')
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        setOutlets(data);
        // Default strictly to the first outlet in the list
        setSelectedOutletId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching outlets:', err);
    } finally {
      setLoadingOutlets(false);
    }
  };

  // 2. Fetch Orders when Outlet, Page, or Filters change
  useEffect(() => {
    if (selectedOutletId) {
      fetchOrders();
      // Clear selection when outlet or page changes
      setSelectedIds(new Set());
    }
  }, [selectedOutletId, page, statusFilter, startDate, endDate, debouncedSearch]);

  const selectedOutlet = useMemo(() => {
    return outlets.find(o => o.id === selectedOutletId) || null;
  }, [outlets, selectedOutletId]);

  const fetchOrders = async () => {
    if (!selectedOutletId) return;

    setLoadingOrders(true);
    try {
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('cinema_id', selectedOutletId);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      // 4:00 AM to 03:59:59 AM Cinema 24-hr operational cycle
      if (startDate) {
        const startTime = getCinemaCycleStart(startDate);
        if (startTime) query = query.gte('timestamp', startTime);
      }

      if (endDate) {
        const endTime = getCinemaCycleEnd(endDate);
        if (endTime) query = query.lte('timestamp', endTime);
      }

      const termToUse = debouncedSearch || searchTerm;
      if (termToUse && termToUse.trim()) {
        query = applyOrderSearch(query, termToUse.trim());
      }

      const { data, count, error } = await query
        .order('timestamp', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      setOrders(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching orders:', err);
      showToast('Error loading orders: ' + err.message, 'error');
    } finally {
      setLoadingOrders(false);
    }
  };

  // Quick Date Presets using Cinema 4:00 AM cutoff cycle
  const applyDatePreset = (preset) => {
    setActiveDatePreset(preset);
    setPage(0);

    const currentBusinessDate = getCurrentCinemaBusinessDate(); // 'YYYY-MM-DD'
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    if (preset === 'today') {
      setStartDate(currentBusinessDate);
      setEndDate(currentBusinessDate);
    } else if (preset === 'yesterday') {
      const d = new Date(`${currentBusinessDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      const yStr = toYMD(d);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const d = new Date(`${currentBusinessDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      setStartDate(toYMD(d));
      setEndDate(currentBusinessDate);
    } else if (preset === 'month') {
      const d = new Date(`${currentBusinessDate}T00:00:00Z`);
      const mStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
      setStartDate(mStr);
      setEndDate(currentBusinessDate);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Multi-Selection Logic
  const allCurrentPageSelected = useMemo(() => {
    if (orders.length === 0) return false;
    return orders.every(o => selectedIds.has(o.id));
  }, [orders, selectedIds]);

  const toggleSelectAll = () => {
    if (allCurrentPageSelected) {
      // Unselect all on current page
      const next = new Set(selectedIds);
      orders.forEach(o => next.delete(o.id));
      setSelectedIds(next);
    } else {
      // Select all on current page
      const next = new Set(selectedIds);
      orders.forEach(o => next.add(o.id));
      setSelectedIds(next);
    }
  };

  const toggleSelectOrder = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Selected Orders Calculations
  const selectedOrdersList = useMemo(() => {
    return orders.filter(o => selectedIds.has(o.id));
  }, [orders, selectedIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedOrdersList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  }, [selectedOrdersList]);

  // Open Deletion Modal
  const handleInitiateBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteStep(1);
    setDeleteConfirmationInput('');
    setIsDeleteModalOpen(true);
  };

  // Execute Final Deletion
  const handleConfirmFinalDelete = async () => {
    if (deleteConfirmationInput.trim() !== 'DELETE') return;

    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      const countToDelete = idsToDelete.length;

      // 1. Pre-delete related records that might block order deletion due to foreign key constraints
      await supabase.from('order_messages').delete().in('order_id', idsToDelete);
      await supabase.from('inventory_transactions').delete().in('order_id', idsToDelete);
      await supabase.from('loyalty_transactions').delete().in('order_id', idsToDelete);

      // 2. Delete the actual orders
      const { error } = await supabase
        .from('orders')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      showToast(`Successfully deleted ${countToDelete} order(s) permanently.`, 'success');
      setIsDeleteModalOpen(false);
      setDeleteStep(1);
      setDeleteConfirmationInput('');
      setSelectedIds(new Set());
      // Refresh orders
      fetchOrders();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete orders: ' + err.message);
      showToast('Failed to delete orders: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // CSV Export for records backup
  const exportCsv = () => {
    if (orders.length === 0) {
      showToast('No orders to export', 'error');
      return;
    }

    const headers = [
      'Date (IST)', 
      'Time (IST)', 
      'Order ID', 
      'Outlet', 
      'Seat/Location', 
      'Customer Phone', 
      'Total Amount (INR)', 
      'Payment Method', 
      'Status', 
      'Items'
    ];

    const rows = orders.map(o => {
      const rawTime = o.timestamp;
      const d = rawTime?.endsWith('Z') || rawTime?.includes('+') ? new Date(rawTime) : new Date(rawTime + 'Z');
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
      const itemsList = items.map(i => `${i.quantity}x ${i.food_name || i.name}`).join('; ');

      return [
        d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
        o.display_id || o.id,
        selectedOutlet?.name || 'N/A',
        o.location || 'N/A',
        o.customer_phone || 'N/A',
        o.total_amount || 0,
        o.payment_method || 'N/A',
        o.status || 'N/A',
        itemsList
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${selectedOutlet?.name || 'outlet'}_${startDate || 'all'}_${endDate || 'now'}.csv`;
    link.click();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(255, 179, 106, 0.15)', color: 'var(--accent-gold)', border: '1px solid rgba(255, 179, 106, 0.3)' }}>NEW</span>;
      case 'PREPARING':
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(0, 210, 255, 0.15)', color: 'var(--secondary-glow)', border: '1px solid rgba(0, 210, 255, 0.3)' }}>PREPARING</span>;
      case 'READY':
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(74, 222, 128, 0.15)', color: 'var(--success)', border: '1px solid rgba(74, 222, 128, 0.3)' }}>READY</span>;
      case 'DELIVERED':
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(156, 163, 175, 0.15)', color: 'var(--text-muted)', border: '1px solid rgba(156, 163, 175, 0.3)' }}>DELIVERED</span>;
      case 'CANCELLED':
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(248, 113, 113, 0.15)', color: 'var(--error)', border: '1px solid rgba(248, 113, 113, 0.3)' }}>CANCELLED</span>;
      default:
        return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-main)' }}>{status}</span>;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 9999,
          background: toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)',
          color: 'white',
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '14px',
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMessage.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {toastMessage.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ 
              width: 36, height: 36, borderRadius: 10, 
              background: 'linear-gradient(135deg, rgba(255,47,146,0.2), rgba(0,210,255,0.2))', 
              border: '1px solid rgba(255,47,146,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-glow)' 
            }}>
              <ShoppingBag size={20} />
            </div>
            <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 900, letterSpacing: -0.5 }}>
              Orders Management
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Manage and view transactions strictly segmented by outlet with bulk deletion controls.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={fetchOrders}
            className="btn-lucrative"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(255,255,255,0.06)' }}
            title="Refresh Orders"
          >
            <RefreshCw size={16} className={loadingOrders ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button 
            onClick={exportCsv}
            className="btn-lucrative"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(255,255,255,0.06)' }}
            title="Download CSV report"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 1. Outlet Selector Section (Strictly by outlet, no combined view) */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Store size={20} style={{ color: 'var(--primary-glow)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--primary-glow)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800 }}>
                SELECT OUTLET
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Orders are displayed strictly for the selected outlet.
              </div>
            </div>
          </div>

          {selectedOutlet && (
            <div style={{ 
              padding: '6px 14px', 
              borderRadius: '20px', 
              background: 'rgba(255,47,146,0.1)', 
              border: '1px solid rgba(255,47,146,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedOutlet.is_active ? 'var(--success)' : 'var(--warning)' }} />
              <span style={{ fontWeight: 700, color: 'white' }}>{selectedOutlet.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>({selectedOutlet.location || 'Main'})</span>
            </div>
          )}
        </div>

        {/* Outlet Switcher Grid / Dropdown */}
        {loadingOutlets ? (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>Loading outlets...</div>
        ) : outlets.length === 0 ? (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>No outlets found.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {outlets.map((outlet) => {
              const isSelected = outlet.id === selectedOutletId;
              return (
                <button
                  key={outlet.id}
                  onClick={() => {
                    setSelectedOutletId(outlet.id);
                    setPage(0);
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: isSelected ? '1px solid var(--primary-glow)' : '1px solid rgba(255,255,255,0.08)',
                    background: isSelected ? 'linear-gradient(135deg, rgba(255,47,146,0.25), rgba(255,47,146,0.1))' : 'rgba(255,255,255,0.02)',
                    color: isSelected ? 'white' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 4px 16px rgba(255,47,146,0.2)' : 'none'
                  }}
                >
                  <Store size={15} style={{ color: isSelected ? 'var(--primary-glow)' : 'inherit' }} />
                  <span>{outlet.name}</span>
                  {isSelected && (
                    <span style={{ 
                      fontSize: '10px', 
                      background: 'var(--primary-glow)', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontWeight: 800 
                    }}>
                      ACTIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Day Filters & Search Bar */}
      <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Quick Day Presets */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>
              <Calendar size={16} style={{ color: 'var(--secondary-glow)' }} />
              <span>Day Filter:</span>
            </div>
            <div style={{ 
              fontSize: '11px', 
              color: 'var(--accent-gold)', 
              background: 'rgba(255, 179, 106, 0.12)', 
              border: '1px solid rgba(255, 179, 106, 0.25)', 
              borderRadius: '6px', 
              padding: '3px 8px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '5px',
              fontWeight: 700
            }}>
              <Clock size={12} />
              <span>Cinema 24h Cycle: 4:00 AM – 4:00 AM (Next Day)</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              { id: 'all', label: 'All Dates' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' }
            ].map(preset => {
              const isActive = activeDatePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyDatePreset(preset.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: isActive ? '1px solid var(--secondary-glow)' : '1px solid rgba(255,255,255,0.08)',
                    background: isActive ? 'rgba(0,210,255,0.15)' : 'rgba(255,255,255,0.03)',
                    color: isActive ? 'var(--secondary-glow)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Date Range & Search & Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: '1 1 240px', minWidth: '220px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-premium"
              placeholder="Search Order ID, Seat, Phone, Employee ID/Name, Product..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                if (e.target.value === '' && searchTerm !== '') {
                  setDebouncedSearch('');
                  setPage(0);
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setPage(0);
                  setDebouncedSearch(searchTerm);
                  fetchOrders();
                }
              }}
              style={{ paddingLeft: '40px', paddingRight: searchTerm ? '38px' : '14px', width: '100%', height: '42px', fontSize: '13px' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedSearch('');
                  setPage(0);
                }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div style={{ flex: '0 0 auto', minWidth: '160px', position: 'relative' }}>
            <select
              className="input-premium"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              style={{
                width: '100%',
                height: '42px',
                lineHeight: '42px',
                fontSize: '13px',
                padding: '0 36px 0 14px',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.04)',
                whiteSpace: 'nowrap'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">New</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ChevronDown
              size={15}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none'
              }}
            />
          </div>

          {/* Custom Date Range Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setActiveDatePreset('custom'); setPage(0); }}
                className="input-premium"
                style={{ height: '42px', fontSize: '13px', padding: '6px 10px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setActiveDatePreset('custom'); setPage(0); }}
                className="input-premium"
                style={{ height: '42px', fontSize: '13px', padding: '6px 10px' }}
              />
            </div>

            {(startDate || endDate || searchTerm) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSearchTerm('');
                  setStatusFilter('ALL');
                  setActiveDatePreset('all');
                  setPage(0);
                }}
                style={{
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ff6b6b',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Clear all filters"
              >
                <X size={14} /> Clear
              </button>
            )}

            <button
              onClick={fetchOrders}
              className="btn-lucrative"
              style={{ height: '42px', padding: '0 18px', fontSize: '13px' }}
            >
              <Filter size={15} /> Apply
            </button>
          </div>
        </div>
      </div>

      {/* 3. Sticky Multi-Select Action Bar (Shows when items are checked) */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'sticky',
          top: 20,
          zIndex: 800,
          background: 'linear-gradient(135deg, rgba(31, 15, 25, 0.95), rgba(20, 10, 18, 0.95))',
          border: '1px solid rgba(255, 47, 146, 0.4)',
          borderRadius: '16px',
          padding: '14px 24px',
          boxShadow: '0 12px 40px rgba(255, 47, 146, 0.25), 0 4px 12px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(255, 47, 146, 0.2)',
              border: '1px solid var(--primary-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-glow)'
            }}>
              <CheckSquare size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'white' }}>
                {selectedIds.size} Order{selectedIds.size > 1 ? 's' : ''} Selected
              </div>
              <div style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>
                Combined Value: ₹{selectedTotalAmount.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={deselectAll}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)',
                padding: '10px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Deselect All
            </button>

            <button
              onClick={handleInitiateBulkDelete}
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                border: 'none',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.15s ease'
              }}
            >
              <Trash2 size={16} />
              Delete Selected ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* 4. Transactions Table */}
      <div className="glass-card" style={{ padding: '16px', overflowX: 'auto', borderRadius: '18px' }}>
        <table className="data-table" style={{ width: '100%', minWidth: '980px', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
          <thead>
            <tr>
              {/* Select All Checkbox */}
              <th style={{ width: '48px', textAlign: 'center' }}>
                <button
                  onClick={toggleSelectAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: allCurrentPageSelected ? 'var(--primary-glow)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  title={allCurrentPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                >
                  {allCurrentPageSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              </th>
              <th>Order / Location</th>
              <th>Date & Time</th>
              <th>Items</th>
              <th>Customer</th>
              <th>Payment & Cash</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Staff Details</th>
            </tr>
          </thead>
          <tbody>
            {loadingOrders ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '60px' }}>
                  <div className="spinner" style={{ margin: '0 auto 14px auto' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading orders for {selectedOutlet?.name}...</div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '60px' }}>
                  <ShoppingBag size={42} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: '12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>No Orders Found</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                    No orders match your filter criteria for {selectedOutlet?.name || 'this outlet'}.
                  </div>
                </td>
              </tr>
            ) : (
              orders.map(order => {
                const isSelected = selectedIds.has(order.id);
                const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
                const rawTime = order.timestamp;
                const utcDate = rawTime?.endsWith('Z') || rawTime?.includes('+') ? new Date(rawTime) : new Date(rawTime + 'Z');
                const dateStr = utcDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = utcDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

                const isPosCash = order.payment_method === 'POS_CASH';
                const isPosSplit = order.payment_method === 'POS_SPLIT';
                const isCashOrder = isPosCash || isPosSplit || order.payment_method === 'CASH';

                const rawCollected = order.collected_cash ?? order.metadata?.collected_cash ?? (isPosSplit ? order.metadata?.split_collected_cash : undefined);
                const rawReturn = order.return_cash ?? order.metadata?.return_cash ?? (isPosSplit ? order.metadata?.split_return_cash : undefined);

                const collectedAmt = rawCollected !== undefined && rawCollected !== null && Number(rawCollected) > 0 
                  ? Number(rawCollected) 
                  : (isPosCash ? order.total_amount : 0);
                const returnedAmt = rawReturn !== undefined && rawReturn !== null 
                  ? Number(rawReturn) 
                  : 0;

                const collectedCode = order.profiles?.employee_code || order.metadata?.staff_code || (order.staff_id ? 'EMP-' + order.staff_id.substring(0,6).toUpperCase() : null);
                const collectedName = order.profiles?.full_name || order.metadata?.staff_name || (order.metadata?.staff_email ? order.metadata.staff_email : null);
                const deliveredCode = order.metadata?.delivered_by_code || (order.delivered_by ? 'EMP-' + order.delivered_by.substring(0,6).toUpperCase() : null);
                const deliveredName = order.metadata?.delivered_by_name || null;
                const pInfo = getPaymentDisplayInfo(order);

                return (
                  <tr 
                    key={order.id}
                    style={{
                      background: isSelected ? 'rgba(255, 47, 146, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                      borderLeft: isSelected ? '3px solid var(--primary-glow)' : '3px solid transparent',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Checkbox Column */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => toggleSelectOrder(order.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isSelected ? 'var(--primary-glow)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px'
                        }}
                      >
                        {isSelected ? <CheckSquare size={19} /> : <Square size={19} />}
                      </button>
                    </td>

                    {/* Order / Location */}
                    <td>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: 'white' }}>
                        {order.location || 'Takeaway'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        #{order.display_id || order.id.substring(0,8).toUpperCase()}
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>
                        {dateStr}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {timeStr}
                      </div>
                    </td>

                    {/* Items */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '280px' }}>
                        {items.slice(0, 3).map((item, idx) => (
                          <div key={idx} style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.3 }}>
                            <span style={{ fontWeight: 700, color: 'var(--secondary-glow)' }}>{item.quantity}x</span> {item.food_name || item.name}
                            {item.is_combo && (
                              <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '1px 4px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', borderRadius: '4px', marginLeft: '4px' }}>
                                COMBO
                              </span>
                            )}
                          </div>
                        ))}
                        {items.length > 3 && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            +{items.length - 3} more item{items.length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Customer */}
                    <td>
                      {order.customer_phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'white' }}>
                          <Phone size={11} style={{ color: 'var(--secondary-glow)' }} />
                          <span>{order.customer_phone}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Guest / App</span>
                      )}
                    </td>

                    {/* Payment & Cash */}
                    <td>
                      <span className="badge" style={{ background: pInfo.bg, color: pInfo.color, border: pInfo.border, fontSize: '11px', fontWeight: 700 }}>
                        {pInfo.label}
                      </span>
                      {isCashOrder && (collectedAmt > 0 || returnedAmt > 0) && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Cash: ₹{collectedAmt.toFixed(0)} | Ret: ₹{returnedAmt.toFixed(0)}
                        </div>
                      )}
                    </td>

                    {/* Total Amount */}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--accent-gold)' }}>
                        ₹{Number(order.total_amount || 0).toFixed(2)}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      {getStatusBadge(order.status)}
                    </td>

                    {/* Staff Details */}
                    <td>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {collectedName ? (
                          <div>Taken: <span style={{ color: 'white' }}>{collectedName}</span> {collectedCode ? `(${collectedCode})` : ''}</div>
                        ) : (
                          <div>Online / Self</div>
                        )}
                        {deliveredName && (
                          <div style={{ marginTop: '2px' }}>Deliv: <span style={{ color: 'white' }}>{deliveredName}</span></div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '16px 8px 4px 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Showing {orders.length > 0 ? page * pageSize + 1 : 0} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} orders
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loadingOrders}
              className="btn-lucrative"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                opacity: page === 0 ? 0.4 : 1,
                cursor: page === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} /> Prev
            </button>

            <span style={{ fontSize: '13px', fontWeight: 700, color: 'white', padding: '0 8px' }}>
              Page {page + 1} of {Math.max(1, totalPages)}
            </span>

            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) >= totalPages || loadingOrders}
              className="btn-lucrative"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                opacity: (page + 1) >= totalPages ? 0.4 : 1,
                cursor: (page + 1) >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Double-Confirmation Deletion Modal */}
      {isDeleteModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '520px',
            background: '#0d1117',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '24px',
            padding: '28px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(239, 68, 68, 0.2)',
            animation: 'fadeIn 0.2s ease-out',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            
            {/* Step 1: Initial Warning & Summary */}
            {deleteStep === 1 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    flexShrink: 0
                  }}>
                    <AlertTriangle size={26} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800 }}>
                      STEP 1 OF 2 : REVIEW
                    </div>
                    <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 900, color: 'white' }}>
                      Delete Selected Orders?
                    </h2>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Outlet:</span>
                    <span style={{ fontWeight: 700, color: 'white' }}>{selectedOutlet?.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Orders to Delete:</span>
                    <span style={{ fontWeight: 800, color: '#ef4444' }}>{selectedIds.size} orders</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Value:</span>
                    <span style={{ fontWeight: 800, color: 'var(--accent-gold)' }}>₹{selectedTotalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  You are preparing to permanently erase these records. Once deleted, they will be wiped from the database and cannot be recovered.
                </div>

                {/* Selected Order IDs Preview */}
                <div style={{
                  maxHeight: '110px',
                  overflowY: 'auto',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}>
                  {selectedOrdersList.map(o => (
                    <span key={o.id} style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      color: 'var(--text-main)'
                    }}>
                      #{o.display_id || o.id.substring(0,8).toUpperCase()}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'white',
                      padding: '12px 20px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() => setDeleteStep(2)}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      border: 'none',
                      color: 'white',
                      padding: '12px 22px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)'
                    }}
                  >
                    <span>Proceed to Final Confirmation</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Second Confirmation Guard (Must Type DELETE) */}
            {deleteStep === 2 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid #ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    flexShrink: 0
                  }}>
                    <ShieldAlert size={28} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 900 }}>
                      STEP 2 OF 2 : FINAL VERIFICATION
                    </div>
                    <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 900, color: 'white' }}>
                      Permanent Data Erasure
                    </h2>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px dashed #ef4444',
                  borderRadius: '14px',
                  padding: '16px',
                  color: 'white',
                  fontSize: '13px',
                  lineHeight: 1.5
                }}>
                  <strong style={{ color: '#ef4444' }}>CRITICAL:</strong> This will completely wipe <strong>{selectedIds.size} orders</strong> for outlet <strong>{selectedOutlet?.name}</strong> from the database forever.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    To confirm, please type <strong style={{ color: '#ef4444', letterSpacing: 1 }}>DELETE</strong> in the box below:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationInput}
                    onChange={e => setDeleteConfirmationInput(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(0,0,0,0.5)',
                      border: deleteConfirmationInput === 'DELETE' ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                      color: 'white',
                      fontSize: '15px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    onClick={() => setDeleteStep(1)}
                    disabled={isDeleting}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'white',
                      padding: '12px 18px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Back
                  </button>

                  <button
                    onClick={handleConfirmFinalDelete}
                    disabled={deleteConfirmationInput !== 'DELETE' || isDeleting}
                    style={{
                      background: deleteConfirmationInput === 'DELETE' ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'rgba(239, 68, 68, 0.2)',
                      border: 'none',
                      color: 'white',
                      padding: '12px 24px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 900,
                      cursor: deleteConfirmationInput === 'DELETE' && !isDeleting ? 'pointer' : 'not-allowed',
                      opacity: deleteConfirmationInput === 'DELETE' ? 1 : 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: deleteConfirmationInput === 'DELETE' ? '0 4px 20px rgba(239, 68, 68, 0.6)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        <span>Permanently Delete ({selectedIds.size})</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
