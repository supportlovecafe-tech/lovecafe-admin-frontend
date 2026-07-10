import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, AlertTriangle, CheckCircle, Clock, Zap } from 'lucide-react';

interface HealthStats {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  timestamp: string;
  services: {
    redis: {
      status: string;
      queue_length: number;
      dlq_length: number;
      last_worker_run: string;
    };
    database: {
      status: string;
      latency_ms: number;
      error: string | null;
    };
  };
  performance: {
    api_latency_ms: number;
  };
}

export default function SystemHealthDashboard() {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/api/health/stats?secret=${import.meta.env.VITE_HEALTH_SECRET}`);
      if (!response.ok) throw new Error('Failed to fetch health stats');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Activity size={32} color="var(--primary-glow)" /> System Health
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Real-time monitoring of backend services and order pipelines.</p>
        </div>
        {stats && (
           <div className="glass-card" style={{ padding: '12px 24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: 12, height: 12, borderRadius: '50%', 
                background: stats.status === 'HEALTHY' ? '#4CAF50' : '#FFC107',
                boxShadow: stats.status === 'HEALTHY' ? '0 0 10px #4CAF50' : '0 0 10px #FFC107'
              }} />
              <span style={{ fontWeight: 'bold', color: stats.status === 'HEALTHY' ? '#4CAF50' : '#FFC107' }}>
                SYSTEM {stats.status}
              </span>
           </div>
        )}
      </header>

      {error && (
        <div className="glass-card" style={{ padding: '24px', border: '1px solid rgba(244,67,54,0.3)', background: 'rgba(244,67,54,0.05)', color: '#F44336', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <AlertTriangle size={24} />
          <div>
            <div style={{ fontWeight: 'bold' }}>Connectivity Error</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{error}. Make sure the backend is running at {import.meta.env.VITE_BACKEND_API_URL}</div>
          </div>
        </div>
      )}

      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            
            {/* Redis Health */}
            <div className="glass-card" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Server size={24} color="var(--secondary-glow)" />
                  <h3 style={{ margin: 0 }}>Redis Clusters</h3>
                </div>
                <StatusBadge status={stats.services.redis.status} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <HealthMetric 
                    label="Order Queue" 
                    value={stats.services.redis.queue_length ?? 0} 
                    sub="Pending items" 
                    color={stats.services.redis.queue_length > 50 ? '#FFC107' : 'white'}
                />
                <HealthMetric 
                    label="Dead Letter Queue (DLQ)" 
                    value={stats.services.redis.dlq_length ?? 0} 
                    sub="Failed retries" 
                    color={stats.services.redis.dlq_length > 0 ? '#F44336' : 'white'}
                    urgent={stats.services.redis.dlq_length > 0}
                />
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>LAST WORKER HEARTBEAT</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                    <Clock size={14} /> 
                    {stats.services.redis.last_worker_run !== 'NEVER' 
                      ? new Date(stats.services.redis.last_worker_run).toLocaleString() 
                      : 'Disconnected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Database Health */}
            <div className="glass-card" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Database size={24} color="var(--accent-gold)" />
                  <h3 style={{ margin: 0 }}>Supabase DB</h3>
                </div>
                <StatusBadge status={stats.services.database.status} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <HealthMetric 
                    label="Read/Write Latency" 
                    value={`${stats.services.database.latency_ms ?? 0}ms`} 
                    sub="Round-trip time" 
                    color={stats.services.database.latency_ms > 500 ? '#FFC107' : 'white'}
                />
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>ACTIVE STORAGE</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                    <CheckCircle size={14} color="#4CAF50" /> Connected
                  </div>
                </div>
                {stats.services.database.error && (
                  <div style={{ fontSize: '12px', color: '#F44336', background: 'rgba(244,67,54,0.1)', padding: '8px', borderRadius: '8px' }}>
                    {stats.services.database.error}
                  </div>
                )}
              </div>
            </div>

            {/* API Performance */}
            <div className="glass-card" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Zap size={24} color="#FFEB3B" />
                <h3 style={{ margin: 0 }}>Edge Performance</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <HealthMetric 
                    label="Backend Response" 
                    value={`${stats.performance.api_latency_ms ?? 0}ms`} 
                    sub="Next.js edge time" 
                />
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                   <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>UPTIME REGION</div>
                   <div style={{ fontSize: '14px' }}>AWS-Mumbai (ap-south-1)</div>
                </div>
              </div>
            </div>

          </div>

          {stats.services.redis.dlq_length > 0 && (
            <div className="glass-card animate-pulse" style={{ padding: '24px', border: '2px solid #F44336', background: 'rgba(244,67,54,0.1)' }}>
                <h3 style={{ margin: 0, color: '#F44336', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle size={24} /> CRITICAL: Orders in Dead Letter Queue
                </h3>
                <p style={{ marginTop: '8px', opacity: 0.8 }}>There are {stats.services.redis.dlq_length} orders that failed processing after multiple retries. Manual intervention required.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const isUp = status === 'UP';
  return (
    <span style={{ 
      fontSize: '11px', fontWeight: 'bold', padding: '4px 10px', 
      background: isUp ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)', 
      color: isUp ? '#4CAF50' : '#F44336',
      borderRadius: '20px', border: `1px solid ${isUp ? '#4CAF5040' : '#F4433640'}`
    }}>
      {status || 'UNKNOWN'}
    </span>
  );
}

function HealthMetric({ label, value, sub, color = 'white', urgent = false }: { label: string, value: string | number, sub: string, color?: string, urgent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '36px', fontWeight: '900', color: color, display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        {value}
        {urgent && <span style={{ fontSize: '14px', color: '#F44336', fontWeight: 'bold' }}>⚠️ ACTION REQ</span>}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>
    </div>
  );
}
