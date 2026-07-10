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
  ChevronDown
} from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

// --- Sub-components ---

const AnalyticsCard = ({ title, value, subtitle, trend, icon, loading }: any) => (
  <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '140px' }}>
    {loading ? (
      <div className="skeleton" style={{ height: '100%', width: '100%' }} />
    ) : (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>{title}</div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '10px' }}>{icon}</div>
        </div>
        <div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: 'white', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            {value}
            {trend !== undefined && (
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: trend >= 0 ? '#4CAF50' : '#ff6b6b', display: 'flex', alignItems: 'center' }}>
                {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(trend).toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{subtitle}</div>
        </div>
      </>
    )}
  </div>
);

const ChartContainer = ({ title, children, loading, height = 350 }: any) => (
  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'white' }}>{title}</h3>
    </div>
    <div style={{ height, width: '100%', position: 'relative' }}>
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

  const cinemaId = user.cinema_id;

  useEffect(() => {
    fetchAnalytics();
  }, [cinemaId, startDate, endDate]);

  const fetchAnalytics = async () => {
    if (!cinemaId || cinemaId === 'default') return;
    setLoading(true);
    try {
      const { data: analytics, error } = await supabase.rpc('get_sales_analytics', {
        p_cinema_id: cinemaId,
        p_start_date: startDate + 'T00:00:00Z',
        p_end_date: endDate + 'T23:59:59Z'
      });

      if (error) throw error;
      setData(analytics);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const insights = useMemo(() => {
    if (!data) return [];
    const list = [];
    if (data.metrics.revenue_growth > 0) list.push(`Revenue is up by ${data.metrics.revenue_growth.toFixed(1)}% compared to the previous period.`);
    if (data.top_products?.length > 0) list.push(`${data.top_products[0].name} is currently your top-selling product.`);
    
    const peakHour = data.hourly_distribution?.reduce((prev: any, current: any) => (prev.orders > current.orders) ? prev : current);
    if (peakHour) list.push(`Peak sales activity observed at ${peakHour.hour}:00.`);
    
    return list;
  }, [data]);

  const COLORS = ['#00d2ff', '#ff2f92', '#ffb36a', '#4CAF50', '#8884d8'];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
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
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1px' }}>Executive Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }}>Advanced sales intelligence and performance metrics.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowFilter(!showFilter)}
              className="btn-lucrative"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.05)' }}
            >
              <Calendar size={18} /> {startDate} — {endDate}
            </button>
            {showFilter && (
              <div className="glass-card animate-in fade-in" style={{ 
                position: 'absolute', top: 'calc(100% + 12px)', right: 0, zIndex: 1000, 
                padding: '24px', width: '340px', border: '1px solid rgba(255,47,146,0.3)',
                background: 'var(--bg-dark)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Filter Analysis Range</span>
                  <X size={16} style={{ cursor: 'pointer' }} onClick={() => setShowFilter(false)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>START</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-premium" style={{ width: '100%', fontSize: '12px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>END</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-premium" style={{ width: '100%', fontSize: '12px' }} />
                    </div>
                  </div>
                  <button onClick={() => setShowFilter(false)} className="btn-lucrative" style={{ padding: '12px' }}>Regenerate Report</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Top Metrics Grid */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
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
        <div className="glass-card" style={{ padding: '20px', background: 'rgba(0, 210, 255, 0.03)', border: '1px solid rgba(0, 210, 255, 0.1)', display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ background: 'var(--primary-glow)', padding: '10px', borderRadius: '12px', color: 'white' }}><Zap size={20} /></div>
          <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
            {insights.map((insight, idx) => (
              <div key={idx} style={{ fontSize: '13px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary-glow)' }} />
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Trend Chart */}
      <ChartContainer title="Revenue & Order Volume Trend" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data?.trend}>
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
              tickFormatter={(val) => new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            />
            <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => `₹${val}`} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={10} />
            <Tooltip 
              contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
              itemStyle={{ color: 'white' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
            <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary-glow)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
            <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="var(--secondary-glow)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Secondary Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        
        {/* Top Products */}
        <ChartContainer title="Top Performing Products" loading={loading}>
          <div style={{ position: 'absolute', top: -45, right: 0, display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setTopProductMetric('revenue')}
              style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '8px', background: topProductMetric === 'revenue' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              BY REVENUE
            </button>
            <button 
              onClick={() => setTopProductMetric('quantity')}
              style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '8px', background: topProductMetric === 'quantity' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              BY QUANTITY
            </button>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.top_products} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={10} />
              <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={10} width={100} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              />
              <Bar dataKey={topProductMetric} fill="var(--primary-glow)" radius={[0, 4, 4, 0]} barSize={20} />
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
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="amount"
                nameKey="mode"
              >
                {data?.payment_modes?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
        
        {/* Peak Hours */}
        <ChartContainer title="Peak Hours Analysis" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.hourly_distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={10} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="var(--text-muted)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
              <Bar dataKey="orders" fill="var(--secondary-glow)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Product Performance Scatter */}
        <ChartContainer title="Product Efficiency (Revenue vs Volume)" loading={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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

    </div>
  );
}
