import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, ShoppingBag, MessageSquare, Send, X, User, Phone, Power, Info, CreditCard, Monitor, ListFilter } from 'lucide-react';
import { Database } from '../lib/database.types';
import { InventoryKillSwitch } from '../components/InventoryKillSwitch';

type Order = Database['public']['Tables']['orders']['Row'] & {
  customer_profiles: { first_name: string; last_name: string } | null;
  matchingItems?: any[];
};
type Message = Database['public']['Tables']['order_messages']['Row'];

export default function OutletManagerDashboard({ user }: { user: any }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<Order | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, boolean>>({}); // orderId -> boolean
  const pendingUpdateRef = React.useRef<boolean>(false);
  
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);

  const [cinemaName, setCinemaName] = useState(user.cinema_name || '');
  const [kdsConfigs, setKdsConfigs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string | number>(1);

  useEffect(() => {
    fetchOrders();
    fetchKdsConfigs();
    
    if (!cinemaName && user.cinema_id && user.cinema_id !== 'default') {
      supabase.from('cinemas').select('name').eq('id', user.cinema_id).single().then(({data}) => {
        if (data) setCinemaName(data.name);
      });
    }

    // Subscribe to orders
    const orderSubscription = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
          if (!pendingUpdateRef.current) {
            pendingUpdateRef.current = true;
            setTimeout(() => {
                fetchOrders();
                pendingUpdateRef.current = false;
            }, 500);
          }
      })
      .subscribe();

    const msgSubscription = supabase
      .channel('public:order_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages' }, payload => {
          const msg = payload.new as Message;
          if (msg.sender_role === 'CUSTOMER' && msg.order_id) {
            setUnreadMessages(prev => ({ ...prev, [msg.order_id!]: true }));
          }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(orderSubscription);
      supabase.removeChannel(msgSubscription);
    };
  }, []);

  const fetchKdsConfigs = async () => {
    if (!user.cinema_id) return;
    try {
      const { data } = await supabase
        .from('kds_screen_configs')
        .select('*')
        .eq('cinema_id', user.cinema_id)
        .order('screen_number');
      if (data) {
        setKdsConfigs(data);
        if (data.length > 0) {
          setActiveTab(data[0].screen_number);
        }
      }
    } catch (e) {
      console.error("Failed to fetch KDS configurations:", e);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select('*, customer_profiles(first_name, last_name)')
        .order('timestamp', { ascending: false });
      
      if (user.cinema_id && user.cinema_id !== 'default') {
          query = query.eq('cinema_id', user.cinema_id);
      }
      
      const { data } = await query.limit(30);
      if (data) setOrders(data as Order[]);
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    const previousOrders = [...orders];
    
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const currentItems = safeParseItems(order.items);
    const updatedItems = currentItems.map((item: any) => ({
      ...item,
      kds_status: newStatus,
      is_delivered: newStatus === 'DELIVERED'
    }));

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, items: updatedItems } : o));

    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          items: updatedItems
        })
        .eq('id', orderId);
      if (error) throw error;
    } catch (e) {
      console.error("Failed to update status:", e);
      setOrders(previousOrders);
    }
  };

  const updateItemKdsStatus = async (orderId: string, itemIds: string[], nextStatus: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const currentItems = safeParseItems(order.items);
    const updatedItems = currentItems.map((item: any) => {
      const itemId = item.item_id || item.food_id;
      if (itemIds.includes(itemId)) {
        return { ...item, kds_status: nextStatus, is_delivered: nextStatus === 'DELIVERED' };
      }
      return item;
    });

    // Calculate aggregated order status
    let finalOrderStatus = 'PENDING';
    const allDelivered = updatedItems.every((item: any) => item.kds_status === 'DELIVERED' || item.is_delivered === true);
    const anyPreparing = updatedItems.some((item: any) => item.kds_status === 'PREPARING');
    const anyReady = updatedItems.some((item: any) => item.kds_status === 'READY');
    const allReadyOrDelivered = updatedItems.every((item: any) => item.kds_status === 'READY' || item.kds_status === 'DELIVERED' || item.is_delivered === true);

    if (allDelivered) {
      finalOrderStatus = 'DELIVERED';
    } else if (allReadyOrDelivered && anyReady) {
      finalOrderStatus = 'READY';
    } else if (anyPreparing || anyReady) {
      finalOrderStatus = 'PREPARING';
    }

    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, status: finalOrderStatus } : o));

    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          items: updatedItems, 
          status: finalOrderStatus 
        })
        .eq('id', orderId);
        
      if (error) throw error;
    } catch (e) {
      console.error("Failed to update item status:", e);
      setOrders(previousOrders);
    }
  };

  const toggleItemDelivered = async (orderId: string, currentItems: any[], itemIndex: number) => {
    const newItems = [...currentItems];
    const item = newItems[itemIndex];
    const isDelivered = !item.is_delivered;
    newItems[itemIndex] = { 
      ...item, 
      is_delivered: isDelivered,
      kds_status: isDelivered ? 'DELIVERED' : 'READY'
    };
    
    // Recalculate status
    let finalOrderStatus = 'PREPARING';
    const allDelivered = newItems.every((item: any) => item.kds_status === 'DELIVERED' || item.is_delivered === true);
    const anyPreparing = newItems.some((item: any) => item.kds_status === 'PREPARING');
    const anyReady = newItems.some((item: any) => item.kds_status === 'READY');
    const allReadyOrDelivered = newItems.every((item: any) => item.kds_status === 'READY' || item.kds_status === 'DELIVERED' || item.is_delivered === true);

    if (allDelivered) {
      finalOrderStatus = 'DELIVERED';
    } else if (allReadyOrDelivered && anyReady) {
      finalOrderStatus = 'READY';
    } else if (anyPreparing || anyReady) {
      finalOrderStatus = 'PREPARING';
    }

    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, status: finalOrderStatus } : o));

    try {
      const { error } = await supabase.from('orders').update({ items: newItems, status: finalOrderStatus }).eq('id', orderId);
      if (error) throw error;
    } catch (e) {
      console.error("Failed to toggle delivery status:", e);
      setOrders(previousOrders);
    }
  };

  const openChat = (order: Order) => {
    setActiveChat(order);
    setUnreadMessages(prev => ({ ...prev, [order.id]: false }));
  };

  const safeParseItems = (itemsString: any) => {
    try {
      return typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;
    } catch (e) {
      return [];
    }
  };

  // Helper to filter order items that belong to the active screen tab
  const filterOrderItemsForTab = (order: Order, tab: string | number) => {
    const items = safeParseItems(order.items);
    if (tab === 'ALL') return items;

    if (tab === 'OVERFLOW') {
      // Find all categories assigned to any screen
      const allAssigned = kdsConfigs.reduce((acc, config) => {
        return [...acc, ...(config.assigned_categories || [])];
      }, [] as string[]).map(c => c.toUpperCase());

      return items.filter((item: any) => {
        const cat = (item.food_category || item.category || '').toUpperCase();
        return !allAssigned.includes(cat);
      });
    }

    const screenConfig = kdsConfigs.find(c => c.screen_number === Number(tab));
    if (!screenConfig) return [];

    const assigned = (screenConfig.assigned_categories || []).map(c => c.toUpperCase());
    return items.filter((item: any) => {
      const cat = (item.food_category || item.category || '').toUpperCase();
      return assigned.includes(cat);
    });
  };

  // Helper to construct partial orders containing only items matching KDS status & Tab
  const getPartialOrdersForTabAndStatus = (tab: string | number, status: string) => {
    return orders.map(order => {
      const matchingItems = filterOrderItemsForTab(order, tab);
      const statusItems = matchingItems.filter((item: any) => {
        const itemStatus = item.kds_status || 'PENDING';
        const isDelivered = item.is_delivered === true || itemStatus === 'DELIVERED';
        
        if (status === 'PENDING') {
          return itemStatus === 'PENDING' && !isDelivered;
        }
        if (status === 'PREPARING') {
          return itemStatus === 'PREPARING' && !isDelivered;
        }
        if (status === 'READY') {
          return itemStatus === 'READY' && !isDelivered;
        }
        return false;
      });

      if (statusItems.length === 0) return null;

      return {
        ...order,
        matchingItems: statusItems
      };
    }).filter(Boolean) as Order[];
  };

  const renderColumns = () => {
    const pendingPartial = getPartialOrdersForTabAndStatus(activeTab, 'PENDING');
    const preparingPartial = getPartialOrdersForTabAndStatus(activeTab, 'PREPARING');
    const readyPartial = getPartialOrdersForTabAndStatus(activeTab, 'READY');

    return (
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {/* Column 1: PENDING */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ color: 'var(--accent-gold)' }}>New Tickets</h3>
            <span style={{ background: 'rgba(255,179,106,0.1)', color: 'var(--accent-gold)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {pendingPartial.length}
            </span>
          </div>
          {pendingPartial.map(order => (
            <OrderCard 
              key={order.id} 
              order={order} 
              hasUnread={unreadMessages[order.id]} 
              onAction={() => updateItemKdsStatus(order.id, order.matchingItems!.map((i: any) => i.item_id || i.food_id), 'PREPARING')} 
              onChat={() => openChat(order)} 
              actionLabel="Accept & Prepare" 
              actionColor="var(--primary-glow)" 
              items={order.matchingItems!} 
            />
          ))}
          {pendingPartial.length === 0 && <EmptyState type="PENDING" />}
        </div>

        {/* Column 2: PREPARING */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ color: 'var(--secondary-glow)' }}>In Kitchen</h3>
            <span style={{ background: 'rgba(0,210,255,0.1)', color: 'var(--secondary-glow)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {preparingPartial.length}
            </span>
          </div>
          {preparingPartial.map(order => (
            <OrderCard 
              key={order.id} 
              order={order} 
              hasUnread={unreadMessages[order.id]} 
              onAction={() => updateItemKdsStatus(order.id, order.matchingItems!.map((i: any) => i.item_id || i.food_id), 'READY')} 
              onChat={() => openChat(order)} 
              actionLabel="Mark Ready" 
              actionColor="var(--secondary-glow)" 
              items={order.matchingItems!} 
            />
          ))}
          {preparingPartial.length === 0 && <EmptyState type="PREPARING" />}
        </div>

        {/* Column 3: READY / DELIVERED */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
             <h3 style={{ color: '#4CAF50' }}>Delivery Queue</h3>
             <span style={{ background: 'rgba(76,175,80,0.1)', color: '#4CAF50', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {readyPartial.length}
            </span>
          </div>
          {readyPartial.map(order => (
            <OrderCard 
              key={order.id} 
              order={order} 
              hasUnread={unreadMessages[order.id]} 
              onAction={() => updateItemKdsStatus(order.id, order.matchingItems!.map((i: any) => i.item_id || i.food_id), 'DELIVERED')} 
              onChat={() => openChat(order)} 
              actionLabel="Delivered" 
              actionColor="#4CAF50" 
              items={order.matchingItems!} 
            />
          ))}
          {readyPartial.length === 0 && <EmptyState type="READY" />}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <style>{`
        @keyframes message-glow {
          0% { box-shadow: 0 0 5px var(--primary-glow); transform: scale(1); }
          50% { box-shadow: 0 0 20px var(--primary-glow); transform: scale(1.1); }
          100% { box-shadow: 0 0 5px var(--primary-glow); transform: scale(1); }
        }
        .message-notify-glow {
          animation: message-glow 1.5s infinite;
          background: var(--primary-glow) !important;
          color: white !important;
        }

        @keyframes urgency-pulse-red {
          0% { box-shadow: 0 0 5px rgba(244, 67, 54, 0.4); border-color: rgba(244, 67, 54, 0.5); }
          50% { box-shadow: 0 0 25px rgba(244, 67, 54, 0.8); border-color: rgba(244, 67, 54, 1); }
          100% { box-shadow: 0 0 5px rgba(244, 67, 54, 0.4); border-color: rgba(244, 67, 54, 0.5); }
        }
        @keyframes urgency-pulse-red-border {
          0% { border-color: rgba(244, 67, 54, 0.4); border-width: 4px; }
          50% { border-color: rgba(244, 67, 54, 1); border-width: 6px; }
          100% { border-color: rgba(244, 67, 54, 0.4); border-width: 4px; }
        }
        @keyframes urgency-pulse-red-glow {
          0% { box-shadow: 0 0 5px rgba(244, 67, 54, 0.4); border-color: rgba(244, 67, 54, 0.5); }
          50% { box-shadow: 0 0 40px rgba(244, 67, 54, 1); border-color: rgba(244, 67, 54, 1); }
          100% { box-shadow: 0 0 5px rgba(244, 67, 54, 0.4); border-color: rgba(244, 67, 54, 0.5); }
        }
        @keyframes urgency-pulse-orange {
          0% { box-shadow: 0 0 5px rgba(255, 152, 0, 0.3); border-color: rgba(255, 152, 0, 0.4); }
          50% { box-shadow: 0 0 20px rgba(255, 152, 0, 0.6); border-color: rgba(255, 152, 0, 0.8); }
          100% { box-shadow: 0 0 5px rgba(255, 152, 0, 0.3); border-color: rgba(255, 152, 0, 0.4); }
        }
        .urgency-critical { animation: urgency-pulse-red 2s infinite; }
        .urgency-critical-border { animation: urgency-pulse-red-border 1.5s infinite; }
        .urgency-critical-glow { animation: urgency-pulse-red-glow 1.5s infinite; }
        .urgency-high { animation: urgency-pulse-orange 2s infinite; }
      `}</style>

      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>{cinemaName ? `${cinemaName} POS` : 'Live Operating View'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <p style={{ color: 'var(--text-muted)', margin: 0 }}>Operational Heatmap Mode: <strong>TICKET URGENCIES ACTIVE</strong></p>
             <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '10px', background: 'rgba(244, 67, 54, 0.1)', color: '#F44336', padding: '2px 8px', borderRadius: '4px' }}>
                  {orders.filter(o => {
                    if (o.status === 'DELIVERED' || o.status === 'CANCELLED') return false;
                    const rawTime = o.timestamp;
                    const t = (rawTime?.endsWith('Z') || rawTime?.includes('+')) ? new Date(rawTime).getTime() : new Date(rawTime + 'Z').getTime();
                    const elapsed = (Date.now() - t) / 60000;
                    if (o.status === 'PENDING') return elapsed >= 8;
                    if (o.status === 'PREPARING') return elapsed >= 15;
                    if (o.status === 'READY') return elapsed >= 12;
                    return false;
                  }).length} Critical
                </span>
             </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
             <button 
                onClick={() => setShowKillSwitch(true)}
                className="glass-card hover-lift" 
                style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '16px', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.2)', color: '#F44336', cursor: 'pointer' }}
             >
                 <Power size={20} />
                 <span style={{ fontWeight: 600 }}>Emergency Kill Switch</span>
             </button>
             <button 
                onClick={() => setShowPaymentConfig(true)}
                className="glass-card hover-lift" 
                style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '16px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.2)', color: '#FF9800', cursor: 'pointer' }}
             >
                 <CreditCard size={20} />
                 <span style={{ fontWeight: 600 }}>Payment Config</span>
             </button>
             <div className="glass-card" style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '16px' }}>
                 <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 10px #4CAF50' }}></div>
                 <span style={{ fontWeight: 600 }}>Live Sync Active</span>
             </div>
        </div>
      </header>

      {/* Screen Tabs Bar */}
      <div 
        style={{ 
          display: 'flex', 
          gap: '8px', 
          borderBottom: '1px solid rgba(255,255,255,0.06)', 
          paddingBottom: '12px', 
          overflowX: 'auto',
          margin: '-12px 0 8px'
        }}
      >
        {kdsConfigs.map(c => (
          <button
            key={c.screen_number}
            onClick={() => setActiveTab(c.screen_number)}
            style={{
              padding: '10px 20px',
              background: activeTab === c.screen_number ? 'var(--secondary-glow)' : 'rgba(255,255,255,0.02)',
              color: activeTab === c.screen_number ? 'white' : 'var(--text-secondary)',
              border: activeTab === c.screen_number ? '1px solid rgba(0,210,255,0.3)' : '1px solid rgba(255,255,255,0.05)',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            <Monitor size={16} />
            <span>{c.screen_name || `KDS Station ${c.screen_number}`}</span>
          </button>
        ))}
        <button
          onClick={() => setActiveTab('OVERFLOW')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'OVERFLOW' ? 'rgba(255,152,0,0.1)' : 'rgba(255,255,255,0.02)',
            color: activeTab === 'OVERFLOW' ? '#FF9800' : 'var(--text-secondary)',
            border: activeTab === 'OVERFLOW' ? '1px solid rgba(255,152,0,0.3)' : '1px solid rgba(255,255,255,0.05)',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <Info size={16} />
          <span>Overflow (Unassigned)</span>
        </button>
      </div>

      {/* Grid columns */}
      {renderColumns()}

      {showKillSwitch && <InventoryKillSwitch cinemaId={user.cinema_id} onClose={() => setShowKillSwitch(false)} />}
      {showPaymentConfig && <PaymentConfigModal cinemaId={user.cinema_id} onClose={() => setShowPaymentConfig(false)} />}
      
      {activeChat && <ChatModal order={activeChat} onClose={() => setActiveChat(null)} />}
    </div>
  );
}

function OrderCard({ order, hasUnread, onAction, onChat, onToggleItem, actionLabel, actionColor, items }: {
  order: Order;
  hasUnread: boolean;
  onAction: () => void;
  onChat: () => void;
  onToggleItem?: (itemIndex: number) => void;
  actionLabel: string;
  actionColor: string;
  items: any[];
}) {
  const [showUser, setShowUser] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calc = () => {
      const rawTime = order.timestamp;
      const t = (rawTime?.endsWith('Z') || rawTime?.includes('+')) ? new Date(rawTime).getTime() : new Date(rawTime + 'Z').getTime();
      const diff = (Date.now() - t) / 60000;
      setElapsed(Math.floor(diff));
    };
    calc();
    const interval = setInterval(calc, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [order.timestamp]);

  const getUrgencyConfig = () => {
    const status = order.status;
    if (status === 'PENDING') {
      if (elapsed < 2) return { color: actionColor, glow: 'none', badge: 'Accept Now', className: '' };
      if (elapsed < 5) return { color: '#FFEB3B', glow: '0 0 15px rgba(255, 235, 59, 0.3)', badge: 'Waiting', className: '' };
      if (elapsed < 8) return { color: '#FF9800', glow: '0 0 20px rgba(255, 152, 0, 0.4)', badge: 'Urgent Acceptance', className: 'urgency-high' };
      return { color: '#F44336', glow: '0 0 25px rgba(244, 67, 54, 0.5)', badge: 'Urgent Acceptance', className: 'urgency-critical' };
    }
    if (status === 'PREPARING') {
      if (elapsed < 5) return { color: actionColor, glow: 'none', badge: 'Preparing', className: '' };
      if (elapsed < 10) return { color: '#FFEB3B', glow: '0 0 15px rgba(255, 235, 59, 0.3)', badge: 'Prep Delay', className: '' };
      if (elapsed < 15) return { color: '#FF9800', glow: '0 0 20px rgba(255, 152, 0, 0.4)', badge: 'Prep Delay', className: 'urgency-high' };
      return { color: '#F44336', glow: '0 0 25px rgba(244, 67, 54, 0.5)', badge: 'Critical Delay', className: 'urgency-critical-border' };
    }
    if (status === 'READY') {
      if (elapsed < 5) return { color: actionColor, glow: 'none', badge: 'Runner Needed', className: '' };
      if (elapsed < 8) return { color: '#FFEB3B', glow: '0 0 15px rgba(255, 235, 59, 0.3)', badge: 'Runner Needed', className: '' };
      if (elapsed < 12) return { color: '#FF9800', glow: '0 0 20px rgba(255, 152, 0, 0.4)', badge: 'Delivery Delay', className: 'urgency-high' };
      return { color: '#F44336', glow: '0 0 25px rgba(244, 67, 54, 0.5)', badge: 'Urgent Delivery', className: 'urgency-critical-glow' };
    }
    return { color: actionColor, glow: 'none', badge: '', className: '' };
  };

  const urgency = getUrgencyConfig();
  const rawTime = order.timestamp;
  const utcDate = rawTime?.endsWith('Z') || rawTime?.includes('+') ? new Date(rawTime) : new Date(rawTime + 'Z');
  const timeStr = utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const displayOrderId = order.display_id || order.id?.substring(0,6).toUpperCase();
  const customerName = order.customer_profiles ? `${order.customer_profiles.first_name} ${order.customer_profiles.last_name}` : 'Demo Customer';

  // Determine button disabled state
  const isButtonDisabled = () => {
    // If it's the traditional dashboard and preparing, we must wait for all items to be deliverable
    if (order.status === 'PREPARING' && onToggleItem) {
      return !items.every(i => i.is_delivered);
    }
    return false;
  };

  return (
    <div 
      className={`glass-card ${urgency.className}`} 
      style={{ 
        padding: '20px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px', 
        borderLeft: `4px solid ${urgency.color}`, 
        boxShadow: urgency.glow,
        position: 'relative',
        transition: 'all 0.5s ease'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{displayOrderId}</div>
            {urgency.badge && (
              <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', background: `${urgency.color}20`, color: urgency.color, borderRadius: '4px', border: `1px solid ${urgency.color}40` }}>
                {urgency.badge.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{order.location}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: urgency.color, fontSize: '12px', fontWeight: 'bold' }}>
                <Clock size={12} /> {elapsed}m
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeStr}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ 
              fontSize: '11px', 
              background: 'rgba(255,255,255,0.05)', 
              padding: '2px 8px', 
              borderRadius: '4px', 
              color: 'var(--text-muted)'
          }}>
            {order.payment_method?.replace('DEMO_', '').replace('_', ' ')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setShowUser(!showUser)} 
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: showUser ? 'var(--accent-gold)' : 'var(--text-muted)', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
              >
                  <User size={14} />
              </button>
              <button 
                onClick={onChat} 
                className={hasUnread ? 'message-notify-glow' : ''}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--primary-glow)', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
              >
                  <MessageSquare size={14} />
              </button>
          </div>
      </div>

      {showUser && (
        <div className="animate-in fade-in" style={{ background: 'var(--card-gradient)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,179,106,0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600 }}>{customerName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', opacity: 0.7 }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{order.customer_phone}</span>
          </div>
        </div>
      )}

      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px' }}>
        {items?.map((item, idx) => (
          <div key={idx} style={{ marginBottom: idx !== items.length - 1 ? '10px' : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {item.is_combo && (
                  <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '1px 4px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', borderRadius: '3px' }}>COMBO</span>
                )}
                <span style={{ textDecoration: item.is_delivered ? 'line-through' : 'none', color: item.is_delivered ? 'var(--text-muted)' : 'inherit' }}>
                  {item.quantity}x {item.food_name || item.name}
                </span>
                <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '1px 4px', borderRadius: '3px' }}>
                  {item.food_category || 'Classics'}
                </span>
              </div>
              {order.status === 'PREPARING' && onToggleItem && (
                <input type="checkbox" checked={item.is_delivered || false} onChange={() => onToggleItem(idx)} style={{ cursor: 'pointer', accentColor: actionColor }} />
              )}
            </div>
            {item.item_note && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Info size={10} opacity={0.5} /> <span>{item.item_note}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button 
        onClick={onAction} 
        disabled={isButtonDisabled()}
        style={{ 
            width: '100%', 
            padding: '12px', 
            background: isButtonDisabled() ? 'rgba(255,255,255,0.05)' : `${urgency.color}15`, 
            color: isButtonDisabled() ? 'rgba(255,255,255,0.3)' : urgency.color, 
            border: `1px solid ${urgency.color}40`, 
            borderRadius: '12px', 
            fontWeight: 'bold', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
            cursor: isButtonDisabled() ? 'not-allowed' : 'pointer' 
        }}>
        <CheckCircle size={18} /> {actionLabel}
      </button>
    </div>
  );
}

function ChatModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    fetchMessages();
    const subscription = supabase
      .channel(`chat_${order.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${order.id}` }, payload => {
          setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [order.id]);

  const fetchMessages = async () => {
    const { data } = await supabase.from('order_messages').select('*').eq('order_id', order.id).order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setInput('');
    await supabase.from('order_messages').insert({ order_id: order.id, sender_role: 'OUTLET', content: input });
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '450px', height: '80vh', maxHeight: '650px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-glow)' }}>Support Chat</h3></div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', padding: '8px', borderRadius: '10px' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map(msg => (
                <div key={msg.id} style={{ alignSelf: msg.sender_role === 'OUTLET' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    <div style={{ background: msg.sender_role === 'OUTLET' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.08)', padding: '12px 18px', borderRadius: '18px', color: 'white', fontSize: '14px' }}>{msg.content}</div>
                </div>
            ))}
        </div>
        <form onSubmit={sendMessage} style={{ padding: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '12px' }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a response..." style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '14px', color: 'white', outline: 'none' }} />
            <button type="submit" style={{ background: 'var(--primary-glow)', border: 'none', color: 'white', padding: '0 16px', borderRadius: '14px', cursor: 'pointer' }}><Send size={20} /></button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ type }) {
  return (
    <div style={{ padding: '32px', border: '1px dashed var(--glass-border)', borderRadius: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <ShoppingBag size={32} opacity={0.3} style={{ marginBottom: '12px' }} />
      <div style={{ fontSize: '14px' }}>No orders in this queue</div>
    </div>
  );
}

function PaymentConfigModal({ cinemaId, onClose }: { cinemaId: string; onClose: () => void }) {
  const [methods, setMethods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethods();
  }, [cinemaId]);

  const fetchMethods = async () => {
    setLoading(true);
    const { data } = await supabase.from('cinemas').select('allowed_payment_methods').eq('id', cinemaId).single();
    if (data?.allowed_payment_methods) {
      setMethods(data.allowed_payment_methods as string[]);
    } else {
      setMethods(['DEMO_UPI', 'DEMO_CARD', 'PAY_ON_DELIVERY', 'PAY_LATER']);
    }
    setLoading(false);
  };

  const toggleMethod = async (method: string) => {
    let newMethods = [...methods];
    if (newMethods.includes(method)) {
      newMethods = newMethods.filter(m => m !== method);
    } else {
      newMethods.push(method);
    }
    if (newMethods.length === 0) {
      alert("You must leave at least one payment method enabled.");
      return;
    }
    setMethods(newMethods);
    await supabase.from('cinemas').update({ allowed_payment_methods: newMethods }).eq('id', cinemaId);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#FF9800' }}>Payment Configuration</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', padding: '8px', borderRadius: '10px' }}><X size={20} /></button>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { id: 'DEMO_UPI', label: 'UPI' },
              { id: 'DEMO_CARD', label: 'Card' },
              { id: 'PAY_ON_DELIVERY', label: 'Pay on Delivery' },
              { id: 'PAY_LATER', label: 'Pay Later' }
            ].map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontWeight: 'bold' }}>{m.label}</span>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={methods.includes(m.id)} 
                    onChange={() => toggleMethod(m.id)} 
                    style={{ width: '20px', height: '20px', accentColor: '#FF9800' }} 
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
