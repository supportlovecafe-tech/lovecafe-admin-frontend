import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Search, Calendar, Filter, ChevronLeft, ChevronRight, Clock, Download, X, ListFilter } from 'lucide-react';

export default function OrderHistory({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const [cinemaName, setCinemaName] = useState(user.cinema_name || '');

  useEffect(() => {
    fetchOrders();
    
    if (!cinemaName && user.cinema_id && user.cinema_id !== 'default') {
      supabase.from('cinemas').select('name').eq('id', user.cinema_id).single().then(({data}) => {
        if (data) setCinemaName(data.name);
      });
    }
  }, [page, statusFilter, startDate, endDate]);

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase.from('orders').select('*', { count: 'exact' });
    
    if (user.cinema_id && user.cinema_id !== 'default') {
        query = query.eq('cinema_id', user.cinema_id);
    }

    if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
    }

    if (startDate) {
        query = query.gte('timestamp', startDate);
    }

    if (endDate) {
        query = query.lte('timestamp', endDate + 'T23:59:59');
    }

    if (searchTerm) {
        query = query.or(`location.ilike.%${searchTerm}%,display_id.ilike.%${searchTerm}%`);
    }
    
    const { data } = await query
        .order('timestamp', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

    if (data) setOrders(data);
    setLoading(false);
  };

  const downloadFullTransactionReport = async () => {
    let query = supabase.from('orders').select('timestamp, display_id, location, total_amount, payment_method, status, items');
    
    if (user.cinema_id && user.cinema_id !== 'default') {
        query = query.eq('cinema_id', user.cinema_id);
    }
    if (startDate) query = query.gte('timestamp', startDate);
    if (endDate) query = query.lte('timestamp', endDate + 'T23:59:59');
    if (statusFilter !== 'ALL') query = query.eq('status', statusFilter);

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) { alert('Error generating report'); return; }
    if (!data || data.length === 0) { alert('No records found for the selected range'); return; }

    const headers = ['Date', 'Time', 'Order ID', 'Location', 'Amount', 'Payment', 'Status', 'Items'];
    const rows = data.map(o => {
        const d = new Date(o.timestamp);
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        const itemsList = items.map(i => `${i.quantity}x ${i.food_name || i.name}`).join('; ');
        
        return [
            d.toLocaleDateString(),
            d.toLocaleTimeString(),
            o.display_id || 'N/A',
            o.location,
            o.total_amount,
            o.payment_method,
            o.status,
            itemsList
        ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `detailed_transactions_${startDate || 'all'}_to_${endDate || 'now'}.csv`;
    link.click();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'var(--accent-gold)';
      case 'PREPARING': return 'var(--secondary-glow)';
      case 'READY': return 'var(--success)';
      case 'DELIVERED': return 'var(--text-muted)';
      case 'CANCELLED': return 'var(--error)';
      default: return 'white';
    }
  };

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Order History</h1>
          <p style={{ color: 'var(--text-muted)' }}>Browse and search past orders for {cinemaName || 'this outlet'}.</p>
        </div>
        <button onClick={downloadFullTransactionReport} className="btn-lucrative" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}>
            <Download size={18} /> Download Full Transaction Report
        </button>
      </header>

      {/* Direct Filter Bar */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, position: 'relative', minWidth: '300px' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                    className="input-premium" 
                    placeholder="Search by seat or order ID..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchOrders()}
                    style={{ paddingLeft: '48px' }}
                />
            </div>

            <div style={{ flex: 1, minWidth: '160px' }}>
                <select 
                    className="input-premium" 
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
                    style={{ appearance: 'none' }}
                >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">New</option>
                    <option value="PREPARING">Preparing</option>
                    <option value="READY">Ready</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
            </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '400px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    <Calendar size={16} /> Date Range:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-premium" style={{ flex: 1, fontSize: '13px' }} />
                    <span style={{ color: 'var(--text-muted)' }}>to</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-premium" style={{ flex: 1, fontSize: '13px' }} />
                    {(startDate || endDate) && (
                        <button onClick={() => { setStartDate(''); setEndDate(''); }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '4px' }}>
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>
            
            <button onClick={fetchOrders} className="btn-lucrative" style={{ padding: '0 24px', height: '44px' }}>
                <ListFilter size={18} /> Apply Filters
            </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Order Info</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '48px' }}>
                  <div className="spinner" />
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  No orders found matching your criteria.
                </td>
              </tr>
            ) : orders.map(order => {
              const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
              const date = new Date(order.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
              
              return (
                <tr key={order.id}>
                  <td>
                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{order.location}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{order.display_id || order.id.substring(0,8).toUpperCase()}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                            {item.is_combo && (
                              <span style={{ 
                                fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', 
                                background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', 
                                borderRadius: '4px', letterSpacing: '0.5px' 
                              }}>COMBO</span>
                            )}
                            <span>{item.quantity}x {item.food_name || item.name}</span>
                          </div>
                          {item.item_note && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: '4px', marginLeft: item.is_combo ? '48px' : '0' }}>
                              <span style={{ opacity: 0.5 }}>📝</span>
                              <span>{item.item_note}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}>
                      {order.payment_method?.replace('DEMO_', '').replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 'bold' }}>₹{order.total_amount}</td>
                  <td>
                    <span className="badge" style={{ background: `${getStatusColor(order.status)}15`, color: getStatusColor(order.status), border: `1px solid ${getStatusColor(order.status)}30` }}>
                      {order.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={12} /> {date}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div style={{ padding: '20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Page {page + 1}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn-ghost" 
              onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo(0,0); }}
              disabled={page === 0}
            >
              <ChevronLeft size={18} /> Previous
            </button>
            <button 
              className="btn-ghost" 
              onClick={() => { setPage(p => p + 1); window.scrollTo(0,0); }}
              disabled={orders.length < pageSize}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
