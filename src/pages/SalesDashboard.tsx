import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, 
  Download, 
  Calendar, 
  CreditCard, 
  Smartphone, 
  Banknote, 
  X,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Clock,
  Zap,
  ChevronDown,
  Target,
  Award,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  Eye,
  RotateCcw
} from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

// --- Sub-components ---

const AnalyticsCard = ({ title, value, subtitle, trend, icon, loading }: any) => (
  <div className="glass-card animate-fade-in analytics-card-item">
    {loading ? (
      <div className="skeleton" style={{ height: '100%', width: '100%' }} />
    ) : (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: '800', 
            textTransform: 'uppercase', 
            letterSpacing: '0.8px', 
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1
          }}>
            {title}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: '8px', flexShrink: 0 }}>
            {icon}
          </div>
        </div>
        <div>
          <div style={{ 
            fontSize: 'clamp(17px, 4.8vw, 26px)', 
            fontWeight: '900', 
            color: 'white', 
            display: 'flex', 
            alignItems: 'baseline', 
            gap: '6px',
            flexWrap: 'wrap',
            lineHeight: 1.2,
            wordBreak: 'break-word'
          }}>
            <span>{value}</span>
            {trend !== undefined && (
              <span style={{ 
                fontSize: '11px', 
                fontWeight: 'bold', 
                color: trend >= 0 ? '#4CAF50' : '#ff6b6b', 
                display: 'inline-flex', 
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}>
                {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {Math.abs(trend).toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        </div>
      </>
    )}
  </div>
);

const ChartContainer = ({ title, children, loading, headerAction, height }: any) => (
  <div className="glass-card analytics-chart-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'white' }}>{title}</h3>
      {headerAction && <div>{headerAction}</div>}
    </div>
    <div className="chart-container-inner" style={height ? { height } : undefined}>
      {loading ? (
        <div className="skeleton" style={{ height: '100%', width: '100%' }} />
      ) : children}
    </div>
  </div>
);

// --- Main Dashboard ---

export default function SalesDashboard({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showFilter, setShowFilter] = useState(false);
  const [topProductMetric, setTopProductMetric] = useState<'revenue' | 'quantity'>('revenue');

  const [staffSalesList, setStaffSalesList] = useState<any[]>([]);

  const cinemaId = user.cinema_id;
  const isOutletAdmin = Boolean(user && (user.role === 'OUTLET_MANAGER' || user.role === 'SUPER_ADMIN'));

  // --- Outlet Sales Targets State ---
  const [targetsList, setTargetsList] = useState<any[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);
  const [targetsProgressMap, setTargetsProgressMap] = useState<Record<string, { achieved: number; orders: number }>>({});

  // Target Modal State
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState({
    title: '',
    target_amount: '',
    start_date: '',
    end_date: ''
  });
  const [targetSaving, setTargetSaving] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [cinemaId, startDate, endDate]);

  useEffect(() => {
    fetchTargets();
  }, [cinemaId]);

  const fetchTargets = async () => {
    if (!cinemaId || cinemaId === 'default') return;
    setTargetsLoading(true);
    try {
      const { data: targets, error } = await supabase
        .from('outlet_sales_targets')
        .select('*')
        .eq('cinema_id', cinemaId)
        .order('start_date', { ascending: false });

      if (error) {
        console.warn('Could not load outlet_sales_targets:', error.message);
        setTargetsList([]);
        return;
      }

      const list = targets || [];
      setTargetsList(list);

      // Compute achieved sales for each target within its exact date window
      const progressMap: Record<string, { achieved: number; orders: number }> = {};
      for (const t of list) {
        try {
          const { data: orderData } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('cinema_id', cinemaId)
            .not('status', 'in', '("CANCELLED","REFUNDED")')
            .gte('created_at', t.start_date + 'T00:00:00Z')
            .lte('created_at', t.end_date + 'T23:59:59Z');

          const total = (orderData || []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
          progressMap[t.id] = { achieved: total, orders: orderData?.length || 0 };
        } catch {
          progressMap[t.id] = { achieved: 0, orders: 0 };
        }
      }
      setTargetsProgressMap(progressMap);

      setSelectedTarget((prev: any) => {
        if (prev) {
          const found = list.find((x: any) => x.id === prev.id);
          if (found) return found;
        }
        return list.length > 0 ? list[0] : null;
      });
    } catch (err) {
      console.error('Error in fetchTargets:', err);
    } finally {
      setTargetsLoading(false);
    }
  };

  const openNewTargetModal = () => {
    const today = new Date();
    const pad = (n: number) => n < 10 ? '0' + n : n;
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);

    setEditingTargetId(null);
    setTargetForm({
      title: 'Weekly Sales Sprint',
      target_amount: '',
      start_date: toStr(today),
      end_date: toStr(next7Days)
    });
    setShowTargetModal(true);
  };

  const openEditTargetModal = (target: any) => {
    setEditingTargetId(target.id);
    setTargetForm({
      title: target.title || '',
      target_amount: String(target.target_amount || ''),
      start_date: target.start_date || '',
      end_date: target.end_date || ''
    });
    setShowTargetModal(true);
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOutletAdmin) return;
    if (!targetForm.title || !targetForm.target_amount || !targetForm.start_date || !targetForm.end_date) {
      alert('Please fill out all target fields.');
      return;
    }
    if (new Date(targetForm.end_date) < new Date(targetForm.start_date)) {
      alert('End date cannot be earlier than start date.');
      return;
    }

    setTargetSaving(true);
    try {
      const payload = {
        cinema_id: cinemaId,
        title: targetForm.title.trim(),
        target_amount: parseFloat(targetForm.target_amount),
        start_date: targetForm.start_date,
        end_date: targetForm.end_date,
        created_by: user.id || null
      };

      if (editingTargetId) {
        const { error } = await supabase
          .from('outlet_sales_targets')
          .update(payload)
          .eq('id', editingTargetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('outlet_sales_targets')
          .insert([payload]);
        if (error) throw error;
      }

      setShowTargetModal(false);
      setEditingTargetId(null);
      await fetchTargets();
    } catch (err: any) {
      alert('Failed to save sales target: ' + (err.message || err));
    } finally {
      setTargetSaving(false);
    }
  };

  const handleDeleteTarget = async (targetId: string, title: string) => {
    if (!isOutletAdmin) return;
    if (!confirm(`Are you sure you want to delete target "${title}"?`)) return;
    try {
      const { error } = await supabase
        .from('outlet_sales_targets')
        .delete()
        .eq('id', targetId);
      if (error) throw error;
      if (selectedTarget?.id === targetId) {
        setSelectedTarget(null);
      }
      await fetchTargets();
    } catch (err: any) {
      alert('Failed to delete target: ' + err.message);
    }
  };

  const handleInspectTarget = (target: any) => {
    setSelectedTarget(target);
    setStartDate(target.start_date);
    setEndDate(target.end_date);
    setTimeout(() => {
      document.getElementById('staff-breakdown-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const selectedTargetChartData = useMemo(() => {
    if (!selectedTarget) return [];
    const targetAmt = Number(selectedTarget.target_amount) || 0;
    const achievedAmt = targetsProgressMap[selectedTarget.id]?.achieved || 0;
    return [
      {
        name: selectedTarget.title || 'Target',
        'Target Goal (₹)': targetAmt,
        'Achieved Sales (₹)': achievedAmt
      }
    ];
  }, [selectedTarget, targetsProgressMap]);

  const fetchAnalytics = async () => {
    if (!cinemaId || cinemaId === 'default') return;
    setLoading(true);
    try {
      const [analyticsRes, staffReportRes] = await Promise.all([
        supabase.rpc('get_sales_analytics', {
          p_cinema_id: cinemaId,
          p_start_date: startDate + 'T00:00:00Z',
          p_end_date: endDate + 'T23:59:59Z'
        }),
        supabase.rpc('get_staff_sales_report', {
          p_cinema_id: cinemaId,
          p_start_date: startDate + 'T00:00:00Z',
          p_end_date: endDate + 'T23:59:59Z'
        })
      ]);

      if (analyticsRes.error) throw analyticsRes.error;
      setData(analyticsRes.data);

      if (staffReportRes.data && staffReportRes.data.staff_sales) {
        setStaffSalesList(staffReportRes.data.staff_sales);
      } else {
        setStaffSalesList([]);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const staffChartData = useMemo(() => {
    if (staffSalesList && staffSalesList.length > 0) {
      return staffSalesList
        .filter(s => {
          const role = String(s.role || '').toUpperCase();
          return role !== 'OUTLET_MANAGER' && role !== 'SUPER_ADMIN' && !role.includes('MANAGER');
        })
        .map(s => ({
          name: s.staff_name || 'Staff Member',
          revenue: s.total_sales || 0,
          orders: s.total_orders || 0,
          role: s.role
        }));
    }
    return [];
  }, [staffSalesList]);

  const insights = useMemo(() => {
    if (!data) return [];
    const list = [];
    if (data.metrics.revenue_growth > 0) list.push(`Revenue is up by ${data.metrics.revenue_growth.toFixed(1)}% compared to the previous period.`);
    if (data.top_products?.length > 0) list.push(`${data.top_products[0].name} is currently your top-selling product.`);
    
    const peakHour = data.hourly_distribution?.reduce((prev: any, current: any) => (prev.orders > current.orders) ? prev : current);
    if (peakHour) list.push(`Peak sales activity observed at ${peakHour.hour}:00.`);
    
    return list;
  }, [data]);

  const setDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'this_month') => {
    const now = new Date();
    const pad = (n: number) => n < 10 ? '0' + n : n;
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const todayStr = toStr(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = toStr(yest);
      setStartDate(yestStr);
      setEndDate(yestStr);
    } else if (preset === '7days') {
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 7);
      setStartDate(toStr(past7));
      setEndDate(toStr(now));
    } else if (preset === '30days') {
      const past30 = new Date(now);
      past30.setDate(past30.getDate() - 30);
      setStartDate(toStr(past30));
      setEndDate(toStr(now));
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toStr(firstDay));
      setEndDate(toStr(now));
    }
    setShowFilter(false);
  };

  const COLORS = ['#00d2ff', '#ff2f92', '#ffb36a', '#4CAF50', '#8884d8'];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '60px' }}>
      <style>{`
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 12px;
        }
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (max-width: 640px) {
          .analytics-desktop-table {
            display: none !important;
          }
          .analytics-mobile-cards {
            display: flex !important;
          }
        }
        @media (min-width: 641px) {
          .analytics-desktop-table {
            display: block !important;
          }
          .analytics-mobile-cards {
            display: none !important;
          }
        }
        .target-grid-responsive {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 16px;
        }
        @media (max-width: 900px) {
          .target-grid-responsive {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <header className="analytics-header">
        <div className="analytics-title-wrap">
          <h1 style={{ fontSize: 'clamp(20px, 4.5vw, 30px)', marginBottom: '4px', fontWeight: '900', letterSpacing: '-0.8px', wordBreak: 'break-word', lineHeight: 1.2 }}>
            Executive Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
            Advanced sales intelligence and performance metrics.
          </p>
        </div>
        
        <div className="analytics-date-action-wrap">
          <button 
            onClick={() => setShowFilter(true)}
            className="btn-lucrative analytics-filter-trigger-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Calendar size={16} color="var(--accent-gold)" />
            <span style={{ fontSize: '12px', fontWeight: '700' }}>{startDate} — {endDate}</span>
            <ChevronDown size={14} style={{ opacity: 0.7 }} />
          </button>
        </div>
      </header>

      {/* Responsive Filter Modal Overlay */}
      {showFilter && (
        <div 
          className="analytics-filter-modal-overlay"
          onClick={() => setShowFilter(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div 
            className="glass-card animate-in fade-in" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: '100%',
              maxWidth: '380px',
              border: '1px solid rgba(255,47,146,0.3)',
              background: '#0a0f1e',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              borderRadius: '20px',
              padding: '22px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--primary-glow)" />
                <span style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'white' }}>
                  Filter Analysis Range
                </span>
              </div>
              <button 
                onClick={() => setShowFilter(false)} 
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
                Quick Ranges
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Today', key: 'today' },
                  { label: 'Yesterday', key: 'yesterday' },
                  { label: 'Last 7 Days', key: '7days' },
                  { label: 'Last 30 Days', key: '30days' },
                  { label: 'This Month', key: 'this_month' },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setDatePreset(preset.key as any)}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '700' }}>START</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-premium" style={{ width: '100%', fontSize: '12px', padding: '10px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '700' }}>END</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-premium" style={{ width: '100%', fontSize: '12px', padding: '10px' }} />
                </div>
              </div>
              <button 
                onClick={() => setShowFilter(false)} 
                className="btn-lucrative" 
                style={{ width: '100%', padding: '12px', fontSize: '12px' }}
              >
                Apply Range Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Modal (Admin Only) */}
      {showTargetModal && isOutletAdmin && (
        <div 
          className="analytics-filter-modal-overlay"
          onClick={() => setShowTargetModal(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 2100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div 
            className="glass-card animate-in fade-in" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: '100%',
              maxWidth: '440px',
              border: '1px solid rgba(255,47,146,0.3)',
              background: '#0a0f1e',
              boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
              borderRadius: '20px',
              padding: '24px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={20} color="var(--primary-glow)" />
                <span style={{ fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'white' }}>
                  {editingTargetId ? 'Edit Sales Target' : 'Set Outlet Sales Target'}
                </span>
              </div>
              <button 
                onClick={() => setShowTargetModal(false)} 
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveTarget} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                  TARGET TITLE / CAMPAIGN
                </label>
                <input 
                  type="text" 
                  value={targetForm.title} 
                  onChange={e => setTargetForm({ ...targetForm, title: e.target.value })} 
                  placeholder="e.g. Weekly Target or Diwali Rush"
                  className="input-premium" 
                  style={{ width: '100%', fontSize: '13px', padding: '10px 14px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                  TARGET REVENUE AMOUNT (₹)
                </label>
                <input 
                  type="number" 
                  step="1"
                  min="1"
                  value={targetForm.target_amount} 
                  onChange={e => setTargetForm({ ...targetForm, target_amount: e.target.value })} 
                  placeholder="e.g. 20000"
                  className="input-premium" 
                  style={{ width: '100%', fontSize: '13px', padding: '10px 14px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                    START DATE
                  </label>
                  <input 
                    type="date" 
                    value={targetForm.start_date} 
                    onChange={e => setTargetForm({ ...targetForm, start_date: e.target.value })} 
                    className="input-premium" 
                    style={{ width: '100%', fontSize: '12px', padding: '10px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                    END DATE
                  </label>
                  <input 
                    type="date" 
                    value={targetForm.end_date} 
                    onChange={e => setTargetForm({ ...targetForm, end_date: e.target.value })} 
                    className="input-premium" 
                    style={{ width: '100%', fontSize: '12px', padding: '10px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button"
                  onClick={() => setShowTargetModal(false)}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    borderRadius: '10px', 
                    background: 'rgba(255,255,255,0.06)', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={targetSaving}
                  className="btn-lucrative" 
                  style={{ flex: 1.5, padding: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {targetSaving ? (
                    <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>{editingTargetId ? 'Update Target' : 'Save Target'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Metrics Grid */}
      <div className="analytics-metrics-grid">
        <AnalyticsCard 
          title="Total Revenue" 
          value={`₹${data?.metrics?.total_revenue?.toLocaleString() || '0'}`}
          trend={data?.metrics?.revenue_growth}
          subtitle="Net revenue in period"
          icon={<TrendingUp size={20} color="var(--primary-glow)" />}
          loading={loading}
        />
        <AnalyticsCard 
          title="Total Orders" 
          value={data?.metrics?.total_orders?.toLocaleString() || '0'}
          trend={data?.metrics?.order_growth}
          subtitle="Successfully delivered"
          icon={<ShoppingBag size={20} color="var(--secondary-glow)" />}
          loading={loading}
        />
        <AnalyticsCard 
          title="Average Order Value" 
          value={`₹${Math.round(data?.metrics?.avg_order_value || 0)}`}
          subtitle="Revenue per ticket"
          icon={<Zap size={20} color="var(--accent-gold)" />}
          loading={loading}
        />
        <AnalyticsCard 
          title="Active Insights" 
          value={insights.length}
          subtitle="AI-detected patterns"
          icon={<Clock size={20} color="#4CAF50" />}
          loading={loading}
        />
      </div>

      {/* Insights Panel */}
      {!loading && insights.length > 0 && (
        <div className="glass-card analytics-insights-panel" style={{ padding: '16px', background: 'rgba(0, 210, 255, 0.03)', border: '1px solid rgba(0, 210, 255, 0.1)' }}>
          <div style={{ background: 'var(--primary-glow)', padding: '8px', borderRadius: '10px', color: 'white', flexShrink: 0 }}>
            <Zap size={18} />
          </div>
          <div className="analytics-insights-list" style={{ minWidth: 0, flex: 1 }}>
            {insights.map((insight, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: 'white', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.4, wordBreak: 'break-word' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary-glow)', flexShrink: 0, marginTop: '6px' }} />
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Trend Chart */}
      <ChartContainer title="Revenue & Order Volume Trend" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data?.trend} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary-glow)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--primary-glow)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="var(--text-muted)" 
              fontSize={10} 
              interval="preserveStartEnd"
              tickFormatter={(val) => new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            />
            <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={10} width={38} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={10} width={25} />
            <Tooltip 
              contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
              itemStyle={{ color: 'white' }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} />
            <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary-glow)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
            <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="var(--secondary-glow)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Secondary Charts Grid */}
      <div className="analytics-chart-grid-2">
        
        {/* Top Products */}
        <ChartContainer 
          title="Top Performing Products" 
          loading={loading}
          headerAction={
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                onClick={() => setTopProductMetric('revenue')}
                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px', background: topProductMetric === 'revenue' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.06)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: '700' }}
              >
                BY REVENUE
              </button>
              <button 
                onClick={() => setTopProductMetric('quantity')}
                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px', background: topProductMetric === 'quantity' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.06)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: '700' }}
              >
                BY QTY
              </button>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.top_products} layout="vertical" margin={{ left: 0, right: 15, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={10} />
              <YAxis 
                dataKey="name" 
                type="category" 
                stroke="var(--text-muted)" 
                fontSize={10} 
                width={85} 
                tickFormatter={(val) => val && val.length > 12 ? val.slice(0, 10) + '..' : val}
              />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              />
              <Bar dataKey={topProductMetric} fill="var(--primary-glow)" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Payment Distribution */}
        <ChartContainer title="Payment Mode Distribution" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data?.payment_modes}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={68}
                paddingAngle={5}
                dataKey="amount"
                nameKey="mode"
              >
                {data?.payment_modes?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
              <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

      </div>

      <div className="analytics-chart-grid-2-alt">
        
        {/* Peak Hours */}
        <ChartContainer title="Peak Hours Analysis" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.hourly_distribution} margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={10} interval={2} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="var(--text-muted)" fontSize={10} width={30} />
              <Tooltip contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
              <Bar dataKey="orders" fill="var(--secondary-glow)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Product Performance Scatter */}
        <ChartContainer title="Product Efficiency (Revenue vs Volume)" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" dataKey="quantity" name="Quantity" unit=" units" stroke="var(--text-muted)" fontSize={10} />
              <YAxis type="number" dataKey="revenue" name="Revenue" unit="₹" stroke="var(--text-muted)" fontSize={10} />
              <ZAxis type="category" dataKey="name" name="Product" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
              <Scatter name="Products" data={data?.top_products} fill="var(--accent-gold)">
                {data?.top_products?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartContainer>

      </div>

      {/* ========================================================================= */}
      {/* OUTLET SALES TARGET & ACHIEVEMENT SECTION                                */}
      {/* ========================================================================= */}
      <div style={{ marginTop: '20px' }}>
        <ChartContainer 
          title="Outlet Sales Target & Achievement" 
          loading={targetsLoading}
          headerAction={
            isOutletAdmin && (
              <button
                onClick={openNewTargetModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--primary-glow), #E11D48)',
                  border: 'none',
                  color: 'white',
                  fontWeight: '800',
                  fontSize: '11px',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 47, 146, 0.3)'
                }}
              >
                <Plus size={14} />
                <span>SET TARGET</span>
              </button>
            )
          }
        >
          {targetsList.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(255, 47, 146, 0.1)', border: '1px solid rgba(255, 47, 146, 0.25)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px'
              }}>
                <Target size={24} color="var(--primary-glow)" />
              </div>
              <h4 style={{ margin: '0 0 6px', color: 'white', fontSize: '15px', fontWeight: '800' }}>
                No Sales Targets Configured
              </h4>
              <p style={{ margin: '0 auto 16px', maxWidth: '420px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {isOutletAdmin 
                  ? 'Set a sales milestone for this outlet with custom start and end dates to motivate and track staff performance.' 
                  : 'Your outlet admin has not published an active sales target yet.'}
              </p>
              {isOutletAdmin && (
                <button
                  onClick={openNewTargetModal}
                  className="btn-lucrative"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px' }}
                >
                  <Plus size={14} />
                  <span>Create First Target</span>
                </button>
              )}
            </div>
          ) : (
            <div className="target-grid-responsive">
              {/* Left Column: Active / Selected Target Bar Graph & Metric Cards */}
              {selectedTarget && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  {/* Target Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                          background: 'rgba(255, 47, 146, 0.15)', color: 'var(--primary-glow)',
                          border: '1px solid rgba(255, 47, 146, 0.3)'
                        }}>
                          SELECTED TARGET
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {selectedTarget.start_date} ➔ {selectedTarget.end_date}
                        </span>
                      </div>
                      <h4 style={{ margin: '6px 0 0', fontSize: '17px', fontWeight: '900', color: 'white' }}>
                        {selectedTarget.title}
                      </h4>
                    </div>

                    <button
                      onClick={() => handleInspectTarget(selectedTarget)}
                      style={{
                        background: 'rgba(255, 179, 106, 0.12)',
                        border: '1px solid rgba(255, 179, 106, 0.3)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        color: 'var(--accent-gold)',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Users size={13} />
                      <span>View Staff Sales</span>
                    </button>
                  </div>

                  {/* 4-Stat Grid for Current Target */}
                  {(() => {
                    const tAmt = Number(selectedTarget.target_amount) || 0;
                    const aAmt = targetsProgressMap[selectedTarget.id]?.achieved || 0;
                    const pct = tAmt > 0 ? (aAmt / tAmt) * 100 : 0;
                    const gap = Math.max(0, tAmt - aAmt);
                    const isAchieved = aAmt >= tAmt;

                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Target Goal</div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--accent-gold)', marginTop: '2px' }}>
                              ₹{tAmt.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Achieved Sales</div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: isAchieved ? '#10B981' : 'var(--primary-glow)', marginTop: '2px' }}>
                              ₹{aAmt.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Progress</div>
                            <div style={{ fontSize: '15px', fontWeight: '900', color: 'white', marginTop: '2px' }}>
                              {pct.toFixed(1)}%
                            </div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Status</div>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: isAchieved ? '#10B981' : '#F59E0B', marginTop: '2px' }}>
                              {isAchieved ? '🎉 Achieved!' : `₹${gap.toLocaleString()} left`}
                            </div>
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div>
                          <div style={{
                            width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)',
                            borderRadius: '999px', overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(100, pct)}%`,
                              height: '100%',
                              background: isAchieved 
                                ? 'linear-gradient(90deg, #10B981, #059669)'
                                : 'linear-gradient(90deg, var(--primary-glow), var(--accent-gold))',
                              borderRadius: '999px',
                              transition: 'width 0.6s ease'
                            }} />
                          </div>
                        </div>

                        {/* Comparative Bar Chart: Target vs Achieved */}
                        <div style={{ width: '100%', height: 180, marginTop: '4px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedTargetChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                              <YAxis stroke="var(--text-muted)" fontSize={10} width={40} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`} />
                              <Tooltip contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                              <Bar dataKey="Target Goal (₹)" fill="var(--accent-gold)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                              <Bar 
                                dataKey="Achieved Sales (₹)" 
                                fill={isAchieved ? '#10B981' : 'var(--primary-glow)'} 
                                radius={[4, 4, 0, 0]} 
                                maxBarSize={45} 
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Right Column: Targets History & Management */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'white' }}>
                    All Targets for this Outlet
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {targetsList.length} Total
                  </span>
                </div>

                {/* Targets Scrollable List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                  {targetsList.map((t) => {
                    const tAmt = Number(t.target_amount) || 0;
                    const aAmt = targetsProgressMap[t.id]?.achieved || 0;
                    const pct = tAmt > 0 ? (aAmt / tAmt) * 100 : 0;
                    const isSelected = selectedTarget?.id === t.id;
                    const isMet = aAmt >= tAmt;

                    return (
                      <div
                        key={t.id}
                        style={{
                          background: isSelected ? 'rgba(255, 47, 146, 0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSelected ? 'rgba(255, 47, 146, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                          borderRadius: '12px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setSelectedTarget(t)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: '800', fontSize: '13px', color: 'white' }}>
                                {t.title}
                              </span>
                              {isMet && (
                                <span style={{
                                  padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800',
                                  background: 'rgba(16, 185, 129, 0.15)', color: '#10B981'
                                }}>
                                  ✓ MET
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {t.start_date} to {t.end_date}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => handleInspectTarget(t)}
                              title="View Staff Contribution for this Target"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                color: 'var(--accent-gold)',
                                fontSize: '10px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Users size={12} />
                              <span>Staff</span>
                            </button>
                            {isOutletAdmin && (
                              <>
                                <button
                                  onClick={() => openEditTargetModal(t)}
                                  title="Edit Target"
                                  style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteTarget(t.id, t.title)}
                                  title="Delete Target"
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px',
                                    color: '#EF4444',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Progress Row */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '11px',
                          borderTop: '1px solid rgba(255,255,255,0.04)',
                          paddingTop: '6px'
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Target: <b style={{ color: 'white' }}>₹{tAmt.toLocaleString()}</b>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Achieved: <b style={{ color: isMet ? '#10B981' : 'var(--primary-glow)' }}>₹{aAmt.toLocaleString()}</b>
                          </span>
                          <span style={{ fontWeight: '800', color: isMet ? '#10B981' : 'white' }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </ChartContainer>
      </div>

      {/* Employee Sales Performance */}
      <div style={{ marginTop: '20px' }}>
        <ChartContainer title="Staff Performance (Revenue & Orders)" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={staffChartData} margin={{ top: 10, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} interval={0} />
              <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={10} width={38} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={10} width={25} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} 
              />
              <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
              <Bar yAxisId="left" dataKey="revenue" name="Revenue (₹)" fill="var(--primary-glow)" radius={[4, 4, 0, 0]} maxBarSize={45} />
              <Bar yAxisId="right" dataKey="orders" name="Orders Taken" fill="var(--accent-gold)" radius={[4, 4, 0, 0]} maxBarSize={45} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Outlet Staff Performance Table (Without Bonus Column) */}
      <div id="staff-breakdown-section" className="glass-card" style={{ padding: 0, overflow: 'hidden', marginTop: '20px' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'white' }}>
            Outlet Staff Sales Breakdown
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            Sales metrics for employees at this outlet (based on staff names configured in Superadmin)
          </p>
        </div>

        {/* Target Context Banner when viewing target contributors */}
        {selectedTarget && startDate === selectedTarget.start_date && endDate === selectedTarget.end_date && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(255, 47, 146, 0.15), rgba(255, 179, 106, 0.1))',
            borderBottom: '1px solid rgba(255, 47, 146, 0.25)',
            padding: '10px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={16} color="var(--primary-glow)" />
              <span style={{ fontSize: '12px', fontWeight: '800', color: 'white' }}>
                Filtered for Target: <span style={{ color: 'var(--accent-gold)' }}>"{selectedTarget.title}"</span> ({selectedTarget.start_date} to {selectedTarget.end_date})
              </span>
            </div>
            <button
              onClick={() => setDatePreset('30days')}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '4px 10px',
                color: 'white',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RotateCcw size={12} />
              <span>Reset Date Filter</span>
            </button>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="analytics-desktop-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)' }}>
                <th style={{ padding: '14px 20px' }}>Rank</th>
                <th style={{ padding: '14px 20px' }}>Staff Name</th>
                <th style={{ padding: '14px 20px' }}>Role</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Orders Taken</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Total Sales (₹)</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Cash Handled (₹)</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Avg Ticket (₹)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : staffSalesList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No counter sales recorded for staff during this period.
                  </td>
                </tr>
              ) : (
                staffSalesList.map((staff, idx) => (
                  <tr key={staff.staff_id || idx} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ 
                        width: '24px', height: '24px', borderRadius: '50%', 
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800',
                        background: idx === 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' : (idx === 1 ? 'linear-gradient(135deg, #E0E0E0, #BDBDBD)' : (idx === 2 ? 'linear-gradient(135deg, #CD7F32, #8D5524)' : 'rgba(255,255,255,0.05)')),
                        color: idx <= 1 ? 'black' : 'white'
                      }}>
                        {idx + 1}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px', color: 'white' }}>
                      {staff.staff_name}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Staff Card View */}
        <div className="analytics-mobile-cards" style={{ flexDirection: 'column', gap: '10px', padding: '12px' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : staffSalesList.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No counter sales recorded for staff during this period.
            </div>
          ) : (
            staffSalesList.map((staff, idx) => (
              <div 
                key={staff.staff_id || idx}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: '800',
                      background: idx === 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' : (idx === 1 ? 'linear-gradient(135deg, #E0E0E0, #BDBDBD)' : (idx === 2 ? 'linear-gradient(135deg, #CD7F32, #8D5524)' : 'rgba(255,255,255,0.08)')),
                      color: idx <= 1 ? 'black' : 'white',
                      flexShrink: 0
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{ fontWeight: '800', fontSize: '14px', color: 'white' }}>
                      {staff.staff_name}
                    </span>
                  </div>
                  <span style={{
                    padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '800',
                    background: staff.role === 'OUTLET_MANAGER' ? 'rgba(255,47,146,0.15)' : 'rgba(255,179,106,0.12)',
                    color: staff.role === 'OUTLET_MANAGER' ? 'var(--primary-glow)' : 'var(--secondary-orange)'
                  }}>
                    {(staff.role || 'STAFF').replace('OUTLET_', '')}
                  </span>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '6px', 
                  paddingTop: '8px', 
                  borderTop: '1px solid rgba(255,255,255,0.04)' 
                }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Orders</div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: 'white', marginTop: '1px' }}>{staff.total_orders}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Total Sales</div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary-glow)', marginTop: '1px' }}>₹{staff.total_sales.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Cash Handled</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginTop: '1px' }}>₹{staff.cash_collected.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Avg Ticket</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-gold)', marginTop: '1px' }}>₹{staff.avg_order_value}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
