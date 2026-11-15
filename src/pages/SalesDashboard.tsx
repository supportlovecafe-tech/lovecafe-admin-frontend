import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCinemaCycleStart, getCinemaCycleEnd, getISTNow, toDateStr, getOrderBusinessDate, getCurrentCinemaBusinessDate } from '../lib/cinemaDate';
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
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileSpreadsheet,
  Package
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
  const [startDate, setStartDate] = useState(() => {
    const d = getISTNow();
    d.setDate(d.getDate() - 30);
    return toDateStr(d);
  });
  const [endDate, setEndDate] = useState(() => toDateStr(getISTNow()));
  const [tempStartDate, setTempStartDate] = useState(() => {
    const d = getISTNow();
    d.setDate(d.getDate() - 30);
    return toDateStr(d);
  });
  const [tempEndDate, setTempEndDate] = useState(() => toDateStr(getISTNow()));
  const [showFilter, setShowFilter] = useState(false);
  const activeFetchIdRef = useRef<number>(0);
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

  // --- Product-Wise Daily Sales Report State ---
  const [productSalesList, setProductSalesList] = useState<any[]>([]);
  const [productSalesLoading, setProductSalesLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('ALL');
  const [productChannelFilter, setProductChannelFilter] = useState<'ALL' | 'POS' | 'ONLINE'>('ALL');
  const [onlineSalesStats, setOnlineSalesStats] = useState<{
    total_orders: number;
    total_sales: number;
    cash_sales: number;
    upi_sales: number;
  }>({ total_orders: 0, total_sales: 0, cash_sales: 0, upi_sales: 0 });
  const [productSortBy, setProductSortBy] = useState<
    'date_desc' | 'date_asc' | 'revenue_desc' | 'revenue_asc' | 'qty_desc' | 'qty_asc' | 'name_asc'
  >('date_desc');
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(25);

  useEffect(() => {
    fetchAnalytics();
    fetchProductSales();
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
            .gte('timestamp', new Date(new Date(t.start_date).getTime() - 19800000).toISOString())
            .lte('timestamp', new Date(new Date(t.end_date).getTime() + 66599999).toISOString());

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
    setTempStartDate(target.start_date);
    setTempEndDate(target.end_date);
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

  const formattedPaymentModes = useMemo(() => {
    if (!data?.payment_modes || !Array.isArray(data.payment_modes)) return [];
    const modeMap: Record<string, { mode: string; count: number; amount: number }> = {};
    
    data.payment_modes.forEach((pm: any) => {
      let label = pm.mode || 'Other';
      if (label === 'POS_CASH' || label === 'CASH') label = 'Cash';
      else if (label === 'DEMO_UPI' || label === 'POS_UPI' || label === 'UPI') label = 'UPI';
      else if (label === 'POS_SPLIT_CASH') label = 'Split Cash';
      else if (label === 'POS_SPLIT_UPI') label = 'Split UPI';
      else if (label === 'DEMO_CARD' || label === 'CARD') label = 'Card';
      else if (label === 'PAY_ON_DELIVERY' || label === 'PAY_LATER') label = 'Pay on Delivery';
      else label = label.replace(/_/g, ' ');

      if (!modeMap[label]) {
        modeMap[label] = { mode: label, count: 0, amount: 0 };
      }
      modeMap[label].count += Number(pm.count || 0);
      modeMap[label].amount += Number(pm.amount || 0);
    });

    return Object.values(modeMap).map(m => ({
      ...m,
      amount: Math.round(m.amount * 100) / 100
    }));
  }, [data?.payment_modes]);

  const fetchAnalytics = async () => {
    if (!cinemaId || cinemaId === 'default') return;
    const fetchId = ++activeFetchIdRef.current;
    setLoading(true);
    try {
      if (!startDate || !endDate) {
        setLoading(false);
        return;
      }
      const startIso = getCinemaCycleStart(startDate);
      const endIso = getCinemaCycleEnd(endDate);

      if (!startIso || !endIso) {
        setLoading(false);
        return;
      }

      const [analyticsRes, staffReportRes] = await Promise.all([
        supabase.rpc('get_sales_analytics', {
          p_cinema_id: cinemaId,
          p_start_date: startIso,
          p_end_date: endIso
        }),
        supabase.rpc('get_staff_sales_report', {
          p_cinema_id: cinemaId,
          p_start_date: startIso,
          p_end_date: endIso
        })
      ]);

      if (fetchId !== activeFetchIdRef.current) return;

      if (analyticsRes.error) {
        console.error('Error fetching analytics:', analyticsRes.error);
        setData({
          metrics: { total_revenue: 0, total_orders: 0, avg_order_value: 0, revenue_growth: 0, order_growth: 0 },
          trend: [],
          top_products: [],
          hourly_distribution: [],
          payment_modes: []
        });
      } else {
        setData(analyticsRes.data);
      }

      if (staffReportRes.error) {
        console.error('Error fetching staff sales report:', staffReportRes.error);
        setStaffSalesList([]);
      } else if (staffReportRes.data && staffReportRes.data.staff_sales) {
        setStaffSalesList(staffReportRes.data.staff_sales);
      } else {
        setStaffSalesList([]);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      if (fetchId === activeFetchIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchProductSales = async () => {
    if (!cinemaId || cinemaId === 'default') return;
    const fetchId = activeFetchIdRef.current;
    setProductSalesLoading(true);
    try {
      if (!startDate || !endDate) {
        setProductSalesLoading(false);
        return;
      }
      const startIso = getCinemaCycleStart(startDate);
      const endIso = getCinemaCycleEnd(endDate);

      if (!startIso || !endIso) {
        setProductSalesLoading(false);
        return;
      }

      let query = supabase
        .from('orders')
        .select('id, timestamp, items, status, staff_id, payment_method, total_amount, payment_status, metadata, collected_cash, return_cash')
        .eq('cinema_id', cinemaId)
        .not('status', 'in', '("CANCELLED","REFUNDED")')
        .gte('timestamp', startIso)
        .lte('timestamp', endIso);

      const [ordersRes, menuRes, comboRes] = await Promise.all([
        query.limit(10000),
        supabase.from('food_items').select('id, name, category'),
        supabase.from('combos').select('id, name')
      ]);

      if (fetchId !== activeFetchIdRef.current) return;

      if (ordersRes.error) {
        console.warn('Orders query error for product sales:', ordersRes.error.message);
      }

      const orders = ordersRes.data || [];

      // Calculate Online App vs POS Counter Sales for the Staff Breakdown Table
      const onlineOrders = orders.filter((o: any) => !o.staff_id);
      const onlineOrdersCount = onlineOrders.length;
      const onlineTotalSales = onlineOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);

      const isOrderCash = (o: any) => {
        if (o.payment_method === 'CASH' || o.payment_method === 'POS_CASH') return true;
        if (o.metadata?.settled_payment_mode === 'CASH') return true;
        return false;
      };

      const isOrderUpi = (o: any) => {
        if (['DEMO_UPI', 'UPI', 'POS_UPI', 'DEMO_CARD', 'CARD', 'ONLINE'].includes(o.payment_method)) return true;
        if (o.metadata?.settled_payment_mode === 'UPI') return true;
        if (!isOrderCash(o) && o.payment_method !== 'PAY_ON_DELIVERY' && o.payment_method !== 'PAY_LATER') return true;
        return false;
      };

      const onlineCashSales = onlineOrders.reduce((sum: number, o: any) => {
        if (o.payment_method === 'POS_SPLIT') {
          return sum + (Number(o.metadata?.split_cash) || (Number(o.collected_cash || 0) - Number(o.return_cash || 0)) || 0);
        }
        if (isOrderCash(o)) {
          return sum + (Number(o.total_amount) || 0);
        }
        return sum;
      }, 0);

      const onlineUpiSales = onlineOrders.reduce((sum: number, o: any) => {
        if (o.payment_method === 'POS_SPLIT') {
          return sum + (Number(o.metadata?.split_upi) || (Number(o.total_amount || 0) - (Number(o.collected_cash || 0) - Number(o.return_cash || 0))) || 0);
        }
        if (isOrderUpi(o)) {
          return sum + (Number(o.total_amount) || 0);
        }
        return sum;
      }, 0);

      setOnlineSalesStats({
        total_orders: onlineOrdersCount,
        total_sales: Math.round(onlineTotalSales * 100) / 100,
        cash_sales: Math.round(onlineCashSales * 100) / 100,
        upi_sales: Math.round(onlineUpiSales * 100) / 100
      });

      // Quick lookup map for categories
      const categoryMap = new Map<string, string>();
      (menuRes.data || []).forEach((m: any) => {
        if (m.name) categoryMap.set(m.name.trim().toLowerCase(), m.category || 'General');
        if (m.id) categoryMap.set(m.id, m.category || 'General');
      });

      const comboSet = new Set<string>();
      (comboRes.data || []).forEach((c: any) => {
        if (c.name) comboSet.add(c.name.trim().toLowerCase());
        if (c.id) comboSet.add(c.id);
      });

      // Day-wise product map: key is `${date}___${productName.toLowerCase()}`
      const map = new Map<string, {
        date: string;
        productName: string;
        category: string;
        quantity: number;
        totalRevenue: number;
        orderCount: number;
        posQty: number;
        posRevenue: number;
        posOrderCount: number;
        onlineQty: number;
        onlineRevenue: number;
        onlineOrderCount: number;
      }>();

      for (const order of orders) {
        const orderDate = getOrderBusinessDate(order.timestamp) || (order.timestamp ? String(order.timestamp).slice(0, 10) : null);
        if (!orderDate) continue;

        // CRITICAL GUARD: strictly only include dates within [startDate, endDate]
        if (orderDate < startDate || orderDate > endDate) continue;

        const isOnline = !order.staff_id;

        let items: any[] = [];
        try {
          items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        } catch {
          items = [];
        }

        const countedItemsInThisOrder = new Set<string>();

        for (const it of items) {
          const rawName = it.food_name || it.name;
          if (!rawName) continue;
          const productName = String(rawName).trim();
          const qty = Number(it.quantity) || 1;
          const price = Number(it.price || it.food_price || 0);
          const revenue = qty * price;

          let cat = it.food_category || it.category;
          if (!cat) {
            const key = productName.toLowerCase();
            if (categoryMap.has(key)) {
              cat = categoryMap.get(key);
            } else if (it.food_id && categoryMap.has(it.food_id)) {
              cat = categoryMap.get(it.food_id);
            } else if (it.id && categoryMap.has(it.id)) {
              cat = categoryMap.get(it.id);
            } else if (comboSet.has(key) || (it.food_id && comboSet.has(it.food_id)) || (it.id && comboSet.has(it.id))) {
              cat = 'Combos';
            } else {
              cat = 'General';
            }
          }

          const aggKey = `${orderDate}___${productName.toLowerCase()}`;
          const existing = map.get(aggKey);
          if (existing) {
            existing.quantity += qty;
            existing.totalRevenue += revenue;

            if (isOnline) {
              existing.onlineQty += qty;
              existing.onlineRevenue += revenue;
              if (!countedItemsInThisOrder.has(aggKey + '_online')) {
                existing.onlineOrderCount += 1;
                countedItemsInThisOrder.add(aggKey + '_online');
              }
            } else {
              existing.posQty += qty;
              existing.posRevenue += revenue;
              if (!countedItemsInThisOrder.has(aggKey + '_pos')) {
                existing.posOrderCount += 1;
                countedItemsInThisOrder.add(aggKey + '_pos');
              }
            }

            if (!countedItemsInThisOrder.has(aggKey)) {
              existing.orderCount += 1;
              countedItemsInThisOrder.add(aggKey);
            }
          } else {
            map.set(aggKey, {
              date: orderDate,
              productName,
              category: String(cat || 'General').toUpperCase(),
              quantity: qty,
              totalRevenue: revenue,
              orderCount: 1,
              posQty: isOnline ? 0 : qty,
              posRevenue: isOnline ? 0 : revenue,
              posOrderCount: isOnline ? 0 : 1,
              onlineQty: isOnline ? qty : 0,
              onlineRevenue: isOnline ? revenue : 0,
              onlineOrderCount: isOnline ? 1 : 0
            });
            countedItemsInThisOrder.add(aggKey);
            if (isOnline) countedItemsInThisOrder.add(aggKey + '_online');
            else countedItemsInThisOrder.add(aggKey + '_pos');
          }
        }
      }

      const list = Array.from(map.values()).map(item => ({
        date: item.date,
        productName: item.productName,
        category: item.category,
        quantity: item.quantity,
        revenue: Math.round(item.totalRevenue * 100) / 100,
        unitPrice: item.quantity > 0 ? Math.round((item.totalRevenue / item.quantity) * 100) / 100 : 0,
        orderCount: item.orderCount,
        posQty: item.posQty,
        posRevenue: Math.round(item.posRevenue * 100) / 100,
        posOrderCount: item.posOrderCount,
        onlineQty: item.onlineQty,
        onlineRevenue: Math.round(item.onlineRevenue * 100) / 100,
        onlineOrderCount: item.onlineOrderCount
      }));

      setProductSalesList(list);
    } catch (err) {
      console.error('Error fetching product sales report:', err);
      setProductSalesList([]);
    } finally {
      setProductSalesLoading(false);
    }
  };

  const formatDayDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const getCategoryBadgeStyle = (category: string) => {
    const c = (category || '').toUpperCase();
    if (c.includes('BEVERAGE') || c.includes('DRINK') || c.includes('COFFEE') || c.includes('TEA') || c.includes('BOBA')) {
      return { bg: 'rgba(0, 210, 255, 0.12)', border: 'rgba(0, 210, 255, 0.3)', color: '#00D2FF' };
    }
    if (c.includes('PIZZA') || c.includes('BURGER')) {
      return { bg: 'rgba(255, 47, 146, 0.12)', border: 'rgba(255, 47, 146, 0.3)', color: '#FF2F92' };
    }
    if (c.includes('SNACK') || c.includes('POPCORN') || c.includes('NACHOS')) {
      return { bg: 'rgba(255, 179, 106, 0.12)', border: 'rgba(255, 179, 106, 0.3)', color: '#FFB36A' };
    }
    if (c.includes('COMBO')) {
      return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', color: '#C084FC' };
    }
    if (c.includes('DESSERT') || c.includes('SWEET') || c.includes('ICE')) {
      return { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)', color: '#F472B6' };
    }
    return { bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.15)', color: 'rgba(255, 255, 255, 0.8)' };
  };

  const availableProductCategories = useMemo(() => {
    const set = new Set<string>();
    productSalesList.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [productSalesList]);

  const filteredProductSales = useMemo(() => {
    let list = productSalesList.map(item => {
      if (productChannelFilter === 'POS') {
        return {
          ...item,
          quantity: item.posQty,
          revenue: item.posRevenue,
          unitPrice: item.posQty > 0 ? Math.round((item.posRevenue / item.posQty) * 100) / 100 : item.unitPrice,
          orderCount: item.posOrderCount,
          channel: 'POS'
        };
      }
      if (productChannelFilter === 'ONLINE') {
        return {
          ...item,
          quantity: item.onlineQty,
          revenue: item.onlineRevenue,
          unitPrice: item.onlineQty > 0 ? Math.round((item.onlineRevenue / item.onlineQty) * 100) / 100 : item.unitPrice,
          orderCount: item.onlineOrderCount,
          channel: 'ONLINE'
        };
      }
      return {
        ...item,
        channel: item.posQty > 0 && item.onlineQty > 0 ? 'BOTH' : (item.onlineQty > 0 ? 'ONLINE' : 'POS')
      };
    });

    // If filtered by POS, exclude records with 0 posQty
    if (productChannelFilter === 'POS') {
      list = list.filter(item => item.quantity > 0);
    }
    // If filtered by ONLINE, exclude records with 0 onlineQty
    else if (productChannelFilter === 'ONLINE') {
      list = list.filter(item => item.quantity > 0);
    }

    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      list = list.filter(p =>
        p.productName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.date.includes(q)
      );
    }

    if (productCategoryFilter !== 'ALL') {
      list = list.filter(p => p.category.toUpperCase() === productCategoryFilter.toUpperCase());
    }

    list.sort((a, b) => {
      if (productSortBy === 'date_desc') return b.date.localeCompare(a.date) || b.revenue - a.revenue;
      if (productSortBy === 'date_asc') return a.date.localeCompare(b.date) || b.revenue - a.revenue;
      if (productSortBy === 'revenue_desc') return b.revenue - a.revenue || b.quantity - a.quantity;
      if (productSortBy === 'revenue_asc') return a.revenue - b.revenue || a.quantity - b.quantity;
      if (productSortBy === 'qty_desc') return b.quantity - a.quantity || b.revenue - a.revenue;
      if (productSortBy === 'qty_asc') return a.quantity - b.quantity || a.revenue - b.revenue;
      if (productSortBy === 'name_asc') return a.productName.localeCompare(b.productName) || b.date.localeCompare(a.date);
      return 0;
    });

    return list;
  }, [productSalesList, productChannelFilter, productSearch, productCategoryFilter, productSortBy]);

  const productSummary = useMemo(() => {
    let totalUnits = 0;
    let totalRevenue = 0;
    const uniqueItems = new Set<string>();
    const uniqueDays = new Set<string>();

    filteredProductSales.forEach(item => {
      totalUnits += item.quantity;
      totalRevenue += item.revenue;
      uniqueItems.add(item.productName);
      uniqueDays.add(item.date);
    });

    return {
      totalUnits,
      totalRevenue,
      uniqueItemsCount: uniqueItems.size,
      uniqueDaysCount: uniqueDays.size
    };
  }, [filteredProductSales]);

  useEffect(() => {
    setProductPage(1);
  }, [productChannelFilter, productSearch, productCategoryFilter, productSortBy, productPageSize, startDate, endDate]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProductSales.length / productPageSize));
  const paginatedProductSales = useMemo(() => {
    const startIndex = (productPage - 1) * productPageSize;
    return filteredProductSales.slice(startIndex, startIndex + productPageSize);
  }, [filteredProductSales, productPage, productPageSize]);

  const exportProductSalesCSV = () => {
    if (!filteredProductSales || filteredProductSales.length === 0) {
      alert('No product sales records to export for the selected filters.');
      return;
    }

    const headers = [
      'Business Date',
      'Formatted Date',
      'Product Name',
      'Category',
      'Sales Channel',
      'Quantity Sold (Units)',
      'POS Counter Qty',
      'Online App Qty',
      'Avg Unit Price (INR)',
      'Total Sales Revenue (INR)',
      'Orders Count'
    ];

    const rows = filteredProductSales.map(item => [
      item.date,
      `"${formatDayDate(item.date)}"`,
      `"${(item.productName || '').replace(/"/g, '""')}"`,
      `"${(item.category || 'General').replace(/"/g, '""')}"`,
      `"${productChannelFilter === 'POS' ? 'POS Counter Only' : productChannelFilter === 'ONLINE' ? 'Online App Only' : (item.channel === 'BOTH' ? 'Both (POS & App)' : (item.channel === 'ONLINE' ? 'Online App Only' : 'POS Counter Only'))}"`,
      item.quantity,
      item.posQty || 0,
      item.onlineQty || 0,
      item.unitPrice,
      item.revenue,
      item.orderCount
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Product_Sales_Report_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  const setDatePreset = (preset: 'today' | 'yesterday' | 'yesterday_today' | '7days' | '30days' | 'this_month') => {
    const now = getISTNow();
    let s = '';
    let e = '';
    
    if (preset === 'today') {
      const todayStr = toDateStr(now);
      s = todayStr;
      e = todayStr;
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = toDateStr(yest);
      s = yestStr;
      e = yestStr;
    } else if (preset === 'yesterday_today') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      s = toDateStr(yest);
      e = toDateStr(now);
    } else if (preset === '7days') {
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 7);
      s = toDateStr(past7);
      e = toDateStr(now);
    } else if (preset === '30days') {
      const past30 = new Date(now);
      past30.setDate(past30.getDate() - 30);
      s = toDateStr(past30);
      e = toDateStr(now);
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      s = toDateStr(firstDay);
      e = toDateStr(now);
    }

    if (s && e) {
      setTempStartDate(s);
      setTempEndDate(e);
      setStartDate(s);
      setEndDate(e);
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
            onClick={() => {
              setTempStartDate(startDate);
              setTempEndDate(endDate);
              setShowFilter(true);
            }}
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
                  { label: 'Yest & Today', key: 'yesterday_today' },
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
                  <input 
                    type="date" 
                    value={tempStartDate} 
                    onChange={e => setTempStartDate(e.target.value)} 
                    className="input-premium" 
                    style={{ width: '100%', fontSize: '12px', padding: '10px' }} 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '700' }}>END</label>
                  <input 
                    type="date" 
                    value={tempEndDate} 
                    onChange={e => setTempEndDate(e.target.value)} 
                    className="input-premium" 
                    style={{ width: '100%', fontSize: '12px', padding: '10px' }} 
                  />
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  if (!tempStartDate || !tempEndDate) {
                    alert('Please select both a Start Date and an End Date.');
                    return;
                  }
                  let finalStart = tempStartDate;
                  let finalEnd = tempEndDate;
                  if (finalStart > finalEnd) {
                    finalEnd = finalStart;
                    setTempEndDate(finalStart);
                  }
                  setStartDate(finalStart);
                  setEndDate(finalEnd);
                  setShowFilter(false);
                }} 
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
              tickFormatter={(val) => new Date(val).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' })}
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
                data={formattedPaymentModes}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={68}
                paddingAngle={5}
                dataKey="amount"
                nameKey="mode"
              >
                {formattedPaymentModes.map((entry: any, index: number) => (
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
        <div className="glass-card analytics-chart-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'white' }}>Outlet Sales Target & Achievement</h3>
            {isOutletAdmin && (
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
            )}
          </div>
          <div style={{ position: 'relative', width: '100%' }}>
            {targetsLoading ? (
              <div className="skeleton" style={{ height: '300px', width: '100%' }} />
            ) : targetsList.length === 0 ? (
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
          </div>
        </div>
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
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>💵 Cash Sales (₹)</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>📱 UPI Sales (₹)</th>
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
                      ₹{(staff.total_sales || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#4ade80' }}>
                      ₹{(staff.cash_sales || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: 'var(--secondary-glow)' }}>
                      ₹{(staff.upi_sales || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}

              {/* 🌐 Online App Orders Row (Desktop) */}
              {onlineSalesStats.total_orders > 0 && (
                <tr style={{ 
                  borderTop: '2px solid rgba(0, 210, 255, 0.3)', 
                  background: 'linear-gradient(90deg, rgba(0, 210, 255, 0.08), rgba(255, 47, 146, 0.03))' 
                }}>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ 
                      width: '26px', height: '26px', borderRadius: '50%', 
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: '800',
                      background: 'rgba(0, 210, 255, 0.18)',
                      border: '1px solid rgba(0, 210, 255, 0.4)',
                      color: '#00d2ff'
                    }} title="Customer Online Mobile App Orders">
                      🌐
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontWeight: '800', fontSize: '14px', color: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Online App Orders</span>
                      <span style={{ 
                        fontSize: '10px', padding: '2px 7px', borderRadius: '4px', 
                        background: 'rgba(0, 210, 255, 0.15)', color: '#00d2ff', 
                        border: '1px solid rgba(0, 210, 255, 0.3)', fontWeight: '800' 
                      }}>
                        CUSTOMER APP / WEB
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                      background: 'rgba(0, 210, 255, 0.12)',
                      color: '#00d2ff',
                      border: '1px solid rgba(0, 210, 255, 0.25)'
                    }}>
                      ONLINE
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '800', fontSize: '14px', color: 'white' }}>
                    {onlineSalesStats.total_orders}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '900', fontSize: '15px', color: '#00d2ff' }}>
                    ₹{onlineSalesStats.total_sales.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#4ade80' }}>
                    ₹{onlineSalesStats.cash_sales.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: 'var(--secondary-glow)' }}>
                    ₹{onlineSalesStats.upi_sales.toLocaleString()}
                  </td>
                </tr>
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
          ) : staffSalesList.length === 0 && onlineSalesStats.total_orders === 0 ? (
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
                    <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary-glow)', marginTop: '1px' }}>₹{(staff.total_sales || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: '#4ade80', textTransform: 'uppercase', fontWeight: '700' }}>💵 Cash Sales</div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#4ade80', marginTop: '1px' }}>₹{(staff.cash_sales || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.2)', padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--secondary-glow)', textTransform: 'uppercase', fontWeight: '700' }}>📱 UPI Sales</div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--secondary-glow)', marginTop: '1px' }}>₹{(staff.upi_sales || 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* 🌐 Online App Orders Card (Mobile) */}
          {onlineSalesStats.total_orders > 0 && (
            <div 
              style={{
                background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.08), rgba(255, 47, 146, 0.04))',
                border: '1px solid rgba(0, 210, 255, 0.3)',
                borderRadius: '14px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '4px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: '800',
                    background: 'rgba(0, 210, 255, 0.18)',
                    border: '1px solid rgba(0, 210, 255, 0.4)',
                    color: '#00d2ff',
                    flexShrink: 0
                  }}>
                    🌐
                  </span>
                  <span style={{ fontWeight: '800', fontSize: '14px', color: 'white' }}>
                    Online App Orders
                  </span>
                </div>
                <span style={{
                  padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '800',
                  background: 'rgba(0, 210, 255, 0.15)',
                  color: '#00d2ff',
                  border: '1px solid rgba(0, 210, 255, 0.3)'
                }}>
                  ONLINE / APP
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
                  <div style={{ fontSize: '14px', fontWeight: '800', color: 'white', marginTop: '1px' }}>{onlineSalesStats.total_orders}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Total Sales</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#00d2ff', marginTop: '1px' }}>₹{onlineSalesStats.total_sales.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', padding: '6px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '9px', color: '#4ade80', textTransform: 'uppercase', fontWeight: '700' }}>💵 Cash Sales</div>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#4ade80', marginTop: '1px' }}>₹{onlineSalesStats.cash_sales.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.2)', padding: '6px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '9px', color: 'var(--secondary-glow)', textTransform: 'uppercase', fontWeight: '700' }}>📱 UPI Sales</div>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--secondary-glow)', marginTop: '1px' }}>₹{onlineSalesStats.upi_sales.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRODUCT-WISE DAILY SALES REPORT (Option B Flat Log Table)                 */}
      {/* ========================================================================= */}
      <div id="product-sales-report-section" className="glass-card" style={{ padding: 0, overflow: 'hidden', marginTop: '24px' }}>
        
        {/* Section Header */}
        <div style={{ 
          padding: '18px 20px', 
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={18} color="var(--primary-glow)" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'white' }}>
                Product-Wise Daily Sales Report
              </h3>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 47, 146, 0.12)',
                color: 'var(--primary-glow)',
                fontWeight: '700',
                border: '1px solid rgba(255, 47, 146, 0.25)'
              }}>
                {startDate} — {endDate}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
              Detailed day-by-day item sales log showing units sold, unit prices, and revenue for the selected date filter.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={exportProductSalesCSV}
              disabled={productSalesLoading || filteredProductSales.length === 0}
              className="btn-lucrative"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: productSalesLoading || filteredProductSales.length === 0 ? 'not-allowed' : 'pointer',
                opacity: productSalesLoading || filteredProductSales.length === 0 ? 0.6 : 1
              }}
              title="Download CSV / Excel report"
            >
              <Download size={14} />
              <span>Export CSV</span>
              <span style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '800'
              }}>
                {filteredProductSales.length}
              </span>
            </button>
          </div>
        </div>

        {/* Quick KPI Summary Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
          padding: '14px 18px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Total Product Sales</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', marginTop: '2px' }}>
              ₹{productSummary.totalRevenue.toLocaleString()}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Total Units Sold</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'var(--secondary-glow)', marginTop: '2px' }}>
              {productSummary.totalUnits.toLocaleString()} pcs
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Unique Items Sold</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'var(--accent-gold)', marginTop: '2px' }}>
              {productSummary.uniqueItemsCount} items
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Sales Days Count</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#4ade80', marginTop: '2px' }}>
              {productSummary.uniqueDaysCount} days
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{
          padding: '14px 18px',
          background: 'rgba(255,255,255,0.015)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Left: Search input */}
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search product or category..."
              className="input-premium"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: productSearch ? '30px' : '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                fontSize: '12px',
                borderRadius: '8px'
              }}
            />
            {productSearch && (
              <button
                onClick={() => setProductSearch('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Right: Dropdown Filters & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Channel Filter (All Channels vs POS Counter vs Online App) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Channel:</span>
              <select
                value={productChannelFilter}
                onChange={(e) => setProductChannelFilter(e.target.value as any)}
                className="input-premium"
                style={{
                  padding: '7px 10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  background: '#0a0f1e',
                  border: productChannelFilter !== 'ALL' ? '1px solid var(--secondary-glow)' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <option value="ALL">All Channels</option>
                <option value="POS">🖥️ POS Counter Only</option>
                <option value="ONLINE">📱 Online App Only</option>
              </select>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Category:</span>
              <select
                value={productCategoryFilter}
                onChange={(e) => setProductCategoryFilter(e.target.value)}
                className="input-premium"
                style={{
                  padding: '7px 10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  background: '#0a0f1e'
                }}
              >
                <option value="ALL">All Categories ({availableProductCategories.length})</option>
                {availableProductCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Sort:</span>
              <select
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value as any)}
                className="input-premium"
                style={{
                  padding: '7px 10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  background: '#0a0f1e'
                }}
              >
                <option value="date_desc">Date: Newest First</option>
                <option value="date_asc">Date: Oldest First</option>
                <option value="revenue_desc">Sales: High to Low</option>
                <option value="revenue_asc">Sales: Low to High</option>
                <option value="qty_desc">Quantity: High to Low</option>
                <option value="qty_asc">Quantity: Low to High</option>
                <option value="name_asc">Product Name: A to Z</option>
              </select>
            </div>

            {/* Rows Per Page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Rows:</span>
              <select
                value={productPageSize}
                onChange={(e) => setProductPageSize(Number(e.target.value))}
                className="input-premium"
                style={{
                  padding: '7px 8px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  background: '#0a0f1e'
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="analytics-desktop-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'rgba(255,255,255,0.45)' }}>
                <th style={{ padding: '14px 18px', width: '16%' }}>Date</th>
                <th style={{ padding: '14px 18px', width: '25%' }}>Product / Item</th>
                <th style={{ padding: '14px 18px', width: '15%' }}>Category</th>
                <th style={{ padding: '14px 18px', width: '15%' }}>Channel</th>
                <th style={{ padding: '14px 18px', textAlign: 'right', width: '11%' }}>Quantity Sold</th>
                <th style={{ padding: '14px 18px', textAlign: 'right', width: '11%' }}>Avg Unit Price</th>
                <th style={{ padding: '14px 18px', textAlign: 'right', width: '12%' }}>Total Sales (₹)</th>
              </tr>
            </thead>
            <tbody>
              {productSalesLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '50px', textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aggregating product sales data...</span>
                  </td>
                </tr>
              ) : filteredProductSales.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '50px', textAlign: 'center' }}>
                    <Package size={36} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 10px' }} />
                    <div style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>No Product Sales Found</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
                      No items were sold matching the current date range and filters.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedProductSales.map((item, idx) => {
                  const badgeStyle = getCategoryBadgeStyle(item.category);
                  return (
                    <tr 
                      key={`${item.date}_${item.productName}_${idx}`} 
                      style={{ 
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Date */}
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: 'white' }}>
                          {formatDayDate(item.date)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {item.date}
                        </div>
                      </td>

                      {/* Product Name */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: badgeStyle.color,
                            display: 'inline-block', flexShrink: 0
                          }} />
                          <span>{item.productName}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          In {item.orderCount} {item.orderCount === 1 ? 'order' : 'orders'} on this day
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: '800',
                          letterSpacing: '0.4px',
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                          display: 'inline-block'
                        }}>
                          {item.category}
                        </span>
                      </td>

                      {/* Channel Badge */}
                      <td style={{ padding: '14px 18px' }}>
                        {productChannelFilter === 'POS' ? (
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                            background: 'rgba(255, 179, 106, 0.12)', color: '#FFB36A',
                            border: '1px solid rgba(255, 179, 106, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            🖥️ POS Counter
                          </span>
                        ) : productChannelFilter === 'ONLINE' ? (
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                            background: 'rgba(0, 210, 255, 0.12)', color: '#00D2FF',
                            border: '1px solid rgba(0, 210, 255, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            📱 Online App
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {item.posQty > 0 && item.onlineQty > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: 'rgba(0, 210, 255, 0.12)', color: '#00D2FF' }}>
                                  📱 {item.onlineQty}
                                </span>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: 'rgba(255, 179, 106, 0.12)', color: '#FFB36A' }}>
                                  🖥️ {item.posQty}
                                </span>
                              </div>
                            ) : item.onlineQty > 0 ? (
                              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', background: 'rgba(0, 210, 255, 0.12)', color: '#00D2FF', width: 'fit-content' }}>
                                📱 Online App
                              </span>
                            ) : (
                              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', background: 'rgba(255, 179, 106, 0.12)', color: '#FFB36A', width: 'fit-content' }}>
                                🖥️ Counter
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Quantity Sold */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '8px',
                          background: 'rgba(0, 210, 255, 0.08)',
                          border: '1px solid rgba(0, 210, 255, 0.2)',
                          color: 'var(--secondary-glow)',
                          fontWeight: '800',
                          fontSize: '13px'
                        }}>
                          {item.quantity} pcs
                        </span>
                      </td>

                      {/* Unit Price */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>
                        ₹{item.unitPrice.toLocaleString()}
                      </td>

                      {/* Total Sales */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ fontWeight: '900', fontSize: '15px', color: '#4ade80' }}>
                          ₹{item.revenue.toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Product Cards View */}
        <div className="analytics-mobile-cards" style={{ flexDirection: 'column', gap: '10px', padding: '12px' }}>
          {productSalesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading product sales...</div>
            </div>
          ) : filteredProductSales.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No product sales found for this filter.
            </div>
          ) : (
            paginatedProductSales.map((item, idx) => {
              const badgeStyle = getCategoryBadgeStyle(item.category);
              return (
                <div 
                  key={`mob_${item.date}_${item.productName}_${idx}`}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: 'white' }}>
                        {item.productName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        📅 {formatDayDate(item.date)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: '800',
                        background: badgeStyle.bg,
                        color: badgeStyle.color,
                        border: `1px solid ${badgeStyle.border}`,
                        flexShrink: 0
                      }}>
                        {item.category}
                      </span>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: '800',
                        background: (productChannelFilter === 'ONLINE' || (productChannelFilter === 'ALL' && item.onlineQty > 0 && !item.posQty)) 
                          ? 'rgba(0, 210, 255, 0.12)' 
                          : 'rgba(255, 179, 106, 0.12)',
                        color: (productChannelFilter === 'ONLINE' || (productChannelFilter === 'ALL' && item.onlineQty > 0 && !item.posQty))
                          ? '#00D2FF'
                          : '#FFB36A',
                        border: '1px solid rgba(255,255,255,0.1)',
                        flexShrink: 0
                      }}>
                        {productChannelFilter === 'ONLINE' ? '📱 App' : productChannelFilter === 'POS' ? '🖥️ Counter' : (item.onlineQty > 0 && item.posQty > 0 ? `📱${item.onlineQty} · 🖥️${item.posQty}` : (item.onlineQty > 0 ? '📱 App' : '🖥️ Counter'))}
                      </span>
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: '6px', 
                    paddingTop: '8px', 
                    borderTop: '1px solid rgba(255,255,255,0.04)' 
                  }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Quantity</div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--secondary-glow)', marginTop: '1px' }}>{item.quantity} pcs</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Unit Price</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', marginTop: '1px' }}>₹{item.unitPrice}</div>
                    </div>
                    <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', padding: '6px 8px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: '#4ade80', textTransform: 'uppercase', fontWeight: '700' }}>Total Sales</div>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: '#4ade80', marginTop: '1px' }}>₹{item.revenue.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Bar */}
        {filteredProductSales.length > 0 && (
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            background: 'rgba(255,255,255,0.015)'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing <span style={{ color: 'white', fontWeight: '700' }}>{(productPage - 1) * productPageSize + 1}</span> to <span style={{ color: 'white', fontWeight: '700' }}>{Math.min(productPage * productPageSize, filteredProductSales.length)}</span> of <span style={{ color: 'white', fontWeight: '700' }}>{filteredProductSales.length}</span> records
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setProductPage(prev => Math.max(1, prev - 1))}
                disabled={productPage === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: productPage === 1 ? 'rgba(255,255,255,0.25)' : 'white',
                  cursor: productPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '700'
                }}
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </button>

              <span style={{ fontSize: '11px', color: 'white', padding: '0 8px', fontWeight: '800' }}>
                Page {productPage} of {totalProductPages}
              </span>

              <button
                onClick={() => setProductPage(prev => Math.min(totalProductPages, prev + 1))}
                disabled={productPage >= totalProductPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: productPage >= totalProductPages ? 'rgba(255,255,255,0.25)' : 'white',
                  cursor: productPage >= totalProductPages ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '700'
                }}
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
