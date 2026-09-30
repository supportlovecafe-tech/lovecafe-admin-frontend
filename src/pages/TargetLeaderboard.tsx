import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Award, Target, Trophy, TrendingUp, Calendar, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

export default function TargetLeaderboard({ user }) {
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState(null);
  const [achievedSales, setAchievedSales] = useState(0);
  const [staffSalesData, setStaffSalesData] = useState([]);
  
  const cinemaId = user?.cinema_id;

  useEffect(() => {
    if (cinemaId) {
      fetchData();
    }
  }, [cinemaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch active targets
      const now = new Date().toISOString();
      const { data: targets, error: targetError } = await supabase
        .from('outlet_sales_targets')
        .select('*')
        .eq('cinema_id', cinemaId)
        .lte('start_date', now)
        .gte('end_date', now)
        .order('start_date', { ascending: false })
        .limit(1);

      if (targetError) throw targetError;

      if (!targets || targets.length === 0) {
        setActiveTarget(null);
        setLoading(false);
        return;
      }

      const currentTarget = targets[0];
      setActiveTarget(currentTarget);

      // Adjust dates for IST
      const startIso = new Date(new Date(currentTarget.start_date).getTime() - 19800000).toISOString();
      const endIso = new Date(new Date(currentTarget.end_date).getTime() + 66599999).toISOString();

      // 2. Fetch Achieved Sales for this target
      const { data: orderData } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('cinema_id', cinemaId)
        .not('status', 'in', '("CANCELLED","REFUNDED")')
        .gte('timestamp', startIso)
        .lte('timestamp', endIso);

      const totalAchieved = (orderData || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      setAchievedSales(totalAchieved);

      // 3. Fetch Staff Leaderboard within this target's dates
      const { data: staffData, error: staffError } = await supabase.rpc('get_staff_sales_report', {
        p_cinema_id: cinemaId,
        p_start_date: startIso,
        p_end_date: endIso
      });
      
      if (!staffError && staffData && staffData.staff_sales) {
        const sortedStaff = staffData.staff_sales.sort((a, b) => b.total_sales - a.total_sales);
        setStaffSalesData(sortedStaff);
      } else {
        setStaffSalesData([]);
      }

    } catch (err) {
      console.error("Error fetching target leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 className="spinner" size={48} color="var(--primary-glow)" />
        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading Sales Target Data...</p>
      </div>
    );
  }

  if (!activeTarget) {
    return (
      <div className="animate-fade-in" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px' }}>
          <Target size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'white' }}>No Active Target</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>There is currently no active sales target running for this outlet.</p>
        </div>
      </div>
    );
  }

  const targetAmount = Number(activeTarget.target_amount) || 0;
  const progressPercent = targetAmount > 0 ? (achievedSales / targetAmount) * 100 : 0;
  const isMet = achievedSales >= targetAmount;
  const remainingTarget = Math.max(0, targetAmount - achievedSales);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Award size={32} color="var(--primary-glow)" /> Target Leaderboard
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} /> 
            {new Date(activeTarget.start_date).toLocaleDateString()} — {new Date(activeTarget.end_date).toLocaleDateString()}
          </p>
        </div>
        <div style={{ background: 'rgba(255,47,146,0.1)', border: '1px solid var(--primary-glow)', padding: '10px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--primary-glow)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Sprint</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: 'white', marginTop: '2px' }}>{activeTarget.title || 'Sales Target'}</div>
        </div>
      </div>

      {/* Target Progress Section */}
      <div className="glass-card" style={{ padding: '30px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={18} /> Outlet Progress
        </h2>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Current Achieved</div>
            <div style={{ fontSize: '36px', fontWeight: '900', color: isMet ? '#10B981' : 'white', lineHeight: '1' }}>
              ₹{achievedSales.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Target Goal</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-gold)' }}>
              ₹{targetAmount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
          <div style={{
            width: `${Math.min(100, progressPercent)}%`,
            height: '100%',
            background: isMet ? 'linear-gradient(90deg, #10B981, #059669)' : 'linear-gradient(90deg, var(--primary-glow), var(--accent-gold))',
            borderRadius: '999px',
            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3))' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', fontWeight: '700' }}>
          <span style={{ color: isMet ? '#10B981' : 'white' }}>{progressPercent.toFixed(1)}% Completed</span>
          <span style={{ color: isMet ? '#10B981' : '#F59E0B' }}>
            {isMet ? '🎉 Target Achieved!' : `₹${remainingTarget.toLocaleString()} left to goal`}
          </span>
        </div>
      </div>

      {/* Staff Leaderboard Section */}
      <div className="glass-card" style={{ padding: '30px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={18} /> Employee Leaderboard
        </h2>

        {staffSalesData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <TrendingUp size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>No sales recorded yet during this target period.</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffSalesData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="staff_name" 
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  dy={10}
                />
                <YAxis 
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 }}
                  tickFormatter={(val) => `₹${val}`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                          <div style={{ fontWeight: '900', fontSize: '14px', marginBottom: '8px' }}>{data.staff_name}</div>
                          <div style={{ color: 'var(--primary-glow)', fontWeight: 'bold', fontSize: '16px' }}>₹{data.total_sales.toLocaleString()}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Orders: {data.total_orders}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="total_sales" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={60}
                >
                  {staffSalesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--primary-glow)' : (index === 1 ? 'var(--accent-gold)' : (index === 2 ? '#94a3b8' : 'rgba(255,255,255,0.1)'))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
}
