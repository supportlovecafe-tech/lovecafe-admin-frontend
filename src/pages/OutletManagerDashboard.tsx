import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, ShoppingBag, MessageSquare, Send, X, User, Phone, Power, Info, CreditCard, Monitor, ListFilter, Volume2, VolumeX, AlertTriangle, Pin, Lock, Unlock, KeyRound, Smartphone, ToggleLeft, ToggleRight, Save, Check, Loader2 } from 'lucide-react';
import { Database } from '../lib/database.types';
import { InventoryKillSwitch } from '../components/InventoryKillSwitch';
import { getPaymentDisplayInfo } from '../lib/paymentUtils';
import { API_BASE_URL } from '../lib/config';

type Order = Database['public']['Tables']['orders']['Row'] & {
  customer_profiles?: { first_name: string; last_name: string } | null;
  matchingItems?: any[];
};
type Message = Database['public']['Tables']['order_messages']['Row'];

// ─── Shared WebAudio Context Singleton (Avoids hardware audio thread leaks and renderer freeze) ───
let sharedAudioCtx: AudioContext | null = null;
const getSharedAudioContext = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    console.error('[KDS Audio] Error accessing AudioContext:', e);
    return null;
  }
};

// ─── Shared Helpers ───
export const safeParseItems = (itemsString: any) => {
  try {
    return typeof itemsString === 'string' ? JSON.parse(itemsString) : (Array.isArray(itemsString) ? itemsString : []);
  } catch (e) {
    return [];
  }
};

export default function OutletManagerDashboard({ user }: { user: any }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<Order | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, boolean>>({}); // orderId -> boolean
  const pendingUpdateRef = React.useRef<boolean>(false);
  
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);

  // Online Orders App Toggle (Admin/Manager Credentials only)
  const isAdmin = user?.role === 'OUTLET_MANAGER' || user?.role === 'SUPER_ADMIN';
  const [isOnlineOrderEnabled, setIsOnlineOrderEnabled] = useState<boolean>(true);
  const [updatingOnlineOrder, setUpdatingOnlineOrder] = useState<boolean>(false);

  const [cinemaName, setCinemaName] = useState(user.cinema_name || '');
  const [kdsConfigs, setKdsConfigs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string | number>('NO_ASSIGNED_KDS');
  const [mobileQueueFilter, setMobileQueueFilter] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'READY'>('ALL');

  // PIN Lock State (Used when JWT session expires and requires re-auth)
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [sessionNeedsRelogin, setSessionNeedsRelogin] = useState(false);
  const [lockPin, setLockPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [kdsError, setKdsError] = useState<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = React.useRef(soundEnabled);
  
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Independent per-staff pinned orders stored locally
  const staffStorageKey = `ce_kds_pinned_${user?.id || user?.email || 'staff'}`;
  const [pinnedOrderIds, setPinnedOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(staffStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const togglePinOrder = (orderId: string) => {
    setPinnedOrderIds(prev => {
      const updated = prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [orderId, ...prev];
      try {
        localStorage.setItem(staffStorageKey, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save pinned orders to storage', e);
      }
      return updated;
    });
  };

  const sortWithPinned = (orderList: Order[]) => {
    return [...orderList].sort((a, b) => {
      const aPinned = pinnedOrderIds.includes(a.id);
      const bPinned = pinnedOrderIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  };

  const handleToggleOnlineOrders = async () => {
    if (!isAdmin) {
      alert("Admin authorization required.\nOnly Manager or Super Admin credentials can change online ordering status.");
      return;
    }
    if (!user?.cinema_id || user.cinema_id === 'default') {
      alert("No active cinema outlet assigned to this session.");
      return;
    }

    const nextState = !isOnlineOrderEnabled;
    const confirmMessage = nextState
      ? "Turn ON online orders from the App?\n\nCustomers will be able to browse and place orders immediately."
      : "Turn OFF online orders from the App?\n\n⚠️ While turned OFF, customers attempting to order from the App will see: 'UNABLE to PLACE order Please contact outlet'. Local POS orders remain unaffected.";

    if (!window.confirm(confirmMessage)) return;

    setUpdatingOnlineOrder(true);
    try {
      const { data: updateData, error: updateErr } = await supabase
        .from('cinemas')
        .update({ is_online_order_enabled: nextState })
        .eq('id', user.cinema_id)
        .select('id');

      if (updateErr || !updateData || updateData.length === 0) {
        const { error: rpcErr } = await supabase.rpc('toggle_outlet_online_orders', {
          p_cinema_id: user.cinema_id,
          p_enabled: nextState
        });
        if (rpcErr) throw (updateErr || rpcErr);
      }

      setIsOnlineOrderEnabled(nextState);
    } catch (err: any) {
      console.error('Failed to toggle online orders:', err);
      alert(`Error updating online order status: ${err.message || 'Please check network and try again.'}`);
    } finally {
      setUpdatingOnlineOrder(false);
    }
  };

  // Phase elapsed time calculation: resets whenever order moves to next phase
  const getPhaseStartTime = (ord: Order) => {
    let rawTime = ord.timestamp;
    if (ord.status === 'PREPARING') {
      rawTime = ord.metadata?.preparing_at || ord.metadata?.accepted_at || ord.timestamp;
    } else if (ord.status === 'READY') {
      rawTime = ord.metadata?.ready_at || ord.metadata?.preparing_at || ord.timestamp;
    }
    const t = (rawTime?.endsWith('Z') || rawTime?.includes('+')) ? new Date(rawTime).getTime() : new Date(rawTime + 'Z').getTime();
    return t;
  };

  const getPhaseElapsedMinutes = (ord: Order) => {
    const startMs = getPhaseStartTime(ord);
    return Math.floor((Date.now() - startMs) / 60000);
  };

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // Check delay status every 10 seconds
    return () => clearInterval(timer);
  }, []);

  const criticalDelayedOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'DELIVERED' || o.status === 'CANCELLED') return false;
      return getPhaseElapsedMinutes(o) >= 30;
    });
  }, [orders, currentTime]);

  const hasCriticalDelay = criticalDelayedOrders.length > 0;

  // Standard chime for new tickets (uses shared AudioContext to prevent memory/thread leak)
  const playBuzzer = () => {
    try {
      const audioCtx = getSharedAudioContext();
      if (!audioCtx) return;
      
      const playTone = (startTime: number, duration: number, frequency: number) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + 0.05);
        gainNode.gain.setValueAtTime(1, startTime + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      playTone(now, 0.3, 120);
      playTone(now + 0.4, 0.3, 120);
      playTone(now + 0.8, 0.6, 120);
    } catch (e) {
      console.error("Audio error:", e);
    }
  };

  // Emergency 30+ min delay buzzer (loud commercial dual-pulse alarm)
  // Reuses shared AudioContext to prevent thousands of unclosed contexts freezing the browser renderer
  const playCriticalBuzzer = () => {
    try {
      const audioCtx = getSharedAudioContext();
      if (!audioCtx) return;
      
      const now = audioCtx.currentTime;
      const createBuzzTone = (startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, startTime);
        osc.frequency.exponentialRampToValueAtTime(110, startTime + duration);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(280, startTime);
        osc2.frequency.exponentialRampToValueAtTime(220, startTime + duration);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.85, startTime + 0.04);
        gain.gain.setValueAtTime(0.85, startTime + duration - 0.04);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime);
        osc2.start(startTime);
        osc.stop(startTime + duration);
        osc2.stop(startTime + duration);
      };

      createBuzzTone(now, 0.28);
      createBuzzTone(now + 0.38, 0.42);
    } catch (e) {
      console.error("Critical alarm audio error:", e);
    }
  };

  // Continuous emergency buzzer loop: fires every 3.5s while any ticket is >30m in its phase
  useEffect(() => {
    if (!hasCriticalDelay) return;

    playCriticalBuzzer();

    const interval = setInterval(() => {
      playCriticalBuzzer();
    }, 3500);

    return () => clearInterval(interval);
  }, [hasCriticalDelay]);

  useEffect(() => {
    fetchOrders();
    fetchKdsConfigs();
    
    let orderSubscription: any = null;
    let msgSubscription: any = null;
    let cinemaSubscription: any = null;
    let isSubscribed = true;
    let reconnectTimeout: any = null;

    if (user.cinema_id && user.cinema_id !== 'default') {
      supabase.from('cinemas').select('name, is_online_order_enabled').eq('id', user.cinema_id).single().then(({data}) => {
        if (data) {
          if (data.name && !cinemaName) setCinemaName(data.name);
          if (data.is_online_order_enabled !== undefined && data.is_online_order_enabled !== null) {
            setIsOnlineOrderEnabled(data.is_online_order_enabled);
          }
        }
      });

      cinemaSubscription = supabase
        .channel(`kds_cinema_toggle_sync_${user.cinema_id}_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'cinemas', filter: `id=eq.${user.cinema_id}` },
          (payload) => {
            const updated = payload.new as any;
            if (updated && updated.is_online_order_enabled !== undefined && updated.is_online_order_enabled !== null) {
              setIsOnlineOrderEnabled(updated.is_online_order_enabled);
            }
          }
        )
        .subscribe();
    }

    const setupSubscriptions = () => {
      if (!isSubscribed) return;

      if (orderSubscription) supabase.removeChannel(orderSubscription);
      if (msgSubscription) supabase.removeChannel(msgSubscription);

      orderSubscription = supabase
        .channel(`kds_orders_channel_${user.cinema_id || 'all'}_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            if (payload.eventType === 'INSERT' && soundEnabledRef.current) {
                playBuzzer();
            }
            if (!pendingUpdateRef.current) {
              pendingUpdateRef.current = true;
              setTimeout(() => {
                  fetchOrders();
                  pendingUpdateRef.current = false;
              }, 500);
            }
        })
        .subscribe((status) => {
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[KDS] Realtime disconnected (${status}), will retry in 5s...`);
            fetchOrders();
            if (isSubscribed) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = setTimeout(() => {
                if (isSubscribed) setupSubscriptions();
              }, 5000);
            }
          }
        });

      msgSubscription = supabase
        .channel(`kds_messages_channel_${user.cinema_id || 'all'}_${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages' }, payload => {
            const msg = payload.new as Message;
            if (msg.sender_role === 'CUSTOMER' && msg.order_id) {
              setUnreadMessages(prev => ({ ...prev, [msg.order_id!]: true }));
            }
        })
        .subscribe();
    };

    setupSubscriptions();

    // Fallback polling every 10 seconds to guarantee fresh orders even if realtime drops
    const pollInterval = setInterval(() => {
      fetchOrders();
    }, 10000);

    return () => {
      isSubscribed = false;
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (orderSubscription) supabase.removeChannel(orderSubscription);
      if (msgSubscription) supabase.removeChannel(msgSubscription);
      if (cinemaSubscription) supabase.removeChannel(cinemaSubscription);
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
        // Outlet managers & staff only see screens where user.id is in assigned_staffs
        const filteredData = data.filter(c => {
          return c.assigned_staffs && Array.isArray(c.assigned_staffs) && c.assigned_staffs.includes(user.id);
        });
        setKdsConfigs(filteredData);
        if (filteredData.length > 0) {
          setActiveTab(filteredData[0].screen_number);
        } else {
          setActiveTab('NO_ASSIGNED_KDS');
        }
      }
    } catch (e) {
      console.error("Failed to fetch KDS configurations:", e);
    }
  };

  const ensureAuthSession = async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return true;
      const { data: refreshed } = await supabase.auth.refreshSession();
      return Boolean(refreshed?.session);
    } catch {
      return false;
    }
  };

  const isAuthOrPermissionError = (err: any) => {
    const msg = (err?.message || '').toLowerCase();
    return (
      err?.code === '42501' ||
      err?.status === 401 ||
      err?.status === 403 ||
      msg.includes('jwt') ||
      msg.includes('permission') ||
      msg.includes('row-level security')
    );
  };

  const persistOrderUpdate = async (
    orderId: string,
    updatePayload: Record<string, any>,
    previousOrders: Order[],
    actionLabel: string
  ): Promise<boolean> => {
    const hasSession = await ensureAuthSession();
    if (!hasSession) {
      setOrders(previousOrders);
      setSessionNeedsRelogin(true);
      setIsPinLocked(true);
      setKdsError(`Cannot ${actionLabel}: outlet login session expired. Please sign in again.`);
      return false;
    }

    const runUpdate = async (payload: Record<string, any>) => {
      const res = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select('id, status');

      if (res.error && res.error.message?.includes('delivered_by') && 'delivered_by' in payload) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.delivered_by;
        return await supabase
          .from('orders')
          .update(fallbackPayload)
          .eq('id', orderId)
          .select('id, status');
      }
      return res;
    };

    try {
      let { data, error } = await runUpdate(updatePayload);

      if (error && isAuthOrPermissionError(error)) {
        const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        if (refreshed?.session) {
          const retryRes = await runUpdate(updatePayload);
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      if (error) throw error;

      if (!data || data.length === 0) {
        console.error(`[KDS] Order update affected 0 rows for ${orderId} (${actionLabel})`);
        setOrders(previousOrders);
        setKdsError(`Unable to ${actionLabel}: your account lacks permission for this outlet or the order no longer exists. Try signing out and back in.`);
        return false;
      }

      setKdsError(null);
      return true;
    } catch (e: any) {
      console.error(`Failed to ${actionLabel}:`, e);
      setOrders(previousOrders);
      if (isAuthOrPermissionError(e)) {
        const sessionOk = await ensureAuthSession();
        if (!sessionOk) {
          setSessionNeedsRelogin(true);
          setIsPinLocked(true);
        }
        setKdsError(`Permission error while trying to ${actionLabel}. Please sign out of the outlet terminal and sign back in.`);
      } else {
        setKdsError(`Failed to ${actionLabel}: ${e?.message || 'Unknown error'}`);
      }
      return false;
    }
  };

  const fetchOrders = async () => {
    try {
      const hasSession = await ensureAuthSession();
      if (!hasSession) {
        setSessionNeedsRelogin(true);
        setIsPinLocked(true);
      }

      let query = supabase
        .from('orders')
        .select('*')
        .in('status', ['PENDING', 'PREPARING', 'READY'])
        .order('timestamp', { ascending: false });
      
      if (user.cinema_id && user.cinema_id !== 'default') {
          query = query.eq('cinema_id', user.cinema_id);
      }
      
      // Increased limit from 30 to 150 to ensure active orders don't disappear on busy days
      const { data, error } = await query.limit(150);

      if (error) {
        console.warn("[KDS] Order query failed, checking session validity:", error);
        // If JWT expired or permission denied, attempt silent session refresh
        if (isAuthOrPermissionError(error)) {
          const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
          if (refreshData?.session) {
            const { data: retryData, error: retryErr } = await query.limit(150);
            if (!retryErr && retryData) {
              setOrders(retryData as Order[]);
              return;
            }
          } else {
            // Token expired and cannot be auto-refreshed: prompt staff for re-auth
            setSessionNeedsRelogin(true);
            setIsPinLocked(true);
          }
        }
        return;
      }

      if (data) {
        setOrders(prev => {
          if (prev.length !== data.length) return data as Order[];
          // Avoid creating a new array reference if data is completely unchanged (prevents UI re-render spikes)
          const isIdentical = prev.every((prevOrd, idx) => {
            const newOrd = data[idx];
            if (!newOrd || prevOrd.id !== newOrd.id || prevOrd.status !== newOrd.status || prevOrd.payment_status !== newOrd.payment_status) {
              return false;
            }
            const prevMeta = JSON.stringify(prevOrd.metadata || {});
            const newMeta = JSON.stringify(newOrd.metadata || {});
            if (prevMeta !== newMeta) return false;

            const prevItems = typeof prevOrd.items === 'string' ? prevOrd.items : JSON.stringify(prevOrd.items);
            const newItems = typeof newOrd.items === 'string' ? newOrd.items : JSON.stringify(newOrd.items);
            return prevItems === newItems;
          });
          return isIdentical ? prev : (data as Order[]);
        });
      }
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePinUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!lockPin || lockPin.length < 4) {
      setPinError('Please enter your 4-digit PIN');
      return;
    }

    setPinVerifying(true);
    setPinError('');

    try {
      // 1. Verify PIN via security definer RPC
      const { data: staffList, error: rpcErr } = await supabase.rpc('verify_staff_pin', {
        p_cinema_id: user.cinema_id,
        p_pin: lockPin.trim()
      });

      if (rpcErr) throw rpcErr;
      if (!staffList || staffList.length === 0) {
        setPinError('Incorrect PIN. Please try again.');
        setPinVerifying(false);
        return;
      }

      // 2. Refresh/verify Supabase auth session — never unlock into an anon session
      const sessionOk = await ensureAuthSession();
      if (!sessionOk) {
        setSessionNeedsRelogin(true);
        setPinError('Outlet session expired and cannot be auto-refreshed. Click "Log out completely" below and sign in with your outlet email & password.');
        setPinVerifying(false);
        return;
      }

      // 3. Unlock KDS and immediately reload orders
      setSessionNeedsRelogin(false);
      setIsPinLocked(false);
      setLockPin('');
      setKdsError(null);
      await fetchOrders();
    } catch (err: any) {
      setPinError(err.message || 'Verification failed. Try again.');
    } finally {
      setPinVerifying(false);
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

    const isDelivered = newStatus === 'DELIVERED';
    const isPreparing = newStatus === 'PREPARING';
    const isReady = newStatus === 'READY';
    const nowIso = new Date().toISOString();
    const currentMeta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
    
    let updatedMetadata: any = { ...currentMeta };
    if (isPreparing) {
      updatedMetadata.preparing_at = nowIso;
      updatedMetadata.accepted_at = nowIso;
      updatedMetadata.accepted_by = user?.id || null;
      updatedMetadata.accepted_by_name = user?.full_name || user?.name || 'Staff';
    } else if (isReady) {
      updatedMetadata.ready_at = nowIso;
      updatedMetadata.ready_by = user?.id || null;
      updatedMetadata.ready_by_name = user?.full_name || user?.name || 'Staff';
    } else if (isDelivered) {
      updatedMetadata.delivered_by = user?.id || null;
      updatedMetadata.delivered_by_name = user?.full_name || user?.name || user?.email || 'Staff';
      updatedMetadata.delivered_by_code = user?.employee_code || (user?.id ? 'EMP-' + user.id.substring(0, 6).toUpperCase() : 'STAFF');
      updatedMetadata.delivered_at = nowIso;
      setPinnedOrderIds(prev => {
        const updated = prev.filter(id => id !== orderId);
        try {
          localStorage.setItem(staffStorageKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, items: updatedItems, metadata: updatedMetadata } : o));

    const updatePayload: any = { 
      status: newStatus,
      items: updatedItems,
      metadata: updatedMetadata
    };
    if (isDelivered && user?.id) {
      updatePayload.delivered_by = user.id;
    }

    await persistOrderUpdate(orderId, updatePayload, previousOrders, `move order to ${newStatus}`);
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

    const isDelivered = finalOrderStatus === 'DELIVERED';
    const isPreparing = finalOrderStatus === 'PREPARING';
    const isReady = finalOrderStatus === 'READY';
    const nowIso = new Date().toISOString();
    const currentMeta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
    
    let updatedMetadata: any = { ...currentMeta };
    if (isPreparing && !currentMeta.preparing_at) {
      updatedMetadata.preparing_at = nowIso;
      updatedMetadata.accepted_at = nowIso;
    } else if (isReady && !currentMeta.ready_at) {
      updatedMetadata.ready_at = nowIso;
    } else if (isDelivered) {
      updatedMetadata.delivered_by = user?.id || null;
      updatedMetadata.delivered_by_name = user?.full_name || user?.name || user?.email || 'Staff';
      updatedMetadata.delivered_by_code = user?.employee_code || (user?.id ? 'EMP-' + user.id.substring(0, 6).toUpperCase() : 'STAFF');
      updatedMetadata.delivered_at = nowIso;
    }

    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, status: finalOrderStatus, metadata: updatedMetadata } : o));

    const updatePayload: any = { 
      items: updatedItems, 
      status: finalOrderStatus,
      metadata: updatedMetadata
    };
    if (isDelivered && user?.id) {
      updatePayload.delivered_by = user.id;
    }

    await persistOrderUpdate(orderId, updatePayload, previousOrders, 'update item status');
  };


  const toggleItemStatus = async (orderId: string, itemId: string, targetStatus: 'READY' | 'DELIVERED') => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const currentItems = safeParseItems(order.items);
    const updatedItems = currentItems.map((item: any) => {
      const currentId = item.item_id || item.food_id;
      if (currentId === itemId) {
        if (targetStatus === 'READY') {
          const isReady = item.kds_status === 'READY' || item.kds_status === 'DELIVERED';
          return { 
            ...item, 
            kds_status: isReady ? 'PREPARING' : 'READY',
            is_delivered: isReady ? false : item.is_delivered
          };
        } else {
          const isDelivered = item.is_delivered || item.kds_status === 'DELIVERED';
          return { 
            ...item, 
            is_delivered: !isDelivered,
            kds_status: !isDelivered ? 'DELIVERED' : 'READY'
          };
        }
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

    const isDelivered = finalOrderStatus === 'DELIVERED';
    const isPreparing = finalOrderStatus === 'PREPARING';
    const isReady = finalOrderStatus === 'READY';
    const nowIso = new Date().toISOString();
    const currentMeta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
    
    let updatedMetadata: any = { ...currentMeta };
    if (isPreparing && !currentMeta.preparing_at) {
      updatedMetadata.preparing_at = nowIso;
      updatedMetadata.accepted_at = nowIso;
    } else if (isReady && !currentMeta.ready_at) {
      updatedMetadata.ready_at = nowIso;
    } else if (isDelivered) {
      updatedMetadata.delivered_by = user?.id || null;
      updatedMetadata.delivered_by_name = user?.full_name || user?.name || user?.email || 'Staff';
      updatedMetadata.delivered_by_code = user?.employee_code || (user?.id ? 'EMP-' + user.id.substring(0, 6).toUpperCase() : 'STAFF');
      updatedMetadata.delivered_at = nowIso;
      setPinnedOrderIds(prev => {
        const updated = prev.filter(id => id !== orderId);
        try {
          localStorage.setItem(staffStorageKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }

    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, status: finalOrderStatus, metadata: updatedMetadata } : o));

    const updatePayload: any = { items: updatedItems, status: finalOrderStatus, metadata: updatedMetadata };
    if (isDelivered && user?.id) {
      updatePayload.delivered_by = user.id;
    }

    await persistOrderUpdate(orderId, updatePayload, previousOrders, 'toggle item status');
  };

  const handleOrderSettleSuccess = (orderId: string, finalPaymentMethod: string, newMetadata: any) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      payment_status: 'PAID',
      payment_method: finalPaymentMethod,
      metadata: newMetadata
    } : o));
  };

  const openChat = (order: Order) => {
    setActiveChat(order);
    setUnreadMessages(prev => ({ ...prev, [order.id]: false }));
  };

  // Helper to filter order items that belong to the active screen tab
  const filterOrderItemsForTab = (order: Order, tab: string | number) => {
    const items = safeParseItems(order.items);
    if (tab === 'ALL') return items;
    if (tab === 'NO_ASSIGNED_KDS') return [];

    if (tab === 'OVERFLOW') {
      // Find all categories assigned to any screen
      const allAssigned = kdsConfigs.reduce((acc, config) => {
        return [...acc, ...(config.assigned_categories || [])];
      }, [] as string[]).map(c => c.toUpperCase());

      return items.filter((item: any) => {
        const rawCat = (item.food_category || item.category || '').toUpperCase().trim();
        const catUnderscore = rawCat.replace(/\s+/g, '_');
        const catSpaces = rawCat.replace(/_/g, ' ');
        return !allAssigned.includes(rawCat) && !allAssigned.includes(catUnderscore) && !allAssigned.includes(catSpaces);
      });
    }

    const screenConfig = kdsConfigs.find(c => c.screen_number === Number(tab));
    if (!screenConfig) return [];

    const assigned = (screenConfig.assigned_categories || []).map((c: string) => c.toUpperCase());
    return items.filter((item: any) => {
      const rawCat = (item.food_category || item.category || '').toUpperCase().trim();
      const catUnderscore = rawCat.replace(/\s+/g, '_');
      const catSpaces = rawCat.replace(/_/g, ' ');
      return assigned.includes(rawCat) || assigned.includes(catUnderscore) || assigned.includes(catSpaces);
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
    if (activeTab === 'NO_ASSIGNED_KDS' || kdsConfigs.length === 0) {
      return (
        <div className="glass-card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '40px auto', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'rgba(255,152,0,0.15)', color: '#FF9800', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', border: '1px solid rgba(255,152,0,0.3)' }}>
            <Monitor size={28} />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>No Assigned KDS Station</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
            Your staff account ({user?.full_name || user?.name || user?.email || 'Current User'}) is not assigned to any KDS station at this outlet.
          </p>
          <div style={{ fontSize: '13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Please have an administrator assign your user to a KDS station under <strong>KDS Config</strong>.
          </div>
        </div>
      );
    }

    const rawPending = getPartialOrdersForTabAndStatus(activeTab, 'PENDING');
    const rawPreparing = getPartialOrdersForTabAndStatus(activeTab, 'PREPARING');
    const rawReady = getPartialOrdersForTabAndStatus(activeTab, 'READY');
    const totalOrders = rawPending.length + rawPreparing.length + rawReady.length;

    const pendingPartial = sortWithPinned(rawPending);
    const preparingPartial = sortWithPinned(rawPreparing);
    const readyPartial = sortWithPinned(rawReady);

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
                  user={user}
                  currentTime={currentTime}
                  isPinned={pinnedOrderIds.includes(order.id)}
                  onTogglePin={togglePinOrder}
                  onSettleSuccess={handleOrderSettleSuccess}
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'PREPARING')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemStatus(order.id, itemId, 'READY')}
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
                  user={user}
                  currentTime={currentTime}
                  isPinned={pinnedOrderIds.includes(order.id)}
                  onTogglePin={togglePinOrder}
                  onSettleSuccess={handleOrderSettleSuccess}
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'READY')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemStatus(order.id, itemId, 'READY')}
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
                  user={user}
                  currentTime={currentTime}
                  isPinned={pinnedOrderIds.includes(order.id)}
                  onTogglePin={togglePinOrder}
                  onSettleSuccess={handleOrderSettleSuccess}
                  hasUnread={unreadMessages[order.id]} 
                  onAction={() => updateStatus(order.id, 'DELIVERED')} 
                  onChat={() => openChat(order)} 
                  onToggleItem={(itemId) => toggleItemStatus(order.id, itemId, 'DELIVERED')}
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
        .kds-card-pinned {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .kds-card-pinned:hover {
          transform: translateY(-2px);
        }
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
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  if (hasCriticalDelay) {
                    alert("⚠️ Notice: The 30+ minute critical delay buzzer is active!\n\nPer management policy, this emergency alarm cannot be muted using the screen sound button. It will continue sounding until staff marks or accepts the delayed order(s) to the next phase.");
                  }
                }}
                className="glass-card" 
                style={{ 
                  padding: '10px 14px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  borderRadius: '14px', 
                  background: hasCriticalDelay ? 'rgba(220, 38, 38, 0.25)' : (soundEnabled ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)'), 
                  border: hasCriticalDelay ? '1.5px solid #ef4444' : (soundEnabled ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)'), 
                  color: hasCriticalDelay ? '#fca5a5' : (soundEnabled ? '#4CAF50' : 'var(--text-secondary)'), 
                  cursor: 'pointer' 
                }}
                title={hasCriticalDelay ? "Emergency 30+ min delay buzzer is active! Accept or mark tickets to silence." : "Toggle new ticket alert sound"}
             >
                 {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                 <span style={{ fontWeight: 600, fontSize: '13px' }}>Alerts {soundEnabled ? 'ON' : 'OFF'}</span>
                 {hasCriticalDelay && (
                   <span style={{
                     background: '#dc2626',
                     color: '#fff',
                     fontSize: '9px',
                     fontWeight: 900,
                     padding: '2px 6px',
                     borderRadius: '4px',
                     letterSpacing: '0.5px'
                   }}>
                     🚨 BUZZER ACTIVE (&gt;30m)
                   </span>
                 )}
             </button>
             {pinnedOrderIds.length > 0 && (
               <div 
                 className="glass-card" 
                 style={{ 
                   padding: '10px 14px', 
                   display: 'flex', 
                   alignItems: 'center', 
                   gap: '6px', 
                   borderRadius: '14px',
                   background: 'rgba(245, 158, 11, 0.12)',
                   border: '1px solid rgba(245, 158, 11, 0.35)',
                   color: '#fbbf24'
                 }}
                 title="Your pinned orders (isolated to your terminal only)"
               >
                   <Pin size={15} style={{ transform: 'rotate(-45deg)' }} />
                   <span style={{ fontWeight: 600, fontSize: '13px' }}>
                     {pinnedOrderIds.length} Pinned
                   </span>
               </div>
             )}
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
             {/* Admin Credentials Only: Online Order Toggle Switch */}
             {isAdmin ? (
               <button 
                  onClick={handleToggleOnlineOrders}
                  disabled={updatingOnlineOrder}
                  className="glass-card" 
                  style={{ 
                    padding: '10px 14px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    borderRadius: '14px', 
                    background: isOnlineOrderEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.18)', 
                    border: isOnlineOrderEnabled ? '1.5px solid rgba(16, 185, 129, 0.45)' : '1.5px solid rgba(239, 68, 68, 0.55)', 
                    color: isOnlineOrderEnabled ? '#10b981' : '#f87171', 
                    cursor: updatingOnlineOrder ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isOnlineOrderEnabled ? '0 0 12px rgba(16, 185, 129, 0.18)' : '0 0 12px rgba(239, 68, 68, 0.22)'
                  }}
                  title={isOnlineOrderEnabled ? "App Online Orders are ACTIVE. Click to Pause." : "App Online Orders are PAUSED. Click to Turn ON."}
               >
                   <Smartphone size={16} />
                   <span style={{ fontWeight: 700, fontSize: '13px' }}>
                     {updatingOnlineOrder ? 'Updating...' : (isOnlineOrderEnabled ? 'App Orders ON' : 'App Orders OFF')}
                   </span>
                   {isOnlineOrderEnabled ? (
                     <ToggleRight size={20} color="#10b981" />
                   ) : (
                     <ToggleLeft size={20} color="#f87171" />
                   )}
               </button>
             ) : (
               <div 
                  className="glass-card" 
                  style={{ 
                    padding: '10px 14px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    borderRadius: '14px', 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    border: '1px solid rgba(255, 255, 255, 0.08)', 
                    color: isOnlineOrderEnabled ? '#10b981' : '#f87171', 
                    opacity: 0.85,
                    cursor: 'not-allowed'
                  }}
                  title="App Order toggle is restricted to Admin credentials only."
               >
                   <Lock size={14} style={{ opacity: 0.6 }} />
                   <span style={{ fontWeight: 600, fontSize: '12px' }}>
                     App Orders: {isOnlineOrderEnabled ? 'ON' : 'OFF'}
                   </span>
               </div>
             )}
             <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '14px' }}>
                 <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 8px #4CAF50', flexShrink: 0 }}></div>
                 <span style={{ fontWeight: 600, fontSize: '13px' }}>Live</span>
             </div>
        </div>
      </header>

      {/* 🚨 30+ MINUTE CRITICAL DELAY EMERGENCY BUZZER BANNER */}
      {hasCriticalDelay && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.95) 0%, rgba(185, 28, 28, 0.95) 50%, rgba(220, 38, 38, 0.95) 100%)',
          border: '2px solid #ef4444',
          borderRadius: '14px',
          padding: '12px 18px',
          boxShadow: '0 0 30px rgba(220, 38, 38, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          color: '#ffffff',
          flexWrap: 'wrap',
          animation: 'urgency-pulse-red-glow 1.5s infinite',
          marginTop: '-4px',
          marginBottom: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
            <div style={{
              background: '#ffffff',
              color: '#dc2626',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 12px rgba(255,255,255,0.6)'
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>🚨 EMERGENCY BUZZER ACTIVE: ORDER WAITING &gt;30 MINS!</span>
                <span style={{ fontSize: '11px', background: 'rgba(0,0,0,0.35)', padding: '2px 8px', borderRadius: '4px' }}>
                  {criticalDelayedOrders.length} {criticalDelayedOrders.length === 1 ? 'ticket' : 'tickets'} delayed
                </span>
              </div>
              <div style={{ fontSize: '12px', opacity: 0.95, marginTop: '2px' }}>
                Buzzer cannot be muted by sound button. Progress ticket(s) to the next phase to silence alarm:
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {criticalDelayedOrders.slice(0, 3).map(o => {
              const elapsed = getPhaseElapsedMinutes(o);
              const qName = o.status === 'PENDING' ? 'New Ticket' : (o.status === 'PREPARING' ? 'Kitchen' : 'Delivery');
              return (
                <div
                  key={o.id}
                  style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 800
                  }}
                >
                  <Clock size={13} />
                  <span>#{o.display_id || o.id?.substring(0, 6).toUpperCase()} ({elapsed}m in {qName})</span>
                </div>
              );
            })}
            {criticalDelayedOrders.length > 3 && (
              <span style={{ fontSize: '11px', fontWeight: 800, background: 'rgba(0,0,0,0.35)', padding: '4px 8px', borderRadius: '6px' }}>
                +{criticalDelayedOrders.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Screen Tabs Bar: Outlet managers ONLY see their assigned KDS screen(s) */}
      <div className="kds-tabs-bar" style={{ marginTop: '-8px' }}>
        {kdsConfigs.length === 0 ? (
          <div style={{
            padding: '10px 16px',
            background: 'rgba(255, 152, 0, 0.1)',
            color: '#FF9800',
            border: '1px solid rgba(255, 152, 0, 0.25)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={16} />
            <span>No KDS Station Assigned to Your Account</span>
          </div>
        ) : (
          kdsConfigs.map(c => (
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
          ))
        )}
      </div>

      {/* Error Banner for failed order status updates */}
      {kdsError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.16)',
          border: '1.5px solid rgba(239, 68, 68, 0.6)',
          borderRadius: '14px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#fecaca',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0 }} />
            <span>{kdsError}</span>
          </div>
          <button
            type="button"
            onClick={() => setKdsError(null)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#fecaca',
              borderRadius: '8px',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Grid columns */}
      {renderColumns()}

      {showKillSwitch && <InventoryKillSwitch cinemaId={user.cinema_id} onClose={() => setShowKillSwitch(false)} />}
      {showPaymentConfig && <PaymentConfigModal cinemaId={user.cinema_id} onClose={() => setShowPaymentConfig(false)} />}
      
      {activeChat && <ChatModal order={activeChat} onClose={() => setActiveChat(null)} />}

      {/* ─── KDS Inactivity PIN Unlock Modal ─── */}
      {isPinLocked && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 5, 8, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '400px',
            background: 'linear-gradient(180deg, rgba(26, 26, 36, 0.98) 0%, rgba(15, 15, 22, 0.99) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '24px',
            padding: '32px 24px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 210, 255, 0.1)',
            textAlign: 'center'
          }}>
            {/* Lock Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.2) 0%, rgba(255, 47, 146, 0.2) 100%)',
              border: '1px solid rgba(0, 210, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--secondary-glow)'
            }}>
              <Lock size={28} />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              Authentication Required
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
              {sessionNeedsRelogin
                ? 'Your outlet terminal session expired. Sign out below and log in with your outlet email & password to accept orders.'
                : 'Staff session expired. Enter your 4-digit staff PIN to resume live orders.'}
            </p>

            {cinemaName && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '20px'
              }}>
                <Monitor size={14} />
                <span>{cinemaName}</span>
              </div>
            )}

            {/* PIN Dots */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '20px'
            }}>
              {[0, 1, 2, 3].map(i => {
                const isFilled = lockPin.length > i;
                return (
                  <div
                    key={i}
                    style={{
                      width: '48px',
                      height: '52px',
                      borderRadius: '12px',
                      background: isFilled ? 'rgba(0, 210, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      border: isFilled ? '2px solid var(--secondary-glow)' : '1px solid rgba(255, 255, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      color: 'var(--secondary-glow)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isFilled ? '●' : ''}
                  </div>
                );
              })}
            </div>

            {/* Physical keyboard hidden input */}
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={lockPin}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setLockPin(val);
                if (pinError) setPinError('');
              }}
              autoFocus
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                height: 0,
                width: 0
              }}
            />

            {pinError && (
              <div style={{
                color: '#ff6b9d',
                background: 'rgba(255, 47, 146, 0.1)',
                border: '1px solid rgba(255, 47, 146, 0.3)',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '16px'
              }}>
                {pinError}
              </div>
            )}

            {/* Touch Keypad */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              maxWidth: '280px',
              margin: '0 auto 20px'
            }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'].map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'CLR') {
                      setLockPin('');
                      setPinError('');
                    } else if (k === '⌫') {
                      setLockPin(prev => prev.slice(0, -1));
                      setPinError('');
                    } else {
                      if (lockPin.length < 4) {
                        const newPin = lockPin + k;
                        setLockPin(newPin);
                        setPinError('');
                      }
                    }
                  }}
                  style={{
                    padding: '14px 0',
                    borderRadius: '12px',
                    background: (k === 'CLR' || k === '⌫') ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.07)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: (k === 'CLR' || k === '⌫') ? 'var(--text-muted)' : '#ffffff',
                    fontSize: (k === 'CLR' || k === '⌫') ? '12px' : '18px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              onClick={() => handlePinUnlock()}
              disabled={pinVerifying || lockPin.length < 4}
              className="btn-lucrative"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '1px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: (pinVerifying || lockPin.length < 4) ? 0.6 : 1,
                cursor: (pinVerifying || lockPin.length < 4) ? 'not-allowed' : 'pointer'
              }}
            >
              {pinVerifying ? (
                <span>VERIFYING PIN...</span>
              ) : (
                <>
                  <Unlock size={16} />
                  <span>RESUME KDS TERMINAL</span>
                </>
              )}
            </button>

            <button
              onClick={async () => {
                localStorage.removeItem('ce_admin_profile');
                localStorage.removeItem('ce_outlet_cinema');
                await supabase.auth.signOut().catch(() => {});
                window.location.reload();
              }}
              style={{
                marginTop: '14px',
                width: sessionNeedsRelogin ? '100%' : 'auto',
                padding: sessionNeedsRelogin ? '12px 16px' : 0,
                background: sessionNeedsRelogin ? 'rgba(255, 47, 146, 0.16)' : 'none',
                border: sessionNeedsRelogin ? '1px solid rgba(255, 47, 146, 0.45)' : 'none',
                borderRadius: sessionNeedsRelogin ? '12px' : 0,
                color: sessionNeedsRelogin ? '#ff8ec6' : 'var(--text-muted)',
                fontSize: sessionNeedsRelogin ? '13px' : '12px',
                fontWeight: sessionNeedsRelogin ? 700 : 600,
                cursor: 'pointer',
                textDecoration: sessionNeedsRelogin ? 'none' : 'underline'
              }}
            >
              {sessionNeedsRelogin ? 'Sign In with Outlet Email & Password' : 'Log out completely'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, user, isPinned, onTogglePin, onSettleSuccess, hasUnread, onAction, onChat, onToggleItem, actionLabel, actionColor, items, currentTime }: {
  order: Order;
  user?: any;
  isPinned?: boolean;
  onTogglePin?: (orderId: string) => void;
  onSettleSuccess?: (orderId: string, finalPaymentMethod: string, newMetadata: any) => void;
  hasUnread: boolean;
  onAction: () => void;
  onChat: () => void;
  onToggleItem?: (itemId: string) => void;
  actionLabel: string;
  actionColor: string;
  items: any[];
  currentTime?: number;
}) {
  const [showUser, setShowUser] = useState(false);

  // Synchronously compute elapsed minutes using parent currentTime tick (zero per-card interval overhead)
  const nowMs = currentTime || Date.now();
  let phaseRawTime = order.timestamp;
  if (order.status === 'PREPARING') {
    phaseRawTime = order.metadata?.preparing_at || order.metadata?.accepted_at || order.timestamp;
  } else if (order.status === 'READY') {
    phaseRawTime = order.metadata?.ready_at || order.metadata?.preparing_at || order.timestamp;
  }
  const phaseT = (phaseRawTime?.endsWith('Z') || phaseRawTime?.includes('+')) ? new Date(phaseRawTime).getTime() : new Date(phaseRawTime + 'Z').getTime();
  const elapsed = Math.max(0, Math.floor((nowMs - phaseT) / 60000));

  const getUrgencyConfig = () => {
    const status = order.status;
    if (elapsed >= 30) {
      return { 
        color: '#dc2626', 
        glow: '0 0 35px rgba(220, 38, 38, 0.95)', 
        badge: '🚨 BUZZER (>30M)', 
        className: 'urgency-critical-glow' 
      };
    }
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
  const timeStr = utcDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const displayOrderId = order.display_id || order.id?.substring(0, 6).toUpperCase();
  const customerName = order.customer_profiles 
    ? `${order.customer_profiles.first_name || ''} ${order.customer_profiles.last_name || ''}`.trim() 
    : (order.metadata?.customer_name || order.metadata?.guest_name || (order.customer_phone ? `Customer (${order.customer_phone})` : 'Walk-in Customer'));

  const isPosCash = order.payment_method === 'POS_CASH';
  const isPosSplit = order.payment_method === 'POS_SPLIT';
  const isCash = isPosCash || isPosSplit || order.payment_method === 'CASH' || order.metadata?.settled_payment_mode === 'CASH';

  const isPod = order.payment_method === 'PAY_ON_DELIVERY' || order.payment_method === 'PAY_LATER' || !!order.metadata?.pay_on_delivery;
  const isPendingPayment = (order.payment_status === 'PENDING' || order.payment_method === 'PAY_ON_DELIVERY' || order.payment_method === 'PAY_LATER') && order.payment_status !== 'PAID';

  const paymentInfo = getPaymentDisplayInfo(order);

  // Compute station vs total order item counts (for station-specific KDS tabs)
  const allOrderItems = safeParseItems(order.items);
  const totalOrderPieces = allOrderItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
  const stationPieces = (items || []).reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
  const isPartialStation = totalOrderPieces > stationPieces;

  const [settledMode, setSettledMode] = useState<string | null>(order.metadata?.settled_payment_mode || null);
  const [settling, setSettling] = useState(false);
  const [showDeliverySettleModal, setShowDeliverySettleModal] = useState(false);

  const handleSettle = async (mode: 'CASH' | 'UPI', autoDeliverAfter = false) => {
    if (settling) return;
    if (!autoDeliverAfter) {
      const confirmSettle = window.confirm(
        `Confirm settlement of ₹${Number(order.total_amount).toFixed(2)} for Order #${displayOrderId} via ${mode}?`
      );
      if (!confirmSettle) return;
    }

    setSettling(true);
    try {
      const isStaffOrder = Boolean(order.staff_id);
      const finalPaymentMethod = isStaffOrder 
        ? (mode === 'CASH' ? 'POS_CASH' : 'POS_UPI') 
        : (mode === 'CASH' ? 'CASH' : 'UPI');

      const updatedMetadata = {
        ...(order.metadata || {}),
        original_payment_method: order.metadata?.original_payment_method || order.payment_method,
        pay_on_delivery: true,
        settled_payment_mode: mode,
        settled_at: new Date().toISOString(),
        settled_by: user?.id || null,
        settled_by_name: user?.full_name || user?.name || user?.email || 'Staff',
        settled_by_code: user?.employee_code || (user?.id ? 'EMP-' + user.id.substring(0, 6).toUpperCase() : 'STAFF'),
        settled_cash: mode === 'CASH' ? Number(order.total_amount) : 0,
        settled_upi: mode === 'UPI' ? Number(order.total_amount) : 0
      };

      const updateData: any = {
        payment_status: 'PAID',
        payment_method: finalPaymentMethod,
        metadata: updatedMetadata
      };

      if (mode === 'CASH') {
        updateData.collected_cash = Number(order.total_amount);
        updateData.return_cash = 0;
      }

      const { data: settledRows, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id)
        .select('id');

      if (error) throw error;
      if (!settledRows || settledRows.length === 0) {
        throw new Error('Permission denied or session expired. Please sign out and sign in again.');
      }
      setSettledMode(mode);
      setShowDeliverySettleModal(false);

      if (onSettleSuccess) {
        onSettleSuccess(order.id, finalPaymentMethod, updatedMetadata);
      }

      if (autoDeliverAfter) {
        onAction();
      }
    } catch (err: any) {
      console.error("Failed to settle order:", err);
      alert("Settlement failed: " + (err.message || 'Unknown error'));
    } finally {
      setSettling(false);
    }
  };

  // Compute collected and returned amounts
  const rawCollected = (order as any).collected_cash ?? order.metadata?.collected_cash ?? (isPosSplit ? order.metadata?.split_collected_cash : undefined);
  const rawReturn = (order as any).return_cash ?? order.metadata?.return_cash ?? (isPosSplit ? order.metadata?.split_return_cash : undefined);

  const collectedAmt = rawCollected !== undefined && rawCollected !== null && Number(rawCollected) > 0 
    ? Number(rawCollected) 
    : (isPosCash ? order.total_amount : 0);
  const returnedAmt = rawReturn !== undefined && rawReturn !== null 
    ? Number(rawReturn) 
    : 0;

  const showCashInfo = isCash && (collectedAmt > 0 || returnedAmt > 0);
  const cashDifference = collectedAmt - returnedAmt;

  return (
    <div 
      className={`glass-card kds-order-card ${urgency.className} ${isPinned ? 'kds-card-pinned' : ''}`} 
      style={{ 
        borderLeft: isPinned ? '5px solid #f59e0b' : `4px solid ${urgency.color}`, 
        boxShadow: isPinned 
          ? (urgency.glow !== 'none' ? `${urgency.glow}, 0 0 16px rgba(245, 158, 11, 0.45)` : '0 0 16px rgba(245, 158, 11, 0.35)') 
          : urgency.glow,
        borderTop: isPinned ? '1px solid rgba(245, 158, 11, 0.45)' : undefined,
        borderRight: isPinned ? '1px solid rgba(245, 158, 11, 0.45)' : undefined,
        borderBottom: isPinned ? '1px solid rgba(245, 158, 11, 0.45)' : undefined,
        background: isPinned ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(18, 20, 29, 0.95) 100%)' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>#{displayOrderId}</div>
            {isPinned && (
              <span style={{ 
                fontSize: '9px', 
                fontWeight: 800, 
                padding: '2px 7px', 
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 100%)', 
                color: '#fbbf24', 
                borderRadius: '4px', 
                border: '1px solid #f59e0b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                letterSpacing: '0.5px'
              }}>
                <Pin size={10} style={{ transform: 'rotate(-45deg)' }} /> PINNED
              </span>
            )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: 700,
            background: paymentInfo.bg, 
            border: paymentInfo.border,
            padding: '2px 8px', 
            borderRadius: '5px', 
            color: paymentInfo.color,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flexShrink: 1,
            letterSpacing: '0.2px'
          }}>
            {paymentInfo.label}
          </div>
          {isPartialStation && (
            <span style={{ 
              fontSize: '10px', 
              fontWeight: 800, 
              background: 'rgba(255, 152, 0, 0.15)', 
              border: '1px solid rgba(255, 152, 0, 0.35)', 
              color: '#fbbf24', 
              padding: '2px 6px', 
              borderRadius: '5px',
              whiteSpace: 'nowrap'
            }}>
              Station: {stationPieces}/{totalOrderPieces} items
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {onTogglePin && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(order.id);
              }} 
              title={isPinned ? "Unpin order (my terminal only)" : "Pin order to top (my terminal only)"}
              style={{ 
                background: isPinned ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.05)', 
                border: isPinned ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)', 
                color: isPinned ? '#fbbf24' : 'var(--text-muted)', 
                padding: '6px 8px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <Pin size={14} style={{ transform: isPinned ? 'rotate(0deg)' : 'rotate(45deg)', fill: isPinned ? '#fbbf24' : 'none' }} />
            </button>
          )}
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

      {/* Pay on Delivery / Unpaid Alert & Direct Settlement Box on KDS Tile */}
      {(isPendingPayment && !settledMode && order.payment_status !== 'PAID') && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(245, 158, 11, 0.16) 100%)',
          border: '1.5px solid #ef4444',
          borderRadius: '10px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                background: '#dc2626',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 900,
                padding: '2px 6px',
                borderRadius: '4px',
                letterSpacing: '0.5px'
              }}>
                UNPAID
              </span>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5' }}>
                Collect at Delivery ({paymentInfo.shortLabel})
              </span>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#ffffff' }}>
              ₹{Number(order.total_amount).toFixed(2)}
            </span>
          </div>

          {/* Settle Action Buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              disabled={settling}
              onClick={(e) => {
                e.stopPropagation();
                handleSettle('CASH');
              }}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                background: 'rgba(34, 197, 94, 0.25)',
                color: '#4ade80',
                fontSize: '11px',
                fontWeight: 800,
                cursor: settling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s'
              }}
            >
              <CheckCircle size={13} />
              <span>Settle Cash</span>
            </button>
            <button
              type="button"
              disabled={settling}
              onClick={(e) => {
                e.stopPropagation();
                handleSettle('UPI');
              }}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 210, 255, 0.5)',
                background: 'rgba(0, 210, 255, 0.25)',
                color: '#38bdf8',
                fontSize: '11px',
                fontWeight: 800,
                cursor: settling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s'
              }}
            >
              <CheckCircle size={13} />
              <span>Settle UPI</span>
            </button>
          </div>
        </div>
      )}

      {/* Settled Badge if POD order was settled */}
      {(settledMode || (order.payment_status === 'PAID' && (isPod || order.metadata?.settled_payment_mode))) && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.35)',
          borderRadius: '8px',
          padding: '5px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle size={13} color="#4ade80" />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#4ade80' }}>
              SETTLED ({settledMode ? (paymentInfo.channel === 'POS' ? `POS ${settledMode === 'CASH' ? 'Cash' : 'UPI'}` : `APP ${settledMode === 'CASH' ? 'Cash' : 'UPI'}`) : paymentInfo.label})
            </span>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff' }}>
            ₹{Number(order.total_amount).toFixed(2)}
          </span>
        </div>
      )}

      {/* POS Cash Collected, Returned & Diff (Bill) Strip */}
      {showCashInfo && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: '8px',
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Collected: <strong style={{ color: '#ffffff' }}>₹{collectedAmt.toFixed(2)}</strong>
            </span>
            <span 
              onClick={async (e) => {
                e.stopPropagation();
                if (returnedAmt <= 0) return;
                const isPaid = !!order.metadata?.return_cash_paid;
                const newMetadata = { ...(order.metadata || {}), return_cash_paid: !isPaid };
                const { data: updRows, error } = await supabase.from('orders').update({ metadata: newMetadata }).eq('id', order.id).select('id');
                if (error || !updRows || updRows.length === 0) {
                  console.error("Failed to update return cash status:", error);
                  alert("Could not update return cash status. Please refresh or re-login.");
                }
              }}
              style={{ 
              color: returnedAmt > 0 ? '#4ade80' : 'var(--text-muted)', 
              fontWeight: 800,
              background: returnedAmt > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.05)',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: returnedAmt > 0 ? 'pointer' : 'default',
              textDecoration: order.metadata?.return_cash_paid ? 'line-through' : 'none',
              opacity: order.metadata?.return_cash_paid ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}>
              Returned: ₹{returnedAmt.toFixed(2)}
              {returnedAmt > 0 && order.metadata?.return_cash_paid && <CheckCircle size={12} />}
            </span>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            fontSize: '10.5px', 
            borderTop: '1px dashed rgba(255,255,255,0.1)', 
            paddingTop: '3px',
            color: 'var(--accent-gold)'
          }}>
            <span>Diff (Total Bill):</span>
            <span style={{ fontWeight: 900 }}>₹{cashDifference.toFixed(2)}</span>
          </div>
        </div>
      )}

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
          const isReady = item.kds_status === 'READY';
          const isCompleted = isDelivered || isReady;
          
          let statusText = 'Ready';
          if (isDelivered) statusText = 'Delivered';
          else if (isReady) statusText = 'Ready (Done)';

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
                      textDecoration: isCompleted ? 'line-through' : 'none', 
                      color: isCompleted ? '#4CAF50' : 'inherit',
                      opacity: isCompleted ? 0.75 : 1,
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
                    title={isDelivered ? "Mark as Not Delivered" : "Toggle Status"}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      border: isCompleted ? '1px solid #4CAF50' : '1px solid rgba(255,255,255,0.2)',
                      background: isCompleted ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.06)',
                      color: isCompleted ? '#4CAF50' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <CheckCircle size={13} color={isCompleted ? '#4CAF50' : 'currentColor'} />
                    <span>{statusText}</span>
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
                  {item.addons.flatMap((a: any) => (a.selectedOptions || a.options || [])).filter(Boolean).map((opt: any, i: number) => (
                    <div key={i}>+ {opt.name}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isPartialStation && (
          <div style={{ 
            fontSize: '11px', 
            color: '#fbbf24', 
            background: 'rgba(255, 184, 0, 0.08)',
            border: '1px dashed rgba(255, 184, 0, 0.25)',
            borderRadius: '6px',
            padding: '5px 8px',
            marginTop: '8px', 
            textAlign: 'center' 
          }}>
            +{totalOrderPieces - stationPieces} other item(s) in this order routed to other station KDS
          </div>
        )}
      </div>

      <button 
        onClick={() => {
          if (isPendingPayment && !settledMode && order.payment_status !== 'PAID' && actionLabel === 'All Delivered') {
            setShowDeliverySettleModal(true);
            return;
          }
          onAction();
        }} 
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

      {/* Pay on Delivery Settlement & Verification Modal */}
      {showDeliverySettleModal && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, #181824 0%, #101018 100%)',
              border: '1.5px solid rgba(255, 179, 106, 0.35)',
              borderRadius: '18px',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(255, 179, 106, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              color: 'white',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.5px'
                }}>
                  PAY ON DELIVERY
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)' }}>
                  #{displayOrderId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliverySettleModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: 'var(--text-muted)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>

            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                Verify Payment Collection
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                This order was placed as Pay on Delivery. Confirm how the customer paid the runner to complete delivery:
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{order.location}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent-gold)', marginTop: '1px' }}>
                  ₹{Number(order.total_amount).toFixed(2)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                disabled={settling}
                onClick={() => handleSettle('CASH', true)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(34, 197, 94, 0.6)',
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.15) 100%)',
                  color: '#4ade80',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: settling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 15px rgba(34, 197, 94, 0.15)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} />
                  <span>Collected via Cash</span>
                </div>
                <span style={{ fontWeight: 900 }}>₹{Number(order.total_amount).toFixed(2)}</span>
              </button>

              <button
                type="button"
                disabled={settling}
                onClick={() => handleSettle('UPI', true)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(0, 210, 255, 0.6)',
                  background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.25) 0%, rgba(0, 210, 255, 0.15) 100%)',
                  color: '#38bdf8',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: settling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 15px rgba(0, 210, 255, 0.15)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} />
                  <span>Collected via UPI</span>
                </div>
                <span style={{ fontWeight: 900 }}>₹{Number(order.total_amount).toFixed(2)}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDeliverySettleModal(false)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              Cancel & Keep in Queue
            </button>
          </div>
        </div>
      )}
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
  const [initialMethods, setInitialMethods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMethods();
  }, [cinemaId]);

  const fetchMethods = async () => {
    if (!cinemaId || cinemaId === 'default') {
      const defaultMethods = ['DEMO_UPI', 'DEMO_CARD', 'PAY_ON_DELIVERY', 'PAY_LATER'];
      setMethods(defaultMethods);
      setInitialMethods(defaultMethods);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase
        .from('cinemas')
        .select('allowed_payment_methods')
        .eq('id', cinemaId)
        .single();

      if (error) throw error;

      if (data?.allowed_payment_methods && Array.isArray(data.allowed_payment_methods)) {
        setMethods(data.allowed_payment_methods as string[]);
        setInitialMethods(data.allowed_payment_methods as string[]);
      } else {
        const defaultMethods = ['DEMO_UPI', 'DEMO_CARD', 'PAY_ON_DELIVERY', 'PAY_LATER'];
        setMethods(defaultMethods);
        setInitialMethods(defaultMethods);
      }
    } catch (e: any) {
      console.error('Error fetching payment methods:', e);
      setStatusMessage({ type: 'error', text: `Failed to load payment options (${e?.message || 'network/auth error'}). Using defaults.` });
      setMethods(['DEMO_UPI', 'DEMO_CARD', 'PAY_ON_DELIVERY', 'PAY_LATER']);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (methodId: string) => {
    setStatusMessage(null);
    setMethods(prev => {
      if (prev.includes(methodId)) {
        return prev.filter(m => m !== methodId);
      } else {
        return [...prev, methodId];
      }
    });
  };

  const handleSave = async () => {
    if (methods.length === 0) {
      setStatusMessage({ type: 'error', text: 'You must select at least one active payment method.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    let saved = false;
    let lastError = '';

    // 1. Direct Supabase update (do NOT send updated_at — cinemas table has no updated_at column)
    try {
      const { data: directData, error: directErr } = await supabase
        .from('cinemas')
        .update({ allowed_payment_methods: methods })
        .eq('id', cinemaId)
        .select('allowed_payment_methods');

      if (!directErr && directData && directData.length > 0) {
        saved = true;
      } else if (directErr) {
        lastError = directErr.message;
      }
    } catch (e: any) {
      lastError = e?.message || '';
    }

    // 2. Try Supabase RPC fallback
    if (!saved) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('update_outlet_payment_methods', {
          p_cinema_id: cinemaId,
          p_methods: methods
        });
        if (!rpcErr && rpcData) {
          saved = true;
        } else if (rpcErr) {
          lastError = rpcErr.message || lastError;
        }
      } catch (e: any) {
        lastError = e?.message || lastError;
      }
    }

    // 3. Try Backend API route as reliable server-side fallback
    if (!saved && API_BASE_URL) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/update-payment-methods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cinemaId, allowedPaymentMethods: methods })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) saved = true;
        } else {
          const errJson = await res.json().catch(() => ({}));
          if (errJson?.error) lastError = errJson.error;
        }
      } catch (e: any) {
        lastError = e?.message || lastError;
      }
    }

    setSaving(false);

    if (saved) {
      setInitialMethods([...methods]);
      setStatusMessage({ type: 'success', text: '✓ Payment options saved successfully! App checkout updated.' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setStatusMessage({ 
        type: 'error', 
        text: `Failed to save to database${lastError ? `: ${lastError}` : '. Please check your login session or server connection.'}` 
      });
    }
  };

  const PAYMENT_OPTIONS = [
    {
      id: 'DEMO_UPI',
      label: 'UPI (QR & Apps)',
      desc: 'Google Pay, PhonePe, Paytm, BHIM instant UPI',
      icon: '📱'
    },
    {
      id: 'DEMO_CARD',
      label: 'Credit / Debit Card',
      desc: 'Visa, MasterCard, RuPay card payments',
      icon: '💳'
    },
    {
      id: 'PAY_ON_DELIVERY',
      label: 'Pay on Delivery (Cash)',
      desc: 'Customers pay cash when food is delivered to seat',
      icon: '💵'
    },
    {
      id: 'PAY_LATER',
      label: 'Pay Later',
      desc: 'Collect payment at the counter before delivery',
      icon: '⏱️'
    }
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#FF9800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={22} color="#FF9800" />
              Accepted Payment Options
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              Choose which payment modes are accepted in the customer app.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'white', cursor: 'pointer', padding: '8px', borderRadius: '10px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div style={{
            padding: '12px 14px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: statusMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: statusMessage.type === 'success' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
            color: statusMessage.type === 'success' ? '#4ade80' : '#f87171'
          }}>
            {statusMessage.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto 12px', color: '#FF9800' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>Loading payment settings...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {PAYMENT_OPTIONS.map(opt => {
              const isSelected = methods.includes(opt.id);
              return (
                <div 
                  key={opt.id} 
                  onClick={() => handleToggle(opt.id)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: isSelected ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255,255,255,0.03)', 
                    border: isSelected ? '1.5px solid rgba(255, 152, 0, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                    padding: '14px 16px', 
                    borderRadius: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '22px' }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => {}} // handled by parent onClick
                    style={{ width: '20px', height: '20px', accentColor: '#FF9800', cursor: 'pointer', flexShrink: 0 }} 
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons: Cancel & SAVE */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="hover-lift"
            style={{
              flex: 1.6,
              padding: '14px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #FF9800 0%, #FF5722 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 18px rgba(255, 152, 0, 0.4)'
            }}
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>SAVE CHANGES</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
