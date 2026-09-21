import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Users, Award, TrendingUp, DollarSign, Calendar, Filter, 
  Download, Search, RefreshCw, ChevronRight, Building, CheckCircle2,
  Sparkles, Calculator, AlertCircle, Percent
} from 'lucide-react';

export default function StaffBonusDashboard({ user }) {
  const [cinemas, setCinemas] = useState([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date range filter
  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  const [datePreset, setDatePreset] = useState('month'); // today, 7days, month, 30days, all, custom
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  // Bonus Calculation Controls
  const [bonusType, setBonusType] = useState('percentage'); // 'percentage' or 'flat'
  const [bonusRate, setBonusRate] = useState(2.0); // 2% default or ₹10 flat
  const [salesThreshold, setSalesThreshold] = useState(0); // Minimum sales to qualify

  useEffect(() => {
    fetchCinemas();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [selectedCinemaId, startDate, endDate]);

  const fetchCinemas = async () => {
    try {
      const { data } = await supabase.from('cinemas').select('id, name, location').order('name');
      if (data) setCinemas(data);
    } catch (e) {
      console.error('Error fetching cinemas:', e);
    }
  };

  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === '7days') {
      const d = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      setStartDate(firstOfMonth);
      setEndDate(todayStr);
    } else if (preset === '30days') {
      const d = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('2024-01-01');
      setEndDate(todayStr);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {
        p_cinema_id: selectedCinemaId || null,
        p_start_date: startDate ? `${startDate}T00:00:00Z` : null,
        p_end_date: endDate ? `${endDate}T23:59:59Z` : null
      };

      const { data, error } = await supabase.rpc('get_staff_sales_report', params);
      if (error) {
        // Fallback: query directly if RPC has not yet been executed in SQL editor
        console.warn('RPC get_staff_sales_report not available yet, falling back to direct table query:', error);
        await fallbackQuery();
        return;
      }

      setReportData(data);
    } catch (e) {
      console.error('Error fetching staff sales report:', e);
      await fallbackQuery();
    } finally {
      setLoading(false);
    }
  };

  const fallbackQuery = async () => {
    try {
      let q = supabase
        .from('orders')
        .select('id, cinema_id, total_amount, collected_cash, timestamp, status, staff_id, metadata, cinemas(id, name), profiles:staff_id(id, full_name, employee_code, role)')
        .neq('status', 'CANCELLED');

      if (selectedCinemaId) q = q.eq('cinema_id', selectedCinemaId);
      if (startDate) q = q.gte('timestamp', `${startDate}T00:00:00Z`);
      if (endDate) q = q.lte('timestamp', `${endDate}T23:59:59Z`);

      const { data: orders, error } = await q;
      if (error) throw error;

      const staffMap = {};
      let totalSales = 0;
      let totalOrders = orders ? orders.length : 0;
      let unassignedSales = 0;
      let unassignedOrders = 0;

      (orders || []).forEach(o => {
        totalSales += (o.total_amount || 0);
        const sid = o.staff_id || o.metadata?.staff_id;
        
        if (!sid) {
          unassignedSales += (o.total_amount || 0);
          unassignedOrders++;
          return;
        }

        if (!staffMap[sid]) {
          const profile = o.profiles;
          staffMap[sid] = {
            staff_id: sid,
            employee_code: profile?.employee_code || o.metadata?.staff_code || `EMP-${sid.substring(0,6).toUpperCase()}`,
            staff_name: profile?.full_name || o.metadata?.staff_name || 'Staff Member',
            role: profile?.role || 'OUTLET_STAFF',
            cinema_id: o.cinema_id,
            cinema_name: o.cinemas?.name || 'Assigned Outlet',
            total_orders: 0,
            total_sales: 0,
            cash_collected: 0,
            first_order_date: o.timestamp,
            last_order_date: o.timestamp
          };
        }

        staffMap[sid].total_orders++;
        staffMap[sid].total_sales += (o.total_amount || 0);
        staffMap[sid].cash_collected += (o.collected_cash || 0);
        if (new Date(o.timestamp) < new Date(staffMap[sid].first_order_date)) staffMap[sid].first_order_date = o.timestamp;
        if (new Date(o.timestamp) > new Date(staffMap[sid].last_order_date)) staffMap[sid].last_order_date = o.timestamp;
      });

      const staffList = Object.values(staffMap).map(s => ({
        ...s,
        avg_order_value: s.total_orders > 0 ? Math.round(s.total_sales / s.total_orders) : 0
      })).sort((a, b) => b.total_sales - a.total_sales);

      setReportData({
        summary: {
          total_sales: totalSales,
          total_orders: totalOrders,
          staff_orders: totalOrders - unassignedOrders,
          online_orders: unassignedOrders,
          active_staff_count: staffList.length
        },
        staff_sales: staffList,
        unassigned_sales: {
          total_sales: unassignedSales,
          total_orders: unassignedOrders
        }
      });
    } catch (err) {
      console.error('Fallback query error:', err);
    }
  };

  // Calculations with bonus
  const processedStaffList = useMemo(() => {
    if (!reportData || !reportData.staff_sales) return [];

    return reportData.staff_sales.map(staff => {
      const qualifies = staff.total_sales >= salesThreshold;
      let bonusAmount = 0;

      if (qualifies) {
        if (bonusType === 'percentage') {
          bonusAmount = (staff.total_sales * (Number(bonusRate) || 0)) / 100;
        } else {
          bonusAmount = (staff.total_orders * (Number(bonusRate) || 0));
        }
      }

      return {
        ...staff,
        qualifies,
        bonusAmount: Math.round(bonusAmount * 100) / 100
      };
    });
  }, [reportData, bonusType, bonusRate, salesThreshold]);

  const filteredStaffList = useMemo(() => {
    if (!searchTerm) return processedStaffList;
    const term = searchTerm.toLowerCase();
    return processedStaffList.filter(s => 
      (s.staff_name || '').toLowerCase().includes(term) ||
      (s.employee_code || '').toLowerCase().includes(term) ||
      (s.cinema_name || '').toLowerCase().includes(term) ||
      (s.role || '').toLowerCase().includes(term)
    );
  }, [processedStaffList, searchTerm]);

  const totalBonusPool = useMemo(() => {
    return processedStaffList.reduce((sum, s) => sum + (s.bonusAmount || 0), 0);
  }, [processedStaffList]);

  const topPerformer = useMemo(() => {
    if (processedStaffList.length === 0) return null;
    return processedStaffList[0];
  }, [processedStaffList]);

  const downloadPayrollCSV = () => {
    if (filteredStaffList.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = [
      'Rank',
      'Employee Code',
      'Staff Name',
      'Outlet',
      'Role',
      'Orders Completed',
      'Gross Sales (INR)',
      'Cash Handled (INR)',
      'Avg Ticket Value (INR)',
      'Bonus Formula',
      'Bonus Payable (INR)'
    ];

    const rows = filteredStaffList.map((s, idx) => [
      idx + 1,
      s.employee_code,
      s.staff_name,
      s.cinema_name,
      s.role,
      s.total_orders,
      s.total_sales.toFixed(2),
      s.cash_collected.toFixed(2),
      s.avg_order_value || 0,
      bonusType === 'percentage' ? `${bonusRate}% of Sales` : `₹${bonusRate} per order`,
      s.bonusAmount.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `staff_bonus_report_${startDate}_to_${endDate}.csv`;
    link.click();
  };

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <style>{`
        .bonus-grid-kpi {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
        }
        .bonus-config-card {
          background: linear-gradient(135deg, rgba(255, 47, 146, 0.04) 0%, rgba(0, 210, 255, 0.04) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
        }
        .rank-badge-1 {
          background: linear-gradient(135deg, #FFD700, #FFA500);
          color: black;
          font-weight: 900;
        }
        .rank-badge-2 {
          background: linear-gradient(135deg, #E0E0E0, #BDBDBD);
          color: black;
          font-weight: 900;
        }
        .rank-badge-3 {
          background: linear-gradient(135deg, #CD7F32, #8D5524);
          color: white;
          font-weight: 900;
        }
      `}</style>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(255, 47, 146, 0.15)', color: 'var(--primary-glow)', fontSize: '11px', fontWeight: '800', letterSpacing: '1px' }}>
              OWNER PORTAL
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Multi-Outlet Payroll & Bonus Automation</span>
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: '900', letterSpacing: '-1.5px', margin: 0 }}>
            Staff Sales & Performance Bonuses
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px', margin: 0 }}>
            Inspect real-time counter sales linked to each staff member ID and calculate performance bonuses.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={fetchReport} 
            className="btn-lucrative" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(255,255,255,0.05)', fontSize: '13px' }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          
          <button 
            onClick={downloadPayrollCSV} 
            className="btn-lucrative" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '13px' }}
          >
            <Download size={16} />
            <span>Export Payroll CSV</span>
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          
          {/* Outlet Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
            <Building size={18} color="var(--primary-glow)" />
            <select
              className="input-premium"
              value={selectedCinemaId}
              onChange={e => setSelectedCinemaId(e.target.value)}
              style={{ width: '100%', fontSize: '13px', fontWeight: 'bold' }}
            >
              <option value="">🏢 All Outlets (Consolidated Platform)</option>
              {cinemas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.location ? `(${c.location})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Presets */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: '7 Days' },
              { id: 'month', label: 'This Month' },
              { id: '30days', label: '30 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handleDatePresetChange(p.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                  background: datePreset === p.id ? 'var(--primary-glow)' : 'rgba(255,255,255,0.04)',
                  color: datePreset === p.id ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="input-premium"
                style={{ fontSize: '12px', padding: '6px 10px' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="input-premium"
                style={{ fontSize: '12px', padding: '6px 10px' }}
              />
            </div>
          )}

        </div>
      </div>

      {/* Bonus Calculator Panel */}
      <div className="bonus-config-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255, 179, 106, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-gold)' }}>
              <Calculator size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>Live Bonus Calculation Rules</h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Adjust rates to automatically calculate payout incentives for employees.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setBonusType('percentage')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                background: bonusType === 'percentage' ? 'var(--accent-gold)' : 'transparent',
                color: bonusType === 'percentage' ? 'black' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              % of Sales
            </button>
            <button
              onClick={() => setBonusType('flat')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                background: bonusType === 'flat' ? 'var(--accent-gold)' : 'transparent',
                color: bonusType === 'flat' ? 'black' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              Flat ₹ Per Order
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>
              {bonusType === 'percentage' ? 'Bonus Rate (% of Total Sales)' : 'Bonus Amount (₹ Per Order)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step={bonusType === 'percentage' ? '0.1' : '1'}
                min="0"
                className="input-premium"
                value={bonusRate}
                onChange={e => setBonusRate(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', fontSize: '15px', fontWeight: '800', paddingLeft: '36px' }}
              />
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                {bonusType === 'percentage' ? '%' : '₹'}
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>
              Minimum Sales Threshold (₹)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="500"
                min="0"
                className="input-premium"
                value={salesThreshold}
                onChange={e => setSalesThreshold(parseFloat(e.target.value) || 0)}
                placeholder="0 for all orders"
                style={{ width: '100%', fontSize: '15px', fontWeight: '800', paddingLeft: '36px' }}
              />
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                ₹
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(0, 210, 255, 0.08)', border: '1px solid rgba(0, 210, 255, 0.2)', fontSize: '12px', color: 'var(--secondary-glow)' }}>
              ⚡ Total Calculated Bonus: <strong style={{ fontSize: '15px', color: 'white', marginLeft: '6px' }}>₹{totalBonusPool.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="bonus-grid-kpi">
        <div className="glass-card hover-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Total Staff Sales
            </span>
            <DollarSign size={20} color="var(--primary-glow)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px' }}>
            ₹{(reportData?.summary?.total_sales || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            From {reportData?.summary?.total_orders || 0} total tickets
          </div>
        </div>

        <div className="glass-card hover-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Counter Orders Taken
            </span>
            <Users size={20} color="var(--secondary-glow)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px' }}>
            {reportData?.summary?.staff_orders || 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {reportData?.summary?.active_staff_count || 0} active staff members
          </div>
        </div>

        <div className="glass-card hover-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Bonus Pool Payable
            </span>
            <Award size={20} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px', color: 'var(--accent-gold)' }}>
            ₹{totalBonusPool.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {bonusType === 'percentage' ? `${bonusRate}% of staff sales` : `₹${bonusRate} per order`}
          </div>
        </div>

        <div className="glass-card hover-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Top Performer
            </span>
            <Sparkles size={20} color="#4CAF50" />
          </div>
          <div style={{ fontSize: '18px', fontWeight: '900', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topPerformer ? topPerformer.staff_name : 'No sales yet'}
          </div>
          <div style={{ fontSize: '11px', color: '#4CAF50', fontWeight: 'bold', marginTop: '4px' }}>
            {topPerformer ? `₹${topPerformer.total_sales.toLocaleString()} (${topPerformer.total_orders} orders)` : '—'}
          </div>
        </div>
      </div>

      {/* Staff Leaderboard & Sales Breakdown */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Employee Sales Leaderboard & Bonus Summary</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Breakdown by Staff ID / Code and Outlet
            </p>
          </div>

          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-premium"
              placeholder="Search staff, code, outlet..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px', fontSize: '12px', width: '100%' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)' }}>
                <th style={{ padding: '14px 20px' }}>Rank</th>
                <th style={{ padding: '14px 20px' }}>Staff Code</th>
                <th style={{ padding: '14px 20px' }}>Staff Name</th>
                <th style={{ padding: '14px 20px' }}>Outlet</th>
                <th style={{ padding: '14px 20px' }}>Role</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Orders</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Total Sales</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Cash Handled</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Avg Ticket</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Calculated Bonus</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '60px', textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '14px' }}>Aggregating staff sales data...</p>
                  </td>
                </tr>
              ) : filteredStaffList.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No counter sales recorded for staff during this period.
                  </td>
                </tr>
              ) : (
                filteredStaffList.map((staff, idx) => {
                  let rankClass = '';
                  if (idx === 0) rankClass = 'rank-badge-1';
                  else if (idx === 1) rankClass = 'rank-badge-2';
                  else if (idx === 2) rankClass = 'rank-badge-3';

                  return (
                    <tr key={staff.staff_id || idx} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ 
                          width: '26px', height: '26px', borderRadius: '50%', 
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: '800',
                          background: rankClass ? undefined : 'rgba(255,255,255,0.05)',
                          color: rankClass ? undefined : 'var(--text-muted)'
                        }} className={rankClass}>
                          {idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: '800',
                          fontSize: '12px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 210, 255, 0.1)',
                          color: 'var(--secondary-glow)',
                          border: '1px solid rgba(0, 210, 255, 0.25)',
                          letterSpacing: '1px'
                        }}>
                          {staff.employee_code}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px' }}>
                        {staff.staff_name}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {staff.cinema_name || '—'}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                          background: staff.role === 'OUTLET_MANAGER' ? 'rgba(255,47,146,0.12)' : 'rgba(255,179,106,0.1)',
                          color: staff.role === 'OUTLET_MANAGER' ? 'var(--primary-glow)' : 'var(--secondary-orange)'
                        }}>
                          {(staff.role || 'STAFF').replace('OUTLET_', '')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', fontSize: '14px' }}>
                        {staff.total_orders}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '800', fontSize: '15px', color: 'white' }}>
                        ₹{staff.total_sales.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', color: 'var(--text-muted)' }}>
                        ₹{staff.cash_collected.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', color: 'var(--text-muted)' }}>
                        ₹{staff.avg_order_value}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: '900',
                          fontSize: '15px',
                          color: staff.bonusAmount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: staff.bonusAmount > 0 ? 'rgba(255, 179, 106, 0.1)' : 'transparent',
                          border: staff.bonusAmount > 0 ? '1px solid rgba(255, 179, 106, 0.2)' : 'none'
                        }}>
                          ₹{staff.bonusAmount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Online / App Unassigned Orders Footer */}
        {reportData?.unassigned_sales?.total_orders > 0 && (
          <div style={{ padding: '18px 24px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                <strong>Online & Self-Service Orders:</strong> {reportData.unassigned_sales.total_orders} tickets (₹{reportData.unassigned_sales.total_sales.toLocaleString()}) placed directly via customer APK / QR without staff counter assistance.
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Excluded from counter bonus
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
