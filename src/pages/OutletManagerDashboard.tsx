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
  const [mobileQueueFilter, setMobileQueueFilter] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'READY'>('ALL');

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

    // Fallback polling every 10 seconds to guarantee fresh orders even if realtime drops
    const pollInterval = setInterval(() => {
      fetchOrders();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
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
        const filteredData = data.filter(c => {
          return c.assigned_staffs && c.assigned_staffs.includes(user.id);
        });
        setKdsConfigs(filteredData);
        if (filteredData.length > 0) {
          setActiveTab(filteredData[0].screen_number);
        } else {
          setActiveTab('OVERFLOW');
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

  const safeParseItems = (itemsString: any) => {
    try {
      return typeof itemsString === 'string' ? JSON.parse(itemsString) : (Array.isArray(itemsString) ? itemsString : []);
    } catch (e) {
      return [];
    }
  };

  const toggleItemDelivered = async (orderId: string, itemId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const currentItems = safeParseItems(order.items);
    const updatedItems = currentItems.map((item: any) => {
      const currentId = item.item_id || item.food_id;
      if (currentId === itemId) {
        const nextDelivered = !item.is_delivered;
        return { 
          ...item, 
          is_delivered: nextDelivered,
          kds_status: nextDelivered ? 'DELIVERED' : 'PREPARING'
        };
      }
      return item;
    });
    
    // Recalculate status based on all items
    let finalOrderStatus = 'PREPARING';
    const allDelivered = updatedItems.every((item: any) => item.kds_status === 'DELIVERED' || item.is_delivered === true);
    const anyPreparing = updatedItems.some((item: any) => item.kds_status === 'PREPARING' || (!item.kds_status && !item.is_delivered));
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
      const { error } = await supabase.from('orders').update({ items: updatedItems, status: finalOrderStatus }).eq('id', orderId);
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

  // Helper to construct partial orders containing only items matching Tab and Order Status
  const getPartialOrdersForTabAndStatus = (tab: string | number, status: string) => {
    return orders.map(order => {
      const matchingItems = filterOrderItemsForTab(order, tab);
      if (matchingItems.length === 0) return null;

      if (status === 'PENDING') {
        if (order.status !== 'PENDING') return null;
      } else if (status === 'PREPARING') {
        if (order.status !== 'PREPARING') return null;
      } else if (status === 'READY') {
        if (order.status !== 'READY') return null;
      } else {
        return null;
      }

      return {
        ...order,
        matchingItems: matchingItems
      };
    }).filter(Boolean) as Order[];
  };

  const renderColumns = () => {
    const pendingPartial = getPartialOrdersForTabAndStatus(activeTab, 'PENDING');
    const preparingPartial = getPartialOrdersForTabAndStatus(activeTab, 'PREPARING');
    const readyPartial = getPartialOrdersForTabAndStatus(activeTab, 'READY');
    const totalOrders = pendingPartial.length + preparingPartial.length + readyPartial.length;

    const showPending = mobileQueueFilter === 'ALL' || mobileQueueFilter === 'PENDING';
    const showPreparing = mobileQueueFilter === 'ALL' || mobileQueueFilter === 'PREPARING';
    const showReady = mobileQueueFilter === 'ALL' || mobileQueueFilter === 'READY';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
        {/* Mobile Quick Queue Filter Tabs */}
        <div className="kds-mobile-queue-tabs">
          <button
            onClick={() => setMobileQueueFilter('ALL')}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: mobileQueueFilter === 'ALL' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
              background: mobileQueueFilter === 'ALL' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: mobileQueueFilter === 'ALL' ? 'white' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span>All Queues</span>
            <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: '8px' }}>
              {totalOrders}
            </span>
          </button>
          <button
            onClick={() => setMobileQueueFilter('PENDING')}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: mobileQueueFilter === 'PENDING' ? '1px solid var(--accent-gold)' : '1px solid rgba(255,255,255,0.08)',
              background: mobileQueueFilter === 'PENDING' ? 'rgba(255,179,106,0.2)' : 'rgba(255,255,255,0.03)',
              color: mobileQueueFilter === 'PENDING' ? 'var(--accent-gold)' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span>New Tickets</span>
            <span style={{ fontSize: '10px', background: 'rgba(255,179,106,0.2)', padding: '1px 6px', borderRadius: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
              {pendingPartial.length}
            </span>
          </button>
          <button
            onClick={() => setMobileQueueFilter('PREPARING')}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: mobileQueueFilter === 'PREPARING' ? '1px solid var(--secondary-glow)' : '1px solid rgba(255,255,255,0.08)',
              background: mobileQueueFilter === 'PREPARING' ? 'rgba(0,210,255,0.2)' : 'rgba(255,255,255,0.03)',
              color: mobileQueueFilter === 'PREPARING' ? 'var(--secondary-glow)' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span>In Kitchen</span>
            <span style={{ fontSize: '10px', background: 'rgba(0,210,255,0.2)', padding: '1px 6px', borderRadius: '8px', color: 'var(--secondary-glow)', fontWeight: 'bold' }}>
              {preparingPartial.length}
            </span>
          </button>
          <button
            onClick={() => setMobileQueueFilter('READY')}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: mobileQueueFilter === 'READY' ? '1px solid #4CAF50' : '1px solid rgba(255,255,255,0.08)',
              background: mobileQueueFilter === 'READY' ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.03)',
              color: mobileQueueFilter === 'READY' ? '#4CAF50' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span>Delivery Queue</span>
            <span style={{ fontSize: '10px', background: 'rgba(76,175,80,0.2)', padding: '1px 6px', borderRadius: '8px', color: '#4CAF50', fontWeight: 'bold' }}>
              {readyPartial.length}
            </span>
          </button>
        </div>

        <div className="kds-columns">
          {/* Column 1: PENDING */}
          {showPending && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h3 style={{ color: 'var(--accent-gold)', fontSize: '16px', margin: 0 }}>New Tickets</h3>
                <span style={{ background: 'rgba(255,179,106,0.1)', color: 'var(--accent-gold)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                  {pendingPartial.length}
                </span>
              </div>
              {pendingPartial.map(order => (
                <OrderCard 
                  key={order.id} 
                  order={order} 
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'PREPARING')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemDelivered(order.id, itemId)}
                  actionLabel="Accept & Prepare" 
                  actionColor="var(--primary-glow)" 
                  items={order.matchingItems!} 
                />
              ))}
              {pendingPartial.length === 0 && <EmptyState type="PENDING" />}
            </div>
          )}

          {/* Column 2: PREPARING */}
          {showPreparing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h3 style={{ color: 'var(--secondary-glow)', fontSize: '16px', margin: 0 }}>In Kitchen</h3>
                <span style={{ background: 'rgba(0,210,255,0.1)', color: 'var(--secondary-glow)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                  {preparingPartial.length}
                </span>
              </div>
              {preparingPartial.map(order => (
                <OrderCard 
                  key={order.id} 
                  order={order} 
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'READY')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemDelivered(order.id, itemId)}
                  actionLabel="Mark All Ready" 
                  actionColor="var(--secondary-glow)" 
                  items={order.matchingItems!} 
                />
              ))}
              {preparingPartial.length === 0 && <EmptyState type="PREPARING" />}
            </div>
          )}

          {/* Column 3: READY / DELIVERED */}
          {showReady && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                 <h3 style={{ color: '#4CAF50', fontSize: '16px', margin: 0 }}>Delivery Queue</h3>
                 <span style={{ background: 'rgba(76,175,80,0.1)', color: '#4CAF50', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                  {readyPartial.length}
                </span>
              </div>
              {readyPartial.map(order => (
                <OrderCard 
                  key={order.id} 
                  order={order} 
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'DELIVERED')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemDelivered(order.id, itemId)}
                  actionLabel="All Delivered" 
                  actionColor="#4CAF50" 
                  items={order.matchingItems!} 
                />
              ))}
              {readyPartial.length === 0 && <EmptyState type="READY" />}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-lucrative" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
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
        .kds-columns {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        .kds-tabs-bar {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 12px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          width: 100%;
        }
        .kds-tabs-bar::-webkit-scrollbar { display: none; }
        .kds-mobile-queue-tabs {
          display: none;
          gap: 6px;
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
          margin-bottom: 4px;
          scrollbar-width: none;
        }
        .kds-mobile-queue-tabs::-webkit-scrollbar { display: none; }
        .kds-order-card {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: relative;
          transition: all 0.3s ease;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        .kds-items-container {
          background: rgba(0,0,0,0.25);
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.05);
          box-sizing: border-box;
          width: 100%;
        }
        .kds-empty-state {
          padding: 28px 16px;
          border: 1px dashed var(--glass-border);
          border-radius: 16px;
          text-align: center;
          color: var(--text-muted);
          box-sizing: border-box;
          width: 100%;
        }
        .kds-header-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
          margin-top: 4px;
        }
        @media (max-width: 1024px) {
          .kds-columns {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 16px !important;
          }
          .kds-mobile-queue-tabs {
            display: flex !important;
          }
        }
        @media (max-width: 768px) {
          .kds-order-card {
            padding: 14px 12px !important;
            gap: 12px !important;
            border-radius: 14px !important;
          }
          .kds-items-container {
            padding: 10px !important;
            border-radius: 10px !important;
          }
          .kds-empty-state {
            padding: 18px 12px !important;
            border-radius: 12px !important;
          }
          .kds-header-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr auto !important;
            gap: 8px !important;
          }
          .kds-header-actions > * {
            flex: unset !important;
            padding: 8px 10px !important;
            font-size: 12px !important;
            justify-content: center !important;
          }
        }
        @media (max-width: 420px) {
          .kds-header-actions {
            grid-template-columns: 1fr 1fr !important;
          }
          .kds-header-actions > *:last-child {
            grid-column: span 2 !important;
          }
        }
      `}</style>

      <header style={{ width: '100%', boxSizing: 'border-box', paddingRight: '52px' }}>
        <h1 style={{ fontSize: 'clamp(18px, 5vw, 32px)', marginBottom: '6px', wordBreak: 'break-word' }}>{cinemaName ? `${cinemaName} POS` : 'Live Operating View'}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 12px', fontSize: '12px' }}>Operational Heatmap Mode: <strong>TICKET URGENCIES ACTIVE</strong> — {orders.filter(o => {
          if (o.status === 'DELIVERED' || o.status === 'CANCELLED') return false;
          const rawTime = o.timestamp;
          const t = (rawTime?.endsWith('Z') || rawTime?.includes('+')) ? new Date(rawTime).getTime() : new Date(rawTime + 'Z').getTime();
          const elapsed = (Date.now() - t) / 60000;
          if (o.status === 'PENDING') return elapsed >= 8;
          if (o.status === 'PREPARING') return elapsed >= 15;
          if (o.status === 'READY') return elapsed >= 12;
          return false;
        }).length} <span style={{ color: '#F44336', fontWeight: 'bold' }}>Critical</span>
        </p>
        <div className="kds-header-actions">
             <button 
                onClick={() => setShowKillSwitch(true)}
                className="glass-card" 
                style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '14px', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.2)', color: '#F44336', cursor: 'pointer' }}
             >
                 <Power size={16} />
                 <span style={{ fontWeight: 600, fontSize: '13px' }}>Kill Switch</span>
             </button>
             <button 
                onClick={() => setShowPaymentConfig(true)}
                className="glass-card" 
                style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '14px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.2)', color: '#FF9800', cursor: 'pointer' }}
             >
                 <CreditCard size={16} />
                 <span style={{ fontWeight: 600, fontSize: '13px' }}>Payment</span>
             </button>
             <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '14px' }}>
                 <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 8px #4CAF50', flexShrink: 0 }}></div>
                 <span style={{ fontWeight: 600, fontSize: '13px' }}>Live</span>
             </div>
        </div>
      </header>

      {/* Screen Tabs Bar */}
      <div className="kds-tabs-bar" style={{ marginTop: '-8px' }}>
        <button
          onClick={() => setActiveTab('ALL')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'ALL' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            color: activeTab === 'ALL' ? 'white' : 'var(--text-secondary)',
            border: activeTab === 'ALL' ? '1px solid var(--primary-glow)' : '1px solid rgba(255,255,255,0.05)',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <Monitor size={16} />
          <span>All Stations</span>
        </button>
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
  onToggleItem?: (itemId: string) => void;
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

  return (
    <div 
      className={`glass-card kds-order-card ${urgency.className}`} 
      style={{ 
        borderLeft: `4px solid ${urgency.color}`, 
        boxShadow: urgency.glow,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{displayOrderId}</div>
            {urgency.badge && (
              <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', background: `${urgency.color}20`, color: urgency.color, borderRadius: '4px', border: `1px solid ${urgency.color}40`, whiteSpace: 'nowrap' }}>
                {urgency.badge.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', wordBreak: 'break-word', lineHeight: 1.3 }}>{order.location}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: urgency.color, fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            <Clock size={12} /> {elapsed}m
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeStr}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
        <div style={{ 
          fontSize: '11px', 
          background: 'rgba(255,255,255,0.05)', 
          padding: '2px 8px', 
          borderRadius: '4px', 
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flexShrink: 1
        }}>
          {order.payment_method === 'POS_SPLIT' 
            ? (order.metadata?.split_cash !== undefined 
                ? `SPLIT (₹${order.metadata.split_cash} Cash + ₹${order.metadata.split_upi} UPI)`
                : 'SPLIT (CASH + UPI)')
            : order.payment_method?.replace('DEMO_', '').replace('_', ' ')}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button 
            onClick={() => setShowUser(!showUser)} 
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: showUser ? 'var(--accent-gold)' : 'var(--text-muted)', padding: '6px 8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <User size={14} />
          </button>
          <button 
            onClick={onChat} 
            className={hasUnread ? 'message-notify-glow' : ''}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--primary-glow)', padding: '6px 8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
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

      <div className="kds-items-container">
        {items?.map((item, idx) => {
          const itemId = item.item_id || item.food_id || String(idx);
          const isDelivered = item.is_delivered === true || item.kds_status === 'DELIVERED';

          return (
            <div 
              key={itemId || idx} 
              style={{ 
                marginBottom: idx !== items.length - 1 ? '10px' : 0,
                paddingBottom: idx !== items.length - 1 ? '10px' : 0,
                borderBottom: idx !== items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.is_combo && (
                      <span style={{ fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', borderRadius: '4px', flexShrink: 0 }}>COMBO</span>
                    )}
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 600,
                      textDecoration: isDelivered ? 'line-through' : 'none', 
                      color: isDelivered ? '#4CAF50' : 'inherit',
                      opacity: isDelivered ? 0.75 : 1,
                      wordBreak: 'break-word',
                      lineHeight: 1.3
                    }}>
                      {item.quantity}x {item.food_name || item.name}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {item.food_category || 'Classics'}
                    </span>
                  </div>
                </div>

                {/* Individual Item Tick Button */}
                {onToggleItem && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleItem(itemId);
                    }}
                    title={isDelivered ? "Mark as Not Delivered" : "Mark Ready & Delivered"}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      border: isDelivered ? '1px solid #4CAF50' : '1px solid rgba(255,255,255,0.2)',
                      background: isDelivered ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.06)',
                      color: isDelivered ? '#4CAF50' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <CheckCircle size={13} color={isDelivered ? '#4CAF50' : 'currentColor'} />
                    <span>{isDelivered ? 'Delivered' : 'Ready'}</span>
                  </button>
                )}
              </div>
              {item.item_note && (
                <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontStyle: 'italic', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={10} opacity={0.7} /> <span>{item.item_note}</span>
                </div>
              )}
              {item.addons && item.addons.length > 0 && (
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.2)' }}>
                  {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, i: number) => (
                    <div key={i}>+ {opt.name}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button 
        onClick={onAction} 
        style={{ 
            width: '100%', 
            padding: '12px', 
            background: `${urgency.color}15`, 
            color: urgency.color, 
            border: `1px solid ${urgency.color}40`, 
            borderRadius: '12px', 
            fontWeight: 'bold', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
            cursor: 'pointer' 
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

function EmptyState({ type }: { type?: string }) {
  return (
    <div className="kds-empty-state">
      <ShoppingBag size={28} opacity={0.3} style={{ marginBottom: '8px' }} />
      <div style={{ fontSize: '13px' }}>No orders in this queue</div>
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
