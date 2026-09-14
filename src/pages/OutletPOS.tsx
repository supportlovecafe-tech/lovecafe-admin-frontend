import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle, Store, Loader2, RefreshCcw, Smartphone, CreditCard, Banknote, X } from 'lucide-react';

export default function OutletPOS({ user }: { user: any }) {
  const [foods, setFoods] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Customer & Payment Details
  const [customerPhone, setCustomerPhone] = useState('');
  const [screenNumber, setScreenNumber] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [collectedCash, setCollectedCash] = useState('');

  // Persistence keys
  const STORAGE_KEYS = {
    MENU: `ce_pos_menu_${user?.cinema_id || 'default'}`,
    CART: `ce_pos_cart_${user?.cinema_id || 'default'}`,
    OUTBOX: `ce_pos_outbox_${user?.cinema_id || 'default'}`,
    CUSTOMER: `ce_pos_customer_${user?.cinema_id || 'default'}`,
  };

  // Receipt Modal State
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Validation State
  const [breakdown, setBreakdown] = useState<any>({
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    platform_charges: 0,
    total: 0
  });
  const [isValidating, setIsValidating] = useState(false);
  const [feeSettings, setFeeSettings] = useState<any>(null);

  // Restore Cart & Outbox on mount
  useEffect(() => {
    const savedCart = localStorage.getItem(STORAGE_KEYS.CART);
    if (savedCart) setCart(JSON.parse(savedCart));

    supabase.from('global_settings').select('*').eq('key', 'platform_fees').single().then(({data}) => {
        if (data && data.value) {
            setFeeSettings(data.value);
        }
    });

    const savedCustomer = localStorage.getItem(STORAGE_KEYS.CUSTOMER);
    if (savedCustomer) {
        const { phone, screen, seat } = JSON.parse(savedCustomer);
        setCustomerPhone(phone || '');
        setScreenNumber(screen || '');
        setSeatNumber(seat || '');
    }

    const savedOutbox = localStorage.getItem(STORAGE_KEYS.OUTBOX);
    if (savedOutbox) setOutbox(JSON.parse(savedOutbox));

    const handleStatusChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
        window.removeEventListener('online', handleStatusChange);
        window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Persist Cart & Customer Details
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOMER, JSON.stringify({ 
        phone: customerPhone, 
        screen: screenNumber, 
        seat: seatNumber 
    }));
  }, [customerPhone, screenNumber, seatNumber]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(outbox));
  }, [outbox]);

  useEffect(() => {
    fetchMenu();
  }, [user]);

  const fetchMenu = async () => {
    setLoading(true);
    let foodQuery = supabase.from('food_items').select('id, name, description, price, image_url, category, cinema_id, is_available');
    let comboQuery = supabase.from('combos').select('id, name, description, price, image_url, category, cinema_id, is_available, combo_items(*)').eq('is_available', true);
    
    if (user?.role === 'OUTLET_MANAGER' && user?.cinema_id) {
        foodQuery = foodQuery.or(`cinema_id.eq.${user.cinema_id},cinema_id.is.null`);
        comboQuery = comboQuery.or(`cinema_id.eq.${user.cinema_id},cinema_id.is.null`);
    }

    try {
        const [{ data: foodData }, { data: comboData }] = await Promise.all([foodQuery, comboQuery]);
        
        if (foodData) {
            const mappedCombos = (comboData || []).map(c => ({
                ...c,
                is_combo: true,
                category: '🔥 Combos'
            }));
            
            const allItems = [...mappedCombos, ...foodData];
            setFoods(allItems);
            localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(allItems));
            
            const uniqueCategories = Array.from(new Set(allItems.map(item => item.category)));
            setCategories(['All', ...uniqueCategories]);
        }
    } catch (e) {
        console.warn("Failed to fetch menu, loading from cache:", e);
        const cached = localStorage.getItem(STORAGE_KEYS.MENU);
        if (cached) {
            const allItems = JSON.parse(cached);
            setFoods(allItems);
            const uniqueCategories = Array.from(new Set(allItems.map(item => item.category)));
            setCategories(['All', ...uniqueCategories]);
        }
    } finally {
        setLoading(false);
    }
  };

  const addToCart = (item: any) => {
    setCart(prev => {
        const existing = prev.find(i => i.id === item.id);
        if (existing) {
            return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
        }
        return [...prev, { 
            ...item, 
            quantity: 1, 
            note: '',
            is_combo: item.is_combo || false,
            combo_id: item.is_combo ? item.id : null,
            combo_name: item.is_combo ? item.name : null
        }];
    });
  };

  const updateNote = (id: string, note: string) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, note } : i));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
        if (i.id === id) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : i;
        }
        return i;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  // Performance: Memoized Filtering
  const filteredFoods = useMemo(() => {
      return foods.filter(food => {
          const matchesCategory = activeCategory === 'All' || food.category === activeCategory;
          const matchesSearch = food.name.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesCategory && matchesSearch;
      });
  }, [foods, activeCategory, searchTerm]);

  // Effect to validate cart via Backend API
  useEffect(() => {
    if (cart.length === 0) {
        setBreakdown({ subtotal: 0, cgst: 0, sgst: 0, platform_charges: 0, total: 0 });
        return;
    }

    const validateCart = async () => {
        setIsValidating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: cart, cinema_id: user?.cinema_id, is_pos: true })
            });
            const data = await response.json();
            if (data.success) {
                setBreakdown(data.breakdown);
            }
        } catch (e) {
            console.error("Local validation fallback (Offline):", e);
            // Local fallback if offline
            const st = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            const platformCharges = 0; // Default to 0 when offline
            const cgst = Math.round(st * 0.025 * 100) / 100;
            const sgst = Math.round(st * 0.025 * 100) / 100;

            setBreakdown({
                subtotal: st,
                cgst,
                sgst,
                platform_charges: platformCharges,
                total: st + cgst + sgst + platformCharges
            });
        } finally {
            setIsValidating(false);
        }
    };

    const timeout = setTimeout(validateCart, 300);
    return () => clearTimeout(timeout);
  }, [cart]);

  const { subtotal, cgst, sgst, platform_charges, total } = breakdown;

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!customerPhone || !screenNumber || !seatNumber) {
        alert("Please provide customer phone, screen number, and seat number.");
        return;
    }

    setPlacingOrder(true);

    try {
        let outletCustomerId = null;
        
        // 1. Check or Create Outlet Customer
        const { data: existingCustomer } = await supabase
            .from('outlet_customers')
            .select('id')
            .eq('phone', customerPhone)
            .single();
            
        if (existingCustomer) {
            outletCustomerId = existingCustomer.id;
        } else {
            // Create new
            const shortId = Math.random().toString(36).substring(2, 10).toUpperCase();
            const { data: newCustomer, error: customerErr } = await supabase
                .from('outlet_customers')
                .insert({ phone: customerPhone, short_id: shortId })
                .select('id')
                .single();
            
            if (customerErr) throw customerErr;
            if (newCustomer) outletCustomerId = newCustomer.id;
        }

        const cinemaId = user?.cinema_id && user.cinema_id !== 'default' ? user.cinema_id : (foods[0]?.cinema_id || null);
        
        // Fetch Cinema Name & Outlet Number for Location String
        let cinemaName = 'Outlet';
        let outletNumber = '';
        if (cinemaId) {
            const { data: cinemaData } = await supabase.from('cinemas').select('name, outlet_number').eq('id', cinemaId).single();
            if (cinemaData) {
                cinemaName = cinemaData.name;
                outletNumber = cinemaData.outlet_number || '';
            }
        }

        const locationString = `OUTLET, ${cinemaName}, ${screenNumber}, ${seatNumber}`;

        const timestampStr = Date.now().toString();
        const shortTime = timestampStr.substring(timestampStr.length - 4);
        const displayId = `OUTLET-${shortTime}`;
        
        const itemsJson = cart.map(item => ({
            food_id: item.is_combo ? null : item.id,
            food_name: item.name,
            food_price: item.price,
            food_image: item.image_url,
            food_description: item.description,
            food_category: item.category,
            quantity: item.quantity,
            is_delivered: false,
            item_note: item.note || null,
            is_combo: item.is_combo || false,
            combo_id: item.is_combo ? item.id : null,
            combo_name: item.is_combo ? item.name : null
        }));

        const orderData = {
            cinema_id: cinemaId,
            display_id: displayId,
            staff_id: user?.id,
            collected_cash: paymentMode === 'Cash' ? (Number(collectedCash) || 0) : 0,
            return_cash: paymentMode === 'Cash' ? Math.max(0, (Number(collectedCash) || 0) - total) : 0,
            items: itemsJson,
            total_amount: total, 
            location: locationString,
            customer_phone: customerPhone,
            outlet_customer_id: outletCustomerId,
            status: 'PENDING',
            payment_status: 'PAID',
            payment_method: paymentMode === 'Cash' ? 'POS_CASH' : paymentMode.toUpperCase(),
            timestamp: new Date().toISOString(),
            is_demo_order: true,
            is_pos: true,
            metadata: {
                subtotal,
                cgst,
                sgst,
                platform_charges: platform_charges,
                outlet_number: outletNumber,
                staff_id: user?.id,
                staff_email: user?.email
            }
        };

        const idempotencyKey = crypto.randomUUID();

        // 2. Call Centralized Backend API (Idempotent)
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-idempotency-key': idempotencyKey
                },
                body: JSON.stringify(orderData)
            });

            if (!response.ok) {
                let errData;
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    errData = await response.json();
                } else {
                    const text = await response.text();
                    if (response.status === 403 && text.includes("Checking your browser")) {
                        throw new Error('Hostinger Bot Protection is blocking the API request. Please disable it in hPanel.');
                    }
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                throw new Error(errData.error || 'Failed to place order');
            }

            const result = await response.json();

            // Construct a displayable order object for the receipt modal
            const displayOrder = {
                ...orderData,
                id: result.id || result.idempotencyKey || idempotencyKey,
            };

            setLastOrder(displayOrder);
            setShowReceipt(true);
            setCart([]); 
        } catch (fetchError: any) {
            console.error("Network error during order placement:", fetchError);
            
            if (fetchError && fetchError.message && fetchError.message.includes('Bot Protection')) {
                alert(fetchError.message);
                setPlacingOrder(false);
                return;
            }

            // OFFLINE OUTBOX PATTERN
            const offlineOrder = {
                ...orderData,
                idempotencyKey,
                offline_at: new Date().toISOString()
            };
            setOutbox(prev => [...prev, offlineOrder]);
            
            // Still show receipt for the customer, but mark it as "Queued"
            setLastOrder({
                ...orderData,
                id: `OFFLINE-${idempotencyKey.substring(0,8)}`,
                is_offline: true
            });
            setShowReceipt(true);
            setCart([]);
            alert("POS is offline. Order has been saved locally and will sync when connection returns.");
        }
    } catch (e) {
        console.error("Failed to place outlet order:", e);
        alert("Failed to place order: " + (e as Error).message);
    } finally {
        setPlacingOrder(false);
    }
  };

  const syncOutbox = async () => {
    if (outbox.length === 0 || isOffline) return;
    setPlacingOrder(true);
    
    const remainingOutbox = [...outbox];
    const item = remainingOutbox[0];
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': item.idempotencyKey
            },
            body: JSON.stringify(item)
        });
        
        if (response.ok) {
            setOutbox(prev => prev.filter(i => i.idempotencyKey !== item.idempotencyKey));
        }
    } catch (e) {
        console.error("Sync failed for item:", item.idempotencyKey, e);
    } finally {
        setPlacingOrder(false);
    }
  };

  useEffect(() => {
    if (!isOffline && outbox.length > 0) {
        syncOutbox();
    }
  }, [isOffline, outbox]);

  const handlePrint = () => {
    window.print();
  };

  const handleNewOrder = () => {
    setShowReceipt(false);
    setLastOrder(null);
    setCustomerPhone('');
    setScreenNumber('');
    setSeatNumber('');
    setPaymentMode('Cash');
  };



  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    if (isMobile && isMobileCartOpen) document.body.style.overflow = 'hidden';
    else if (isMobile) document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileCartOpen]);

  if (loading) {
      return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={32} color="var(--primary-glow)" />
          </div>
      );
  }

  return (
    <>
    <div className="pos-container">
        
        {/* Left: Menu Catalog */}
        <div className="pos-main">
            <header className="pos-header">
                <div>
                    <h1 style={{ marginBottom: '8px' }}>Walk-in POS</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>Tap items to add to the customer's cart.</p>
                        {isOffline && (
                            <span style={{ background: 'rgba(244, 67, 54, 0.1)', color: '#F44336', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Smartphone size={12} /> OFFLINE MODE
                            </span>
                        )}
                        {outbox.length > 0 && (
                            <span style={{ background: 'rgba(255, 152, 0, 0.1)', color: '#FF9800', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <RefreshCcw size={12} className="animate-spin" /> {outbox.length} PENDING SYNC
                            </span>
                        )}
                        {!isOffline && outbox.length === 0 && (
                            <span style={{ background: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                                ● LIVE SYNC
                            </span>
                        )}
                    </div>
                </div>
                <div className="pos-search-wrap">
                    <input 
                        type="text" 
                        placeholder="Search menu..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ 
                            width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', outline: 'none' 
                        }}
                    />
                </div>
            </header>

            {/* Content Area: Categories + Grid */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minWidth: 0 }}>
                {/* Vertical Categories */}
                <div className="pos-categories-sidebar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            style={{
                                padding: '14px 16px',
                                borderRadius: '16px',
                                background: activeCategory === cat ? 'var(--primary-glow)' : 'rgba(255,255,255,0.03)',
                                color: activeCategory === cat ? 'white' : 'var(--text-muted)',
                                border: '1px solid',
                                borderColor: activeCategory === cat ? 'rgba(255,47,146,0.3)' : 'var(--glass-border)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                textAlign: 'left',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { if (activeCategory !== cat) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; } }}
                            onMouseLeave={e => { if (activeCategory !== cat) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; } }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Food Grid */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', minWidth: 0, WebkitOverflowScrolling: 'touch' as any }}>
                    <div className="pos-food-grid">
                    {filteredFoods.map(food => (
                        <div 
                            key={food.id} 
                            onClick={() => addToCart(food)}
                            className="glass-card" 
                            style={{ 
                                padding: '20px 16px', 
                                cursor: 'pointer', 
                                transition: 'transform 0.1s',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                justifyContent: 'center',
                                alignItems: 'center',
                                textAlign: 'center',
                                minHeight: '100px'
                            }}
                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <div style={{ fontWeight: 'bold', fontSize: '15px', lineHeight: '1.2' }}>{food.name}</div>
                            <div style={{ color: 'var(--accent-gold)', fontWeight: '900', fontSize: '18px' }}>₹{food.price}</div>
                        </div>
                    ))}
                </div>
            </div>
            </div>
        </div>

        {/* Cart Backdrop for mobile */}
        {isMobileCartOpen && (
          <div onClick={() => setIsMobileCartOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', zIndex: 1015 } as any} />
        )}
        {/* Right: Cart Sidebar */}
        <div className={`pos-cart ${isMobileCartOpen ? 'cart-open' : ''}`}>
            <div className="pos-cart-handle" />
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingCart size={20} color="var(--primary-glow)" /> Current Order
                </h2>
                <button 
                  className="mobile-cart-toggle" 
                  style={{ position: 'static', width: 36, height: 36, boxShadow: 'none' }}
                  onClick={() => setIsMobileCartOpen(false)}
                >
                  <X size={20} />
                </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                        <ShoppingCart size={40} opacity={0.2} style={{ marginBottom: '16px', margin: '0 auto' }} />
                        <p>Cart is empty</p>
                    </div>
                ) : cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {item.is_combo && <span style={{ fontSize: '9px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>COMBO</span>}
                                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{item.name}</div>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>₹{item.price} x {item.quantity}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button onClick={() => updateQuantity(item.id, -1)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', minWidth: 36, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Minus size={14} />
                                </button>
                                <span style={{ fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, 1)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', minWidth: 36, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Plus size={14} />
                                </button>
                                <button onClick={() => removeFromCart(item.id)} style={{ background: 'rgba(255,71,87,0.1)', border: 'none', color: '#ff4757', width: '36px', height: '36px', minWidth: 36, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px' }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        {/* Note Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '12px', opacity: 0.5 }}>📝</span>
                            <input 
                                type="text" 
                                placeholder="Add instructions..."
                                value={item.note}
                                onChange={e => updateNote(item.id, e.target.value)}
                                style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', outline: 'none' }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '24px', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
                {/* Customer Details Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Phone Number</label>
                            <input 
                                id="pos-customer-phone"
                                name="customer-phone"
                                autoComplete="off"
                                type="text" 
                                placeholder="e.g. 9876543210" 
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '16px' }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Screen</label>
                            <input 
                                id="pos-screen-number"
                                name="screen-number"
                                autoComplete="off"
                                type="text" 
                                placeholder="e.g. Screen 1" 
                                value={screenNumber}
                                onChange={e => setScreenNumber(e.target.value)}
                                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '16px' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Seat</label>
                            <input 
                                id="pos-seat-number"
                                name="seat-number"
                                autoComplete="off"
                                type="text" 
                                placeholder="e.g. F9" 
                                value={seatNumber}
                                onChange={e => setSeatNumber(e.target.value)}
                                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '16px' }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Payment Mode</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['Cash', 'Online', 'Card'].map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setPaymentMode(mode)}
                                    style={{
                                        flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold',
                                        background: paymentMode === mode ? 'var(--primary-glow)' : 'rgba(255,255,255,0.05)',
                                        color: paymentMode === mode ? 'white' : 'var(--text-muted)',
                                        border: '1px solid transparent'
                                    }}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    {paymentMode === 'Cash' && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Collected Cash (₹)</label>
                                <input 
                                    type="number" 
                                    placeholder="e.g. 500" 
                                    value={collectedCash}
                                    onChange={e => setCollectedCash(e.target.value)}
                                    style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '16px' }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Return Cash (₹)</label>
                                <div style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', color: 'var(--accent-gold)', fontSize: '16px', fontWeight: '900', display: 'flex', alignItems: 'center', height: '42px', boxSizing: 'border-box' }}>
                                    {collectedCash && Number(collectedCash) >= total ? (Number(collectedCash) - total).toFixed(2) : '0.00'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <span>Subtotal</span>
                        <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <span>CGST (2.5%)</span>
                        <span>₹{cgst.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <span>SGST (2.5%)</span>
                        <span>₹{sgst.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <span>Platform Charges ({(feeSettings?.pos_fee_percent !== undefined ? Number(feeSettings.pos_fee_percent) : 0)}%)</span>
                        <span>₹{platform_charges.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                        <span>Grand Total</span>
                        <span style={{ color: 'var(--accent-gold)' }}>₹{total.toFixed(2)}</span>
                    </div>
                </div>
                <button 
                    onClick={handlePlaceOrder}
                    disabled={cart.length === 0 || placingOrder}
                    style={{ 
                        width: '100%', 
                        padding: '16px', 
                        background: cart.length === 0 ? 'rgba(255,255,255,0.1)' : 'var(--primary-glow)', 
                        color: cart.length === 0 ? 'rgba(255,255,255,0.3)' : 'white', 
                        border: 'none', 
                        borderRadius: '16px', 
                        fontWeight: '900', 
                        fontSize: '16px',
                        cursor: cart.length === 0 || placingOrder ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    {placingOrder ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                    {placingOrder ? 'PLACING ORDER...' : 'PLACE ORDER'}
                </button>
            </div>
        </div>

        {/* Receipt Modal */}
        {showReceipt && lastOrder && (
            <div className="modal-overlay" style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
            }}>
                <div className="glass-card receipt-modal" style={{
                    width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column',
                    maxHeight: '90vh', overflow: 'hidden'
                }}>
                    {/* Modal Header */}
                    <div className="no-print" style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, color: 'var(--primary-glow)' }}>Order Placed Successfully!</h2>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={handlePrint} className="btn-lucrative" style={{ padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                                <Printer size={18} /> Print Bill
                            </button>
                            <button onClick={handleNewOrder} className="btn-lucrative" style={{ padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <RefreshCcw size={18} /> New Order
                            </button>
                        </div>
                    </div>

                    {/* Printable Area */}
                    <div className="printable-area" style={{ display: 'flex', padding: '32px', gap: '40px', overflowY: 'auto', background: 'white', color: 'black' }}>
                        
                        {/* Kitchen Copy */}
                        <div style={{ flex: 1, border: '1px dashed #ccc', padding: '24px', fontFamily: 'monospace' }}>
                            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #000', paddingBottom: '10px' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>KITCHEN COPY</h3>
                                <div>Order: {lastOrder.display_id}</div>
                                <div>Time: {new Date(lastOrder.timestamp).toLocaleTimeString()}</div>
                                <div style={{ marginTop: '8px', fontWeight: 'bold' }}>LOC: {lastOrder.location}</div>
                            </div>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #000' }}>
                                        <th style={{ padding: '8px 0' }}>QTY</th>
                                        <th style={{ padding: '8px 0' }}>ITEM</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lastOrder.items.map((item: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                                            <td style={{ padding: '12px 0', fontWeight: 'bold', fontSize: '16px' }}>{item.quantity}x</td>
                                            <td style={{ padding: '12px 0', fontSize: '16px' }}>
                                              {item.is_combo && <span style={{ fontSize: '10px', background: '#FF6B35', color: 'white', padding: '1px 5px', borderRadius: '3px', marginRight: '6px', fontWeight: 'bold' }}>COMBO</span>}
                                              {item.food_name}
                                              {item.item_note && <div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic', marginTop: '2px' }}>📝 {item.item_note}</div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>

                        {/* Customer Copy */}
                        <div className="receipt-modal" style={{ flex: 1, border: '1px solid #ccc', padding: '24px', fontFamily: 'monospace', position: 'relative', overflow: 'hidden', minHeight: '500px', background: 'white', color: 'black' }}>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                                    <h3 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>LOVE CAFE</h3>
                                    <div>Customer Receipt</div>
                                    {lastOrder.metadata?.outlet_number && (
                                        <div style={{ fontWeight: 'bold', marginTop: '4px' }}>Outlet ID: {lastOrder.metadata.outlet_number}</div>
                                    )}
                                    <div>Order: {lastOrder.display_id}</div>
                                    <div>Time: {new Date(lastOrder.timestamp).toLocaleTimeString()}</div>
                                    <div style={{ marginTop: '8px', fontWeight: 'bold' }}>{lastOrder.location}</div>
                                </div>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginBottom: '20px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #000' }}>
                                        <th style={{ padding: '8px 0' }}>QTY</th>
                                        <th style={{ padding: '8px 0' }}>ITEM</th>
                                        <th style={{ padding: '8px 0', textAlign: 'right' }}>PRICE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lastOrder.items.map((item: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                                            <td style={{ padding: '8px 0' }}>{item.quantity}</td>
                                            <td style={{ padding: '8px 0' }}>
                                              {item.is_combo && <span style={{ fontSize: '9px', background: '#FF6B35', color: 'white', padding: '1px 4px', borderRadius: '3px', marginRight: '5px', fontWeight: 'bold' }}>COMBO</span>}
                                              {item.food_name}
                                              {item.item_note && <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '2px' }}>📝 {item.item_note}</div>}
                                            </td>
                                            <td style={{ padding: '8px 0', textAlign: 'right' }}>₹{item.food_price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{ borderTop: '1px solid #000', paddingTop: '10px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                    <span>Subtotal</span>
                                    <span>₹{(lastOrder.metadata?.subtotal || (lastOrder.total_amount / 1.06)).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                    <span>CGST (2.5%)</span>
                                    <span>₹{(lastOrder.metadata?.cgst || ((lastOrder.total_amount / 1.06) * 0.025)).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                    <span>SGST (2.5%)</span>
                                    <span>₹{(lastOrder.metadata?.sgst || ((lastOrder.total_amount / 1.06) * 0.025)).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                    <span>Platform Fee (1%)</span>
                                    <span>₹{(lastOrder.metadata?.platform_charges || ((lastOrder.total_amount / 1.06) * 0.01)).toFixed(2)}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', borderTop: '2px solid #000', paddingTop: '10px' }}>
                                <span>TOTAL</span>
                                <span>₹{lastOrder.total_amount.toFixed(2)}</span>
                            </div>
                            {lastOrder.payment_method === 'POS_CASH' && lastOrder.collected_cash > 0 && (
                                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #ccc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                        <span>Cash Collected</span>
                                        <span>₹{lastOrder.collected_cash.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                                        <span>Change Returned</span>
                                        <span>₹{lastOrder.return_cash.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                            <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '12px' }}>
                                Thank you for choosing Love Cafe!
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        )}

        <button 
          className="mobile-cart-toggle" 
          onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
        >
          <ShoppingCart size={24} />
          {cart.length > 0 && <div className="badge">{cart.length}</div>}
        </button>
    </div>
    </>
  );
}
