import {  useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Search, Calendar, ChevronLeft, ChevronRight, Clock, Download, X, ListFilter } from 'lucide-react';

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
    let query = supabase.from('orders').select('*, profiles:staff_id(full_name, employee_code, role)', { count: 'exact' });
    
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
    let query = supabase.from('orders').select('timestamp, display_id, location, total_amount, payment_method, status, items, metadata, collected_cash, return_cash, staff_id, profiles:staff_id(full_name, employee_code, role)');
    
    if (user.cinema_id && user.cinema_id !== 'default') {
        query = query.eq('cinema_id', user.cinema_id);
    }
    if (startDate) query = query.gte('timestamp', startDate);
    if (endDate) query = query.lte('timestamp', endDate + 'T23:59:59');
    if (statusFilter !== 'ALL') query = query.eq('status', statusFilter);

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) { alert('Error generating report'); return; }
    if (!data || data.length === 0) { alert('No records found for the selected range'); return; }

    const headers = ['Date', 'Time', 'Order ID', 'Location', 'Amount', 'Payment', 'Status', 'Items', 'Staff Code', 'Staff Name', 'Collected Cash', 'Return Cash'];
    const rows = data.map(o => {
        const d = new Date(o.timestamp);
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        const itemsList = items.map(i => `${i.quantity}x ${i.food_name || i.name}`).join('; ');
        
        const staffCode = o.profiles?.employee_code || o.metadata?.staff_code || (o.staff_id ? 'EMP-' + o.staff_id.substring(0,6).toUpperCase() : 'N/A');
        const staffName = o.profiles?.full_name || o.metadata?.staff_name || (o.metadata?.staff_email ? o.metadata.staff_email : 'Online / App');

        return [
            d.toLocaleDateString(),
            d.toLocaleTimeString(),
            o.display_id || 'N/A',
            o.location,
            o.total_amount,
            o.payment_method,
            o.status,
            itemsList,
            staffCode,
            staffName,
            o.collected_cash || 0,
            o.return_cash || 0
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
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <style>{`
        .oh-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding-right: 52px;
          box-sizing: border-box;
          flex-wrap: wrap;
        }
        .oh-download-btn {
          flex-shrink: 0;
        }
        .oh-filter-card {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .oh-search-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .oh-search-wrap {
          flex: 2;
          min-width: 0;
          position: relative;
        }
        .oh-status-wrap {
          flex: 1;
          min-width: 120px;
        }
        .oh-date-row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding-top: 14px;
        }
        .oh-date-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 12px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .oh-date-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          flex-wrap: wrap;
        }
        .oh-date-inputs input {
          flex: 1;
          min-width: 120px;
        }
        .oh-apply-btn {
          flex-shrink: 0;
        }

        /* Orders list - card mode on mobile, table on desktop */
        .oh-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
        }
        .oh-order-cards {
          display: none;
        }

        @media (max-width: 768px) {
          .oh-header h1 { font-size: clamp(20px, 6vw, 28px); }
          .oh-download-btn span { display: none; }
          .oh-download-btn { padding: 10px 14px !important; }
          .oh-table-wrap { display: none; }
          .oh-order-cards { display: flex; flex-direction: column; gap: 12px; }
          .oh-date-inputs { flex-direction: column; align-items: stretch; }
          .oh-date-inputs input { min-width: 0; width: 100%; }
        }

        .oh-order-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .oh-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .oh-card-location {
          font-weight: 800;
          font-size: 15px;
          line-height: 1.3;
          flex: 1;
          min-width: 0;
        }
        .oh-card-amount {
          font-weight: 900;
          font-size: 18px;
          color: var(--accent-gold);
          flex-shrink: 0;
        }
        .oh-card-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .oh-card-id {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }
        .oh-card-items {
          background: rgba(0,0,0,0.2);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .oh-card-item-row {
          font-size: 13px;
          color: var(--text-main);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .oh-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .oh-card-time {
          font-size: 11px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .oh-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0 4px;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>

      {/* Header */}
      <header className="oh-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(22px, 6vw, 32px)', marginBottom: '6px' }}>Order History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Browse and search past orders for {cinemaName || 'this outlet'}.</p>
        </div>
        <button onClick={downloadFullTransactionReport} className="btn-lucrative oh-download-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', flexShrink: 0 }}>
          <Download size={18} />
          <span>Download Report</span>
        </button>
      </header>

      {/* Filter Bar */}
      <div className="glass-card oh-filter-card">
        {/* Search + Status */}
        <div className="oh-search-row">
          <div className="oh-search-wrap">
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-premium"
              placeholder="Search by seat or order ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchOrders()}
              style={{ paddingLeft: '42px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div className="oh-status-wrap">
            <select
              className="input-premium"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              style={{ appearance: 'none', width: '100%', boxSizing: 'border-box' }}
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

        {/* Date Range */}
        <div className="oh-date-row">
          <div className="oh-date-label">
            <Calendar size={14} /> Date Range:
          </div>
          <div className="oh-date-inputs">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-premium" style={{ fontSize: '13px', boxSizing: 'border-box' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-premium" style={{ fontSize: '13px', boxSizing: 'border-box' }} />
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(''); setEndDate(''); }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                <X size={16} />
              </button>
            )}
          </div>
          <button onClick={fetchOrders} className="btn-lucrative oh-apply-btn" style={{ padding: '0 20px', height: '44px' }}>
            <ListFilter size={16} /> Apply
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="glass-card" style={{ padding: '16px', borderRadius: '16px', overflowX: 'hidden' }}>
        {/* Desktop Table */}
        <div className="oh-table-wrap">
          <table className="data-table" style={{ minWidth: '600px' }}>
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
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No orders found matching your criteria.</td></tr>
              ) : orders.map(order => {
                const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                const date = new Date(order.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                
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

                const showCashInfo = isCashOrder && (collectedAmt > 0 || returnedAmt > 0);
                const cashDifference = collectedAmt - returnedAmt;

                return (
                  <tr key={order.id}>
                    <td>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{order.location}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{order.display_id || order.id.substring(0,8).toUpperCase()}</div>
                      {(order.profiles?.full_name || order.metadata?.staff_name || order.profiles?.employee_code || order.metadata?.staff_code || order.staff_id) ? (
                        <div style={{ fontSize: '11px', color: 'var(--secondary-glow)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.25)', fontSize: '10px', letterSpacing: '0.5px' }}>
                            {order.profiles?.employee_code || order.metadata?.staff_code || (order.staff_id ? 'EMP-' + order.staff_id.substring(0,6).toUpperCase() : 'STAFF')}
                          </span>
                          <span style={{ fontWeight: 600 }}>{order.profiles?.full_name || order.metadata?.staff_name || 'Staff'}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>📱 Online / App</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {items.map((item, idx) => (
                          <div key={idx} style={{ fontSize: '13px' }}>
                            {item.is_combo && <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', borderRadius: '4px', marginRight: '4px' }}>COMBO</span>}
                            {item.quantity}x {item.food_name || item.name}
                            {item.item_note && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>📝 {item.item_note}</div>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}>
                        {order.payment_method === 'POS_SPLIT' ? 'SPLIT (CASH + UPI)' : order.payment_method?.replace('DEMO_', '').replace('_', ' ')}
                      </span>
                      {order.payment_method === 'POS_SPLIT' && order.metadata && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>💵 Cash Portion: ₹{order.metadata.split_cash ?? 0}</div>
                          <div>📱 UPI Portion: ₹{order.metadata.split_upi ?? 0}</div>
                        </div>
                      )}
                      {showCashInfo && (
                        <div style={{ 
                          marginTop: '6px', 
                          padding: '6px 8px', 
                          borderRadius: '6px', 
                          background: 'rgba(34, 197, 94, 0.08)', 
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                          fontSize: '11px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          minWidth: '135px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Collected:</span>
                            <span style={{ color: 'white', fontWeight: 'bold' }}>₹{collectedAmt.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Returned:</span>
                            <span style={{ color: returnedAmt > 0 ? '#4ade80' : 'var(--text-muted)', fontWeight: 'bold' }}>₹{returnedAmt.toFixed(2)}</span>
                          </div>
                          <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '2px', paddingTop: '2px', color: 'var(--accent-gold)', display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: 'bold' }}>
                            <span>Diff (Bill):</span>
                            <span>₹{cashDifference.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>₹{order.total_amount}</td>
                    <td>
                      <span className="badge" style={{ background: `${getStatusColor(order.status)}15`, color: getStatusColor(order.status), border: `1px solid ${getStatusColor(order.status)}30` }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={12} /> {date}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="oh-order-cards">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No orders found matching your criteria.</div>
          ) : orders.map(order => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const date = new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            const sc = getStatusColor(order.status);

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

            const showCashInfo = isCashOrder && (collectedAmt > 0 || returnedAmt > 0);
            const cashDifference = collectedAmt - returnedAmt;

            return (
              <div key={order.id} className="oh-order-card" style={{ borderLeft: `3px solid ${sc}` }}>
                <div className="oh-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="oh-card-location">{order.location}</div>
                    <div className="oh-card-id">#{order.display_id || order.id.substring(0,8).toUpperCase()}</div>
                    {(order.profiles?.full_name || order.metadata?.staff_name || order.profiles?.employee_code || order.metadata?.staff_code || order.staff_id) ? (
                      <div style={{ fontSize: '11px', color: 'var(--secondary-glow)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '10px' }}>
                          [{order.profiles?.employee_code || order.metadata?.staff_code || (order.staff_id ? 'EMP-' + order.staff_id.substring(0,6).toUpperCase() : 'STAFF')}]
                        </span>
                        <span style={{ fontWeight: 600 }}>{order.profiles?.full_name || order.metadata?.staff_name || 'Staff'}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>📱 Online / App</div>
                    )}
                  </div>
                  <div className="oh-card-amount">₹{order.total_amount}</div>
                </div>

                <div className="oh-card-items">
                  {items.map((item, idx) => (
                    <div key={idx} className="oh-card-item-row">
                      {item.is_combo && <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '1px 4px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', borderRadius: '3px', flexShrink: 0 }}>COMBO</span>}
                      <span>{item.quantity}x {item.food_name || item.name}</span>
                    </div>
                  ))}
                </div>

                <div className="oh-card-footer">
                  <div className="oh-card-meta">
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}>
                      {order.payment_method === 'POS_SPLIT' ? 'SPLIT (CASH + UPI)' : order.payment_method?.replace('DEMO_', '').replace('_', ' ')}
                    </span>
                    <span className="badge" style={{ background: `${sc}15`, color: sc, border: `1px solid ${sc}30` }}>
                      {order.status}
                    </span>
                  </div>
                  <div className="oh-card-time"><Clock size={11} /> {date}</div>
                </div>

                {order.payment_method === 'POS_SPLIT' && order.metadata && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                    <span>💵 Cash Portion: ₹{order.metadata.split_cash ?? 0}</span>
                    <span>📱 UPI Portion: ₹{order.metadata.split_upi ?? 0}</span>
                  </div>
                )}

                {showCashInfo && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px 10px', 
                    background: 'rgba(34, 197, 94, 0.08)', 
                    border: '1px solid rgba(34, 197, 94, 0.2)', 
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '11px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Collected: <strong style={{ color: 'white' }}>₹{collectedAmt.toFixed(2)}</strong>
                      </span>
                      <span style={{ color: returnedAmt > 0 ? '#4ade80' : 'var(--text-muted)', fontWeight: 'bold' }}>
                        Returned: ₹{returnedAmt.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      borderTop: '1px dashed rgba(255,255,255,0.1)', 
                      paddingTop: '3px',
                      color: 'var(--accent-gold)',
                      fontWeight: 'bold'
                    }}>
                      <span>Diff (Total Bill):</span>
                      <span>₹{cashDifference.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="oh-pagination">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Page {page + 1}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-ghost" onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo(0,0); }} disabled={page === 0}>
              <ChevronLeft size={16} /> Prev
            </button>
            <button className="btn-ghost" onClick={() => { setPage(p => p + 1); window.scrollTo(0,0); }} disabled={orders.length < pageSize}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
