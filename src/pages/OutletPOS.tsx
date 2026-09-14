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

  // Addons State
  const [addonGroups, setAddonGroups] = useState<any[]>([]);
  const [addonAssignments, setAddonAssignments] = useState<any[]>([]);
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [customizingSelections, setCustomizingSelections] = useState<Record<string, string[]>>({});

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
    const cinemaId = user?.cinema_id || user?.cinemaId;
    let foodQuery = supabase.from('food_items').select('id, name, description, price, image_url, category, cinema_id, is_available').eq('is_available', true);
    let comboQuery = supabase.from('combos').select('id, name, description, price, image_url, category, cinema_id, is_available, combo_items(*)').eq('is_available', true);
    let addonGroupQuery = supabase.from('addon_groups').select('*, addon_options(*)').order('sort_order', { ascending: true });
    let addonAssignQuery = supabase.from('addon_group_assignments').select('*');
    
    if (cinemaId) {
        foodQuery = foodQuery.or(`cinema_id.eq.${cinemaId},cinema_id.is.null`);
        comboQuery = comboQuery.or(`cinema_id.eq.${cinemaId},cinema_id.is.null`);
        addonGroupQuery = addonGroupQuery.or(`cinema_id.eq.${cinemaId},cinema_id.is.null`);
        addonAssignQuery = addonAssignQuery.or(`cinema_id.eq.${cinemaId},cinema_id.is.null`);
    }

    try {
        const [{ data: foodData }, { data: comboData }, { data: groupsData }, { data: assignsData }] = await Promise.all([
          foodQuery, 
          comboQuery,
          addonGroupQuery,
          addonAssignQuery
        ]);

        if (groupsData) setAddonGroups(groupsData);
        if (assignsData) setAddonAssignments(assignsData);
        
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

  const getItemAddons = (item: any) => {
    if (!item || item.is_combo || !addonGroups.length) return [];
    const itemAssigns = addonAssignments.filter(a => 
      a.food_item_id === item.id || (a.category && a.category === item.category)
    );
    const groupIds = new Set(itemAssigns.map(a => a.group_id));
    return addonGroups.filter(g => groupIds.has(g.id) && g.addon_options && g.addon_options.length > 0);
  };

  const handleItemClick = (item: any) => {
    const applicableAddons = getItemAddons(item);
    if (applicableAddons.length > 0) {
      const initSelections: Record<string, string[]> = {};
      applicableAddons.forEach(g => {
        if (g.selection_type === 'SINGLE' && g.is_required && g.addon_options?.length > 0) {
          initSelections[g.id] = [g.addon_options[0].id];
        } else {
          initSelections[g.id] = [];
        }
      });
      setCustomizingSelections(initSelections);
      setCustomizingItem(item);
    } else {
      addToCart(item);
    }
  };

  const confirmCustomization = () => {
    if (!customizingItem) return;
    const applicableAddons = getItemAddons(customizingItem);

    for (const g of applicableAddons) {
      if (g.is_required && (!customizingSelections[g.id] || customizingSelections[g.id].length === 0)) {
        alert(`Please select an option for ${g.display_name || g.name}`);
        return;
      }
    }

    const selectedAddonsFormatted: any[] = [];
    let addonsCost = 0;

    applicableAddons.forEach(g => {
      const selectedIds = customizingSelections[g.id] || [];
      if (selectedIds.length > 0) {
        const opts = (g.addon_options || []).filter((o: any) => selectedIds.includes(o.id)).map((o: any) => ({
          id: o.id,
          name: o.name,
          price: Number(o.price) || 0
        }));
        if (opts.length > 0) {
          opts.forEach((o: any) => addonsCost += o.price);
          selectedAddonsFormatted.push({
            groupId: g.id,
            groupName: g.display_name || g.name,
            selectedOptions: opts
          });
        }
      }
    });

    const optIdList = selectedAddonsFormatted.flatMap(a => a.selectedOptions.map((o: any) => o.id)).sort().join('_');
    const uniqueCartKey = `${customizingItem.id}_${optIdList}`;

    setCart(prev => {
      const existing = prev.find(i => (i.cartKey || i.id) === uniqueCartKey);
      if (existing) {
        return prev.map(i => (i.cartKey || i.id) === uniqueCartKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        ...customizingItem,
        cartKey: uniqueCartKey,
        quantity: 1,
        note: '',
        addons: selectedAddonsFormatted,
        base_price: customizingItem.price,
        price: customizingItem.price + addonsCost,
        is_combo: false
      }];
    });

    setCustomizingItem(null);
  };

  const addToCart = (item: any) => {
    setCart(prev => {
        const existing = prev.find(i => (i.cartKey || i.id) === item.id);
        if (existing) {
            return prev.map(i => (i.cartKey || i.id) === item.id ? { ...i, quantity: i.quantity + 1 } : i);
        }
        return [...prev, { 
            ...item, 
            cartKey: item.id,
            quantity: 1, 
            note: '',
            addons: [],
            is_combo: item.is_combo || false,
            combo_id: item.is_combo ? item.id : null,
            combo_name: item.is_combo ? item.name : null
        }];
    });
  };

  const updateNote = (id: string, note: string) => {
    setCart(prev => prev.map(i => (i.cartKey || i.id) === id ? { ...i, note } : i));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
        if ((i.cartKey || i.id) === id) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : i;
        }
        return i;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => (i.cartKey || i.id) !== id));
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
            addons: item.addons || [],
            is_combo: item.is_combo || false,
            combo_id: item.is_combo ? item.id : null,
            combo_name: item.is_combo ? item.name : null,
            apply_gst: item.apply_gst
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
            <div className="pos-content-area" style={{ minWidth: 0 }}>
                {/* Vertical Categories (horizontal on mobile) */}
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
                    {filteredFoods.map(food => {
                        const addons = getItemAddons(food);
                        const hasAddons = addons.length > 0;
                        return (
                            <div 
                                key={food.id} 
                                onClick={() => handleItemClick(food)}
                                className="glass-card" 
                                style={{ 
                                    padding: '16px 12px', 
                                    cursor: 'pointer', 
                                    transition: 'transform 0.1s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    minHeight: '90px',
                                    position: 'relative'
                                }}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {hasAddons && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '6px',
                                        right: '6px',
                                        fontSize: '9px',
                                        background: 'rgba(255,47,146,0.15)',
                                        color: 'var(--primary-glow)',
                                        border: '1px solid rgba(255,47,146,0.3)',
                                        padding: '1px 5px',
                                        borderRadius: '6px',
                                        fontWeight: 'bold'
                                    }}>
                                        CUSTOMIZABLE
                                    </span>
                                )}
                                <div style={{ fontWeight: 'bold', fontSize: '14px', lineHeight: '1.2' }}>{food.name}</div>
                                <div style={{ color: 'var(--accent-gold)', fontWeight: '900', fontSize: '17px' }}>₹{food.price}</div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            </div>
        </div>

        {/* Cart Backdrop for mobile */}
        {isMobileCartOpen && (
          <div onClick={() => setIsMobileCartOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 1015 } as any} />
        )}
        {/* Right: Cart Sidebar / Mobile Drawer */}
        <div className={`pos-cart ${isMobileCartOpen ? 'cart-open' : ''}`}>
            <div className="pos-cart-handle" />
            <div className="pos-cart-header">
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
                    <ShoppingCart size={20} color="var(--primary-glow)" /> Current Order
                    {cart.length > 0 && <span style={{ fontSize: '12px', background: 'rgba(255,47,146,0.2)', color: 'var(--primary-glow)', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
                </h2>
                <button 
                  className="mobile-cart-close" 
                  onClick={() => setIsMobileCartOpen(false)}
                  aria-label="Close cart"
                >
                  <X size={18} />
                </button>
            </div>
            
            <div className="pos-cart-body">
                {/* Cart Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
                            <ShoppingCart size={36} opacity={0.3} style={{ marginBottom: '12px', margin: '0 auto' }} />
                            <p style={{ margin: 0, fontSize: '14px' }}>Cart is empty</p>
                        </div>
                    ) : cart.map(item => {
                        const itemKey = item.cartKey || item.id;
                        return (
                        <div key={itemKey} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {item.is_combo && <span style={{ fontSize: '9px', background: 'linear-gradient(90deg,#FF6B35,#FF2D55)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>COMBO</span>}
                                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{item.name}</div>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>₹{item.price} x {item.quantity}</div>
                                    {item.addons && item.addons.length > 0 && (
                                        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, idx: number) => (
                                                <div key={idx} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>+ {opt.name}</span>
                                                    {opt.price > 0 && <span style={{ color: 'var(--accent-gold)' }}>+₹{opt.price}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button onClick={() => updateQuantity(itemKey, -1)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '34px', height: '34px', minWidth: 34, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Minus size={14} />
                                    </button>
                                    <span style={{ fontWeight: 'bold', width: '20px', textAlign: 'center', fontSize: '14px' }}>{item.quantity}</span>
                                    <button onClick={() => updateQuantity(itemKey, 1)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '34px', height: '34px', minWidth: 34, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Plus size={14} />
                                    </button>
                                    <button onClick={() => removeFromCart(itemKey)} style={{ background: 'rgba(255,71,87,0.1)', border: 'none', color: '#ff4757', width: '34px', height: '34px', minWidth: 34, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px' }}>
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
                                    onChange={e => updateNote(itemKey, e.target.value)}
                                    style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '12px', outline: 'none' }}
                                />
                            </div>
                        </div>
                        );
                    })}
                </div>

                {/* Checkout & Customer Details Section */}
                <div className="pos-cart-checkout-section">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label className="pos-label">Phone Number</label>
                            <input 
                                id="pos-customer-phone"
                                name="customer-phone"
                                autoComplete="off"
                                type="tel"
                                inputMode="numeric"
                                placeholder="e.g. 9876543210" 
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                                className="pos-input"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label className="pos-label">Screen</label>
                                <input 
                                    id="pos-screen-number"
                                    name="screen-number"
                                    autoComplete="off"
                                    type="text" 
                                    placeholder="e.g. Screen 1" 
                                    value={screenNumber}
                                    onChange={e => setScreenNumber(e.target.value)}
                                    className="pos-input"
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="pos-label">Seat</label>
                                <input 
                                    id="pos-seat-number"
                                    name="seat-number"
                                    autoComplete="off"
                                    type="text" 
                                    placeholder="e.g. F9" 
                                    value={seatNumber}
                                    onChange={e => setSeatNumber(e.target.value)}
                                    className="pos-input"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="pos-label">Payment Mode</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['Cash', 'Online', 'Card'].map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setPaymentMode(mode)}
                                        style={{
                                            flex: 1, padding: '10px 8px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold',
                                            background: paymentMode === mode ? 'var(--primary-glow)' : 'rgba(255,255,255,0.06)',
                                            color: paymentMode === mode ? 'white' : 'var(--text-muted)',
                                            border: paymentMode === mode ? '1px solid rgba(255,47,146,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMode === 'Cash' && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="pos-label">Collected Cash (₹)</label>
                                    <input 
                                        type="number" 
                                        inputMode="decimal"
                                        placeholder="e.g. 500" 
                                        value={collectedCash}
                                        onChange={e => setCollectedCash(e.target.value)}
                                        className="pos-input"
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="pos-label">Return Cash (₹)</label>
                                    <div style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'var(--accent-gold)', fontSize: '18px', fontWeight: '900', display: 'flex', alignItems: 'center', height: '44px', boxSizing: 'border-box' }}>
                                        ₹{collectedCash && Number(collectedCash) >= total ? (Number(collectedCash) - total).toFixed(2) : '0.00'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                            <span>Subtotal</span>
                            <span style={{ color: 'white', fontWeight: '600' }}>₹{subtotal.toFixed(2)}</span>
                        </div>
                        {cgst > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                                <span>CGST (2.5%)</span>
                                <span style={{ color: 'white' }}>₹{cgst.toFixed(2)}</span>
                            </div>
                        )}
                        {sgst > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                                <span>SGST (2.5%)</span>
                                <span style={{ color: 'white' }}>₹{sgst.toFixed(2)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                            <span>Platform Charges ({(feeSettings?.pos_fee_percent !== undefined ? Number(feeSettings.pos_fee_percent) : 0)}%)</span>
                            <span style={{ color: 'white' }}>₹{platform_charges.toFixed(2)}</span>
                        </div>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.12)', margin: '4px 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px', fontWeight: 'bold', color: 'white' }}>
                            <span>Grand Total</span>
                            <span style={{ color: 'var(--accent-gold)', fontSize: '20px', fontWeight: '900' }}>₹{total.toFixed(2)}</span>
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
                            borderRadius: '14px', 
                            fontWeight: '900', 
                            fontSize: '16px',
                            cursor: cart.length === 0 || placingOrder ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: cart.length > 0 ? '0 4px 20px rgba(255, 47, 146, 0.4)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {placingOrder ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                        {placingOrder ? 'PLACING ORDER...' : 'PLACE ORDER'}
                    </button>
                </div>
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
                                              {item.addons && item.addons.length > 0 && (
                                                  <div style={{ fontSize: '11px', color: '#333', marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid #ccc' }}>
                                                      {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, i: number) => (
                                                          <div key={i}>+ {opt.name}</div>
                                                      ))}
                                                  </div>
                                              )}
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
                                              {item.addons && item.addons.length > 0 && (
                                                  <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                                                      {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, i: number) => (
                                                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                              <span>+ {opt.name}</span>
                                                              {opt.price > 0 && <span>₹{opt.price}</span>}
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
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

        {/* Customization Modal */}
        {customizingItem && (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
            }}>
                <div style={{
                    background: '#12121a', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '24px', width: '100%', maxWidth: '520px',
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Customize {customizingItem.name}</h3>
                            <div style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 'bold', marginTop: '2px' }}>Base: ₹{customizingItem.price}</div>
                        </div>
                        <button onClick={() => setCustomizingItem(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Options List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {getItemAddons(customizingItem).map((group: any) => {
                            const isSingle = group.selection_type === 'SINGLE';
                            const currentSelected = customizingSelections[group.id] || [];

                            return (
                                <div key={group.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{group.display_name || group.name}</div>
                                        <span style={{
                                            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                                            background: group.is_required ? 'rgba(255,47,146,0.15)' : 'rgba(255,255,255,0.06)',
                                            color: group.is_required ? 'var(--primary-glow)' : 'var(--text-muted)'
                                        }}>
                                            {group.is_required ? 'Required (Pick 1)' : (isSingle ? 'Optional (Pick 1)' : 'Optional (Multiple)')}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {(group.addon_options || []).filter((o: any) => o.is_available !== false).map((opt: any) => {
                                            const isChecked = currentSelected.includes(opt.id);

                                            const toggle = () => {
                                                setCustomizingSelections(prev => {
                                                    const cur = prev[group.id] || [];
                                                    if (isSingle) {
                                                        return { ...prev, [group.id]: isChecked && !group.is_required ? [] : [opt.id] };
                                                    } else {
                                                        return {
                                                            ...prev,
                                                            [group.id]: isChecked ? cur.filter(x => x !== opt.id) : [...cur, opt.id]
                                                        };
                                                    }
                                                });
                                            };

                                            return (
                                                <div 
                                                    key={opt.id}
                                                    onClick={toggle}
                                                    style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                                                        background: isChecked ? 'rgba(255,47,146,0.1)' : 'rgba(255,255,255,0.03)',
                                                        border: isChecked ? '1.5px solid var(--primary-glow)' : '1px solid rgba(255,255,255,0.06)',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: 18, height: 18, borderRadius: isSingle ? '50%' : '5px',
                                                            border: isChecked ? '2px solid var(--primary-glow)' : '2px solid rgba(255,255,255,0.3)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            background: isChecked ? 'var(--primary-glow)' : 'transparent'
                                                        }}>
                                                            {isChecked && <div style={{ width: 6, height: 6, borderRadius: isSingle ? '50%' : '1px', background: 'white' }} />}
                                                        </div>
                                                        <span style={{ fontSize: '14px', fontWeight: isChecked ? 700 : 500 }}>{opt.name}</span>
                                                    </div>
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: isChecked ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                                                        {Number(opt.price) > 0 ? `+₹${opt.price}` : 'Free'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Item Price</div>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--accent-gold)' }}>
                                ₹{(() => {
                                    let total = customizingItem.price;
                                    getItemAddons(customizingItem).forEach((g: any) => {
                                        const sel = customizingSelections[g.id] || [];
                                        (g.addon_options || []).forEach((o: any) => {
                                            if (sel.includes(o.id)) total += (Number(o.price) || 0);
                                        });
                                    });
                                    return total;
                                })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setCustomizingItem(null)} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={confirmCustomization} className="btn-lucrative" style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '12px', fontWeight: 800 }}>
                                Add to Order
                            </button>
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
