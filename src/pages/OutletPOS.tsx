import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { 
  ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle, Store, 
  Loader2, RefreshCcw, Smartphone, CreditCard, Banknote, Split, X, Search, 
  ArrowRight, Tv, Armchair, Phone 
} from 'lucide-react';

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

  // Split Payment (Cash + UPI) Details
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');
  const [splitCollectedCash, setSplitCollectedCash] = useState<string>('');

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
  const [receiptTab, setReceiptTab] = useState<'customer' | 'kitchen'>('customer');
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
    let foodQuery = supabase.from('food_items').select('id, name, description, price, image_url, category, cinema_id, is_available, is_veg').eq('is_available', true);
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

    // Immediate local optimistic breakdown so UI updates instantly with addons
    const st = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cgst = Math.round(st * 0.025 * 100) / 100;
    const sgst = Math.round(st * 0.025 * 100) / 100;
    setBreakdown((prev: any) => ({
        ...prev,
        subtotal: st,
        cgst,
        sgst,
        total: Math.round((st + cgst + sgst + (prev?.platform_charges || 0)) * 100) / 100
    }));

    const activeCinemaId = (user?.cinema_id && user.cinema_id !== 'default') ? user.cinema_id : (user?.cinemaId || (foods[0]?.cinema_id || null));

    const validateCart = async () => {
        setIsValidating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: cart, cinema_id: activeCinemaId, is_pos: true })
            });
            const data = await response.json();
            if (data.success && data.breakdown) {
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
  }, [cart, user?.cinema_id, user?.cinemaId, foods]);

  const { subtotal, cgst, sgst, platform_charges, total } = breakdown;

  // Split Payment (Cash + UPI) Auto-calculation Logic
  const handleSplitCashChange = (val: string) => {
    setSplitCash(val);
    if (val === '' || val === '.') {
      setSplitUpi('');
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num >= 0 && num <= total) {
        const remaining = Math.max(0, Math.round((total - num) * 100) / 100);
        setSplitUpi(remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(2));
      } else if (num > total) {
        setSplitUpi('0');
      }
    }
  };

  const handleSplitUpiChange = (val: string) => {
    setSplitUpi(val);
    if (val === '' || val === '.') {
      setSplitCash('');
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num >= 0 && num <= total) {
        const remaining = Math.max(0, Math.round((total - num) * 100) / 100);
        setSplitCash(remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(2));
      } else if (num > total) {
        setSplitCash('0');
      }
    }
  };

  const handle5050Split = () => {
    if (total <= 0) return;
    const half = Math.round((total / 2) * 100) / 100;
    const rem = Math.round((total - half) * 100) / 100;
    setSplitCash(half % 1 === 0 ? half.toString() : half.toFixed(2));
    setSplitUpi(rem % 1 === 0 ? rem.toString() : rem.toFixed(2));
  };

  // Recalculate split amounts if total updates and split mode is active with filled values
  useEffect(() => {
    if (paymentMode === 'Split' && splitCash !== '') {
      const numCash = parseFloat(splitCash);
      if (!isNaN(numCash)) {
        if (numCash <= total) {
          const rem = Math.max(0, Math.round((total - numCash) * 100) / 100);
          setSplitUpi(rem % 1 === 0 ? rem.toString() : rem.toFixed(2));
        } else {
          setSplitCash(total % 1 === 0 ? total.toString() : total.toFixed(2));
          setSplitUpi('0');
        }
      }
    }
  }, [total, paymentMode]);

  // Validation helpers for Split Payment
  const isSplitMode = paymentMode === 'Split';
  const numSplitCash = isSplitMode ? (parseFloat(splitCash) || 0) : 0;
  const numSplitUpi = isSplitMode ? (parseFloat(splitUpi) || 0) : 0;
  const isSplitBalanced = isSplitMode 
    ? (splitCash !== '' && splitUpi !== '' && Math.abs((numSplitCash + numSplitUpi) - total) <= 0.05 && numSplitCash >= 0 && numSplitUpi >= 0)
    : true;
  const isTenderedCashValid = isSplitMode
    ? (splitCollectedCash === '' || parseFloat(splitCollectedCash) >= numSplitCash)
    : true;
  const isSplitMismatch = isSplitMode && (!isSplitBalanced || !isTenderedCashValid);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!customerPhone || !screenNumber || !seatNumber) {
        setIsMobileCartOpen(true);
        alert("Please provide customer phone, screen number, and seat number.");
        return;
    }

    // Validate Split Payment
    if (paymentMode === 'Split') {
        const numCash = parseFloat(splitCash);
        const numUpi = parseFloat(splitUpi);
        if (isNaN(numCash) || isNaN(numUpi) || numCash < 0 || numUpi < 0 || splitCash === '' || splitUpi === '') {
            alert("Please enter valid Cash and UPI amounts for Split payment.");
            return;
        }
        if (Math.abs((numCash + numUpi) - total) > 0.05) {
            alert(`Split amounts (Cash ₹${numCash.toFixed(2)} + UPI ₹${numUpi.toFixed(2)} = ₹${(numCash + numUpi).toFixed(2)}) must equal the grand total ₹${total.toFixed(2)}.`);
            return;
        }
        if (splitCollectedCash && parseFloat(splitCollectedCash) < numCash) {
            alert(`Cash received from customer (₹${parseFloat(splitCollectedCash)}) cannot be less than the required split cash portion (₹${numCash.toFixed(2)}).`);
            return;
        }
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
            id: item.is_combo ? (item.combo_id || item.id) : (item.food_id || item.id),
            food_id: item.is_combo ? null : (item.food_id || item.id),
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
            combo_id: item.is_combo ? (item.combo_id || item.id) : null,
            combo_name: item.is_combo ? (item.combo_name || item.name) : null,
            apply_gst: item.apply_gst
        }));

        const isSplit = paymentMode === 'Split';
        const actualCollectedCash = isSplit
            ? (splitCollectedCash ? (parseFloat(splitCollectedCash) || 0) : numSplitCash)
            : (paymentMode === 'Cash' ? (Number(collectedCash) || 0) : 0);
        const actualReturnCash = isSplit
            ? Math.max(0, actualCollectedCash - numSplitCash)
            : (paymentMode === 'Cash' ? Math.max(0, actualCollectedCash - total) : 0);

        const orderData = {
            cinema_id: cinemaId,
            display_id: displayId,
            staff_id: user?.id,
            collected_cash: actualCollectedCash,
            return_cash: actualReturnCash,
            items: itemsJson,
            total_amount: total, 
            location: locationString,
            customer_phone: customerPhone,
            outlet_customer_id: outletCustomerId,
            status: 'PENDING',
            payment_status: 'PAID',
            payment_method: isSplit ? 'POS_SPLIT' : (paymentMode === 'Cash' ? 'POS_CASH' : paymentMode.toUpperCase()),
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
                staff_code: user?.employee_code || user?.employeeCode || null,
                staff_name: user?.full_name || user?.name || null,
                staff_email: user?.email,
                ...(isSplit ? {
                    split_payment: true,
                    split_cash: numSplitCash,
                    split_upi: numSplitUpi,
                    split_collected_cash: actualCollectedCash,
                    split_return_cash: actualReturnCash
                } : {})
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
                let errData: any = {};
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    errData = await response.json();
                } else {
                    const text = await response.text();
                    if (response.status === 403 && text.includes("Checking your browser")) {
                        alert('Hostinger Bot Protection is blocking the API request. Please disable it in hPanel.');
                        setPlacingOrder(false);
                        return;
                    }
                    errData = { error: `Server returned ${response.status}: ${response.statusText}` };
                }
                const errorMsg = errData.details || errData.error || 'Failed to place order';
                console.error("Order API rejection:", errorMsg);
                alert(`Order Placement Failed: ${errorMsg}`);
                setPlacingOrder(false);
                return;
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

            // Genuinely offline or network disconnected
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
            alert("Network connection issue. Order has been saved locally and will sync when connection returns.");
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
        
        if (response.ok || response.status === 409 || response.status === 400) {
            setOutbox(prev => prev.filter(i => i.idempotencyKey !== item.idempotencyKey));
        }
    } catch (e) {
        console.error("Sync failed for item:", item.idempotencyKey, e);
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
    setReceiptTab('customer');
    setCustomerPhone('');
    setScreenNumber('');
    setSeatNumber('');
    setPaymentMode('Cash');
    setCollectedCash('');
    setSplitCash('');
    setSplitUpi('');
    setSplitCollectedCash('');
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
                    <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none', zIndex: 1 }} />
                    <input 
                        type="text" 
                        placeholder="Search menu items..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pos-search-input"
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')} 
                            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </header>

            {/* Quick Customer Info Bar on POS Screen */}
            <div className="pos-customer-quickbar">
                <div className="pos-quickbar-field" style={{ flex: 1.4 }}>
                    <Phone size={14} color="var(--primary-glow)" style={{ flexShrink: 0 }} />
                    <input 
                        type="tel"
                        inputMode="numeric"
                        placeholder="Mobile (10 digits)..."
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                        className="pos-quickbar-input"
                        maxLength={10}
                    />
                    {customerPhone && (
                        <button 
                            type="button"
                            onClick={() => setCustomerPhone('')} 
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', padding: 0, cursor: 'pointer', display: 'flex' }}
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="pos-quickbar-field" style={{ flex: 1 }}>
                    <Tv size={14} color="var(--primary-glow)" style={{ flexShrink: 0 }} />
                    <input 
                        type="text"
                        placeholder="Screen..."
                        value={screenNumber}
                        onChange={e => setScreenNumber(e.target.value)}
                        className="pos-quickbar-input"
                    />
                </div>
                <div className="pos-quickbar-field" style={{ flex: 0.9 }}>
                    <Armchair size={14} color="var(--primary-glow)" style={{ flexShrink: 0 }} />
                    <input 
                        type="text"
                        placeholder="Seat..."
                        value={seatNumber}
                        onChange={e => setSeatNumber(e.target.value)}
                        className="pos-quickbar-input"
                    />
                </div>
            </div>

            {/* Content Area: Categories + Grid */}
            <div className="pos-content-area" style={{ minWidth: 0 }}>
                {/* Categories Bar */}
                <div className="pos-categories-sidebar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`pos-category-btn ${activeCategory === cat ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Food Grid */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', minWidth: 0, WebkitOverflowScrolling: 'touch' as any }}>
                    <div className="pos-food-grid">
                    {filteredFoods.map(food => {
                        const addons = getItemAddons(food);
                        const hasAddons = addons.length > 0;
                        const inCartQty = cart.filter(i => (i.food_id || i.id) === food.id).reduce((s, i) => s + i.quantity, 0);
                        return (
                            <div 
                                key={food.id} 
                                onClick={() => handleItemClick(food)}
                                className={`pos-food-card ${inCartQty > 0 ? 'in-cart' : ''}`}
                            >
                                <div className="pos-food-card-top">
                                    {/* Veg/Non-Veg Badge */}
                                    <div className="pos-food-badge-veg" title={food.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'}>
                                        <div style={{
                                            width: 14, height: 14,
                                            border: `2px solid ${food.is_veg !== false ? '#22c55e' : '#ef4444'}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            borderRadius: '3px', background: 'rgba(0,0,0,0.5)'
                                        }}>
                                            <div style={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                background: food.is_veg !== false ? '#22c55e' : '#ef4444'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Badges: In-Cart or Customizable */}
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {inCartQty > 0 && (
                                            <span className="pos-badge-incart">
                                                {inCartQty} in cart
                                            </span>
                                        )}
                                        {hasAddons && (
                                            <span className="pos-badge-customizable">
                                                CUSTOMIZE
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Food Name */}
                                <div className="pos-food-name" title={food.name}>
                                    {food.name}
                                </div>

                                {/* Bottom row: Price & Add button */}
                                <div className="pos-food-bottom-row">
                                    <div className="pos-food-price">₹{food.price}</div>
                                    <button 
                                        type="button" 
                                        className="pos-food-add-btn" 
                                        aria-label={`Add ${food.name}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleItemClick(food);
                                        }}
                                    >
                                        <Plus size={15} strokeWidth={3} />
                                    </button>
                                </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label className="pos-label" style={{ margin: 0 }}>Customer Mobile</label>
                                <span style={{ fontSize: '11px', color: customerPhone.length === 10 ? '#4ade80' : 'var(--text-muted)' }}>
                                    {customerPhone.length === 10 ? '✓ 10 digits' : `${customerPhone.length}/10 digits`}
                                </span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <Phone size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                                <input 
                                    id="pos-customer-phone"
                                    name="customer-phone"
                                    autoComplete="off"
                                    type="tel"
                                    inputMode="numeric"
                                    placeholder="Enter 10-digit mobile number" 
                                    value={customerPhone}
                                    onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                                    maxLength={10}
                                    className="pos-input"
                                    style={{ paddingLeft: '36px' }}
                                />
                                {customerPhone && (
                                    <button 
                                        type="button" 
                                        onClick={() => setCustomerPhone('')} 
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <label className="pos-label">Screen Number</label>
                                <div style={{ position: 'relative' }}>
                                    <Tv size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                                    <input 
                                        id="pos-screen-number"
                                        name="screen-number"
                                        autoComplete="off"
                                        type="text" 
                                        placeholder="e.g. Screen 1" 
                                        value={screenNumber}
                                        onChange={e => setScreenNumber(e.target.value)}
                                        className="pos-input"
                                        style={{ paddingLeft: '36px' }}
                                    />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="pos-label">Seat Number</label>
                                <div style={{ position: 'relative' }}>
                                    <Armchair size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                                    <input 
                                        id="pos-seat-number"
                                        name="seat-number"
                                        autoComplete="off"
                                        type="text" 
                                        placeholder="e.g. F9" 
                                        value={seatNumber}
                                        onChange={e => setSeatNumber(e.target.value)}
                                        className="pos-input"
                                        style={{ paddingLeft: '36px' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="pos-label">Payment Mode</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {[
                                    { id: 'Cash', label: 'Cash', icon: Banknote },
                                    { id: 'Online', label: 'UPI / Online', icon: Smartphone },
                                    { id: 'Card', label: 'Card', icon: CreditCard },
                                    { id: 'Split', label: 'Split', icon: Split }
                                ].map(({ id, label, icon: Icon }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => {
                                            setPaymentMode(id);
                                            if (id === 'Split') {
                                                setSplitCash('');
                                                setSplitUpi('');
                                                setSplitCollectedCash('');
                                            }
                                        }}
                                        style={{
                                            flex: 1, padding: '11px 6px', borderRadius: '12px', fontSize: '12px', fontWeight: 800,
                                            background: paymentMode === id ? 'linear-gradient(135deg, var(--primary-glow) 0%, #ff5252 100%)' : 'rgba(255,255,255,0.06)',
                                            color: paymentMode === id ? 'white' : 'var(--text-muted)',
                                            border: paymentMode === id ? '1px solid rgba(255,47,146,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <Icon size={14} />
                                        <span>{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMode === 'Cash' && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {/* Quick Cash Suggestions */}
                                <div style={{ marginBottom: '6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Quick Cash Options
                                </div>
                                <div className="pos-quick-cash-row">
                                    <button 
                                        type="button" 
                                        onClick={() => setCollectedCash(Math.ceil(total).toString())} 
                                        className="pos-quick-cash-btn"
                                        style={{ borderColor: 'var(--primary-glow)', color: 'var(--primary-glow)' }}
                                    >
                                        Exact ₹{Math.ceil(total)}
                                    </button>
                                    {[100, 200, 500, 1000, 2000].map(amt => (
                                        <button 
                                            key={amt} 
                                            type="button" 
                                            onClick={() => setCollectedCash(amt.toString())} 
                                            className="pos-quick-cash-btn"
                                        >
                                            ₹{amt}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="pos-label">Amount Collected (₹)</label>
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
                                        <label className="pos-label">Returned Amount</label>
                                        <div style={{ 
                                            width: '100%', padding: '8px 12px', 
                                            background: collectedCash && Number(collectedCash) >= total ? 'rgba(34, 197, 94, 0.12)' : 'rgba(0,0,0,0.4)', 
                                            border: collectedCash && Number(collectedCash) >= total ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255,255,255,0.15)', 
                                            borderRadius: '10px', 
                                            color: collectedCash && Number(collectedCash) >= total ? '#4ade80' : (collectedCash && Number(collectedCash) < total ? '#f59e0b' : 'var(--accent-gold)'), 
                                            fontSize: '16px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                            height: '46px', boxSizing: 'border-box' 
                                        }}>
                                            <span>
                                                ₹{collectedCash && Number(collectedCash) >= total ? (Number(collectedCash) - total).toFixed(2) : '0.00'}
                                            </span>
                                            {collectedCash && Number(collectedCash) >= total && (
                                                <span style={{ fontSize: '10px', color: '#4ade80', fontWeight: 800 }}>
                                                    CHANGE
                                                </span>
                                            )}
                                            {collectedCash && Number(collectedCash) < total && (
                                                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>
                                                    SHORT
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {paymentMode === 'Split' && (
                            <div style={{ 
                                background: 'rgba(255,255,255,0.04)', 
                                padding: '14px', 
                                borderRadius: '14px', 
                                border: '1px solid rgba(255,47,146,0.3)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                {/* Header & 50/50 Preset Button */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Split: Cash + UPI
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handle5050Split}
                                        className="pos-quick-cash-btn"
                                        style={{ borderColor: 'var(--primary-glow)', color: 'var(--primary-glow)', padding: '3px 8px', fontSize: '10px' }}
                                    >
                                        50 / 50 Split
                                    </button>
                                </div>

                                {/* Inputs for Cash and UPI */}
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="pos-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Banknote size={12} color="#4ade80" /> Cash (₹)
                                        </label>
                                        <input 
                                            type="number" 
                                            inputMode="decimal"
                                            placeholder="e.g. 200" 
                                            value={splitCash}
                                            onChange={e => handleSplitCashChange(e.target.value)}
                                            className="pos-input"
                                            style={{ borderColor: splitCash !== '' ? 'rgba(74, 222, 128, 0.5)' : undefined }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="pos-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Smartphone size={12} color="#00d2ff" /> UPI (₹)
                                        </label>
                                        <input 
                                            type="number" 
                                            inputMode="decimal"
                                            placeholder="e.g. 300" 
                                            value={splitUpi}
                                            onChange={e => handleSplitUpiChange(e.target.value)}
                                            className="pos-input"
                                            style={{ borderColor: splitUpi !== '' ? 'rgba(0, 210, 255, 0.5)' : undefined }}
                                        />
                                    </div>
                                </div>

                                {/* Real-time Summary Badge */}
                                <div style={{ 
                                    padding: '8px 10px', 
                                    borderRadius: '8px', 
                                    background: 'rgba(0,0,0,0.3)', 
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '11px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    {splitCash === '' && splitUpi === '' ? (
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            Type Cash or UPI — the other calculates automatically.
                                        </span>
                                    ) : Math.abs(((parseFloat(splitCash) || 0) + (parseFloat(splitUpi) || 0)) - total) <= 0.05 ? (
                                        <div style={{ color: '#4ade80', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <CheckCircle size={13} />
                                            <span>Balanced: ₹{total.toFixed(2)} (Cash ₹{(parseFloat(splitCash) || 0).toFixed(2)} + UPI ₹{(parseFloat(splitUpi) || 0).toFixed(2)})</span>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#f87171', fontWeight: 800 }}>
                                            ⚠ Mismatch: Split total ₹{((parseFloat(splitCash) || 0) + (parseFloat(splitUpi) || 0)).toFixed(2)} ≠ Total ₹{total.toFixed(2)}
                                        </div>
                                    )}
                                </div>

                                {/* Cash Tendered & Return Change Calculator for the Cash Portion */}
                                {parseFloat(splitCash) > 0 && (
                                    <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                                        <div style={{ marginBottom: '6px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                                            Quick Cash for Split Cash Portion (₹{parseFloat(splitCash).toFixed(2)})
                                        </div>
                                        <div className="pos-quick-cash-row">
                                            <button 
                                                type="button" 
                                                onClick={() => setSplitCollectedCash(Math.ceil(parseFloat(splitCash)).toString())} 
                                                className="pos-quick-cash-btn"
                                                style={{ borderColor: 'var(--primary-glow)', color: 'var(--primary-glow)' }}
                                            >
                                                Exact ₹{Math.ceil(parseFloat(splitCash))}
                                            </button>
                                            {[100, 200, 500, 1000, 2000].filter(amt => amt >= parseFloat(splitCash)).map(amt => (
                                                <button 
                                                    key={amt} 
                                                    type="button" 
                                                    onClick={() => setSplitCollectedCash(amt.toString())} 
                                                    className="pos-quick-cash-btn"
                                                >
                                                    ₹{amt}
                                                </button>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                            <div style={{ flex: 1 }}>
                                                <label className="pos-label">Tendered Cash (₹)</label>
                                                <input 
                                                    type="number" 
                                                    inputMode="decimal"
                                                    placeholder={`e.g. ${Math.ceil(parseFloat(splitCash))}`}
                                                    value={splitCollectedCash}
                                                    onChange={e => setSplitCollectedCash(e.target.value)}
                                                    className="pos-input"
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label className="pos-label">Change to Return</label>
                                                <div style={{ 
                                                    width: '100%', padding: '8px 12px', 
                                                    background: splitCollectedCash && Number(splitCollectedCash) >= parseFloat(splitCash) ? 'rgba(34, 197, 94, 0.12)' : 'rgba(0,0,0,0.4)', 
                                                    border: splitCollectedCash && Number(splitCollectedCash) >= parseFloat(splitCash) ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255,255,255,0.15)', 
                                                    borderRadius: '10px', 
                                                    color: splitCollectedCash && Number(splitCollectedCash) >= parseFloat(splitCash) ? '#4ade80' : (splitCollectedCash && Number(splitCollectedCash) < parseFloat(splitCash) ? '#f59e0b' : 'var(--accent-gold)'), 
                                                    fontSize: '15px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                                    height: '46px', boxSizing: 'border-box' 
                                                }}>
                                                    <span>
                                                        ₹{splitCollectedCash && Number(splitCollectedCash) >= parseFloat(splitCash) ? (Number(splitCollectedCash) - parseFloat(splitCash)).toFixed(2) : '0.00'}
                                                    </span>
                                                    {splitCollectedCash && Number(splitCollectedCash) >= parseFloat(splitCash) && (
                                                        <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 800 }}>
                                                            CHANGE
                                                        </span>
                                                    )}
                                                    {splitCollectedCash && Number(splitCollectedCash) < parseFloat(splitCash) && (
                                                        <span style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 700 }}>
                                                            SHORT
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
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

                    {isSplitMismatch && (
                        <div style={{ 
                            background: 'rgba(239, 68, 68, 0.15)', 
                            border: '1px solid rgba(239, 68, 68, 0.3)', 
                            borderRadius: '10px', 
                            padding: '8px 12px', 
                            marginBottom: '10px',
                            color: '#fca5a5', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            textAlign: 'center' 
                        }}>
                            {!isSplitBalanced 
                                ? `Split Cash (₹${numSplitCash.toFixed(2)}) + UPI (₹${numSplitUpi.toFixed(2)}) must equal ₹${total.toFixed(2)}`
                                : `Tendered cash (₹${parseFloat(splitCollectedCash)}) cannot be less than required cash portion (₹${numSplitCash.toFixed(2)})`
                            }
                        </div>
                    )}

                    <button 
                        onClick={handlePlaceOrder}
                        disabled={cart.length === 0 || placingOrder || isSplitMismatch}
                        style={{ 
                            width: '100%', 
                            padding: '16px', 
                            background: (cart.length === 0 || isSplitMismatch) ? 'rgba(255,255,255,0.1)' : 'var(--primary-glow)', 
                            color: (cart.length === 0 || isSplitMismatch) ? 'rgba(255,255,255,0.3)' : 'white', 
                            border: 'none', 
                            borderRadius: '14px', 
                            fontWeight: '900', 
                            fontSize: '16px',
                            cursor: (cart.length === 0 || placingOrder || isSplitMismatch) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: (cart.length > 0 && !isSplitMismatch) ? '0 4px 20px rgba(255, 47, 146, 0.4)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {placingOrder ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                        {placingOrder ? 'PLACING ORDER...' : (isSplitMismatch ? 'SPLIT AMOUNT MISMATCH' : 'PLACE ORDER')}
                    </button>
                </div>
            </div>

        </div>

        {/* Receipt / Billing Modal */}
        {showReceipt && lastOrder && (
            <div className="pos-billing-overlay no-print-bg">
                <div className="pos-billing-dialog">
                    {/* Header */}
                    <div className="pos-billing-header no-print">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div className="pos-pulse-dot" />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontWeight: 800, fontSize: '15px', color: '#fff', lineHeight: 1.2 }}>Order Placed!</div>
                                <div style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 700 }}>{lastOrder.display_id}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button 
                                type="button" 
                                onClick={handleNewOrder} 
                                className="pos-billing-close-btn" 
                                title="Close and Start New Order"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Action Bar (Print & New Order) */}
                    <div className="pos-billing-actions-row no-print">
                        {/* Tab Switcher */}
                        <div className="pos-receipt-tabs">
                            <button 
                                type="button"
                                onClick={() => setReceiptTab('customer')}
                                className={`pos-receipt-tab-btn ${receiptTab === 'customer' ? 'active' : ''}`}
                            >
                                Customer Bill
                            </button>
                            <button 
                                type="button"
                                onClick={() => setReceiptTab('kitchen')}
                                className={`pos-receipt-tab-btn ${receiptTab === 'kitchen' ? 'active' : ''}`}
                            >
                                Kitchen Token
                            </button>
                        </div>

                        {/* Fast Action Buttons */}
                        <div className="pos-billing-btn-group">
                            <button onClick={handlePrint} className="pos-billing-btn-print">
                                <Printer size={16} /> Print Bill
                            </button>
                            <button onClick={handleNewOrder} className="pos-billing-btn-next">
                                <RefreshCcw size={16} /> New Order
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Receipt Body */}
                    <div className="pos-billing-scroll-area">
                        {/* Printable Thermal Paper Slip */}
                        <div className="pos-thermal-slip">
                            {receiptTab === 'customer' ? (
                                <>
                                    {/* Customer Receipt Header */}
                                    <div style={{ textAlign: 'center', paddingBottom: '10px', borderBottom: '2px solid #000', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '1px', lineHeight: '1.1', textTransform: 'uppercase' }}>
                                            {lastOrder.metadata?.cinema_name || 'LOVE CAFE'}
                                        </div>
                                        <div style={{ fontSize: '11px', letterSpacing: '1.5px', marginTop: '3px', textTransform: 'uppercase', fontWeight: 700 }}>
                                            Customer Receipt
                                        </div>
                                        {lastOrder.metadata?.outlet_number && (
                                            <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '2px' }}>
                                                Outlet ID: {lastOrder.metadata.outlet_number}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '4px', background: '#000', color: '#fff', padding: '2px 8px', display: 'inline-block', borderRadius: '3px' }}>
                                            Order: {lastOrder.display_id}
                                        </div>
                                        <div style={{ fontSize: '11px', marginTop: '6px', color: '#444' }}>
                                            {new Date(lastOrder.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date(lastOrder.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, marginTop: '4px' }}>
                                            {lastOrder.location}
                                        </div>
                                        {lastOrder.customer_phone && (
                                            <div style={{ fontSize: '11px', color: '#333', marginTop: '2px' }}>
                                                Customer: +91 {lastOrder.customer_phone}
                                            </div>
                                        )}
                                    </div>

                                    {/* Items Table */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '10px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #000' }}>
                                                <th style={{ textAlign: 'left', padding: '4px 0', width: '38px', fontWeight: 800 }}>QTY</th>
                                                <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 800 }}>ITEM</th>
                                                <th style={{ textAlign: 'right', padding: '4px 0', width: '65px', fontWeight: 800 }}>PRICE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lastOrder.items.map((item: any, idx: number) => (
                                                <tr key={idx} style={{ borderBottom: '1px dashed #ddd' }}>
                                                    <td style={{ padding: '6px 0', verticalAlign: 'top', fontWeight: 800 }}>{item.quantity}x</td>
                                                    <td style={{ padding: '6px 0', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '12.5px' }}>
                                                            {item.is_combo && <span style={{ fontSize: '9px', background: '#000', color: '#fff', padding: '1px 3px', borderRadius: '2px', marginRight: '4px' }}>COMBO</span>}
                                                            {item.food_name}
                                                        </div>
                                                        {item.item_note && (
                                                            <div style={{ fontSize: '10px', color: '#555', fontStyle: 'italic', marginTop: '1px' }}>
                                                                📝 {item.item_note}
                                                            </div>
                                                        )}
                                                        {item.addons && item.addons.length > 0 && (
                                                            <div style={{ fontSize: '10px', color: '#444', marginTop: '2px' }}>
                                                                {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, i: number) => (
                                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px' }}>
                                                                        <span>+ {opt.name}</span>
                                                                        {opt.price > 0 && <span>₹{opt.price}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '6px 0', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>
                                                        ₹{(item.food_price * item.quantity).toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* Breakdown */}
                                    <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginBottom: '8px', fontSize: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                            <span>Subtotal</span>
                                            <span>₹{(lastOrder.metadata?.subtotal || (lastOrder.total_amount / 1.06)).toFixed(2)}</span>
                                        </div>
                                        {((lastOrder.metadata?.cgst || 0) > 0 || !lastOrder.metadata) && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span>CGST (2.5%)</span>
                                                <span>₹{(lastOrder.metadata?.cgst || ((lastOrder.total_amount / 1.06) * 0.025)).toFixed(2)}</span>
                                            </div>
                                        )}
                                        {((lastOrder.metadata?.sgst || 0) > 0 || !lastOrder.metadata) && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span>SGST (2.5%)</span>
                                                <span>₹{(lastOrder.metadata?.sgst || ((lastOrder.total_amount / 1.06) * 0.025)).toFixed(2)}</span>
                                            </div>
                                        )}
                                        {((lastOrder.metadata?.platform_charges || 0) > 0) && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span>Platform Fee</span>
                                                <span>₹{Number(lastOrder.metadata.platform_charges).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Total */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '18px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '6px 0', margin: '6px 0' }}>
                                        <span>TOTAL</span>
                                        <span>₹{lastOrder.total_amount.toFixed(2)}</span>
                                    </div>

                                    {/* Payment Info */}
                                    <div style={{ fontSize: '12px', marginTop: '6px', paddingTop: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                            <span>Payment Mode</span>
                                            <span style={{ fontWeight: 800 }}>
                                                {lastOrder.payment_method === 'POS_CASH' 
                                                    ? 'CASH' 
                                                    : (lastOrder.payment_method === 'POS_SPLIT' ? 'SPLIT (CASH + UPI)' : lastOrder.payment_method)}
                                            </span>
                                        </div>

                                        {lastOrder.payment_method === 'POS_SPLIT' && (
                                            <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', margin: '6px 0', border: '1px dashed #cbd5e1' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontWeight: 700 }}>
                                                    <span>💵 Cash Paid:</span>
                                                    <span>₹{Number(lastOrder.metadata?.split_cash || 0).toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                                    <span>📱 UPI Paid:</span>
                                                    <span>₹{Number(lastOrder.metadata?.split_upi || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {lastOrder.payment_method === 'POS_CASH' && lastOrder.collected_cash > 0 && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                    <span>Cash Collected</span>
                                                    <span>₹{Number(lastOrder.collected_cash).toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '13px', background: '#f0fdf4', padding: '3px 6px', borderRadius: '4px' }}>
                                                    <span>Change Returned</span>
                                                    <span>₹{Number(lastOrder.return_cash).toFixed(2)}</span>
                                                </div>
                                            </>
                                        )}

                                        {lastOrder.payment_method === 'POS_SPLIT' && lastOrder.collected_cash > (lastOrder.metadata?.split_cash || 0) && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                    <span>Cash Tendered</span>
                                                    <span>₹{Number(lastOrder.collected_cash).toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '13px', background: '#f0fdf4', padding: '3px 6px', borderRadius: '4px' }}>
                                                    <span>Change Returned</span>
                                                    <span>₹{Number(lastOrder.return_cash).toFixed(2)}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Footer note */}
                                    <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '10px', borderTop: '1px dashed #999', fontSize: '11px', color: '#555' }}>
                                        <div>Thank you for visiting!</div>
                                        <div style={{ fontWeight: 700, marginTop: '2px' }}>Please enjoy your movie 🎬</div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Kitchen Token Header */}
                                    <div style={{ textAlign: 'center', paddingBottom: '10px', borderBottom: '2px dashed #000', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' }}>
                                            KITCHEN TOKEN
                                        </div>
                                        <div style={{ fontSize: '18px', fontWeight: 900, marginTop: '4px', background: '#000', color: '#fff', padding: '3px 10px', display: 'inline-block', borderRadius: '4px' }}>
                                            Order: {lastOrder.display_id}
                                        </div>
                                        <div style={{ fontSize: '12px', marginTop: '6px', fontWeight: 700 }}>
                                            {new Date(lastOrder.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '4px', background: '#fef08a', padding: '2px 8px', display: 'inline-block' }}>
                                            {lastOrder.location}
                                        </div>
                                    </div>

                                    {/* Kitchen Items */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                        {lastOrder.items.map((item: any, idx: number) => (
                                            <div key={idx} style={{ borderBottom: '1px dashed #999', paddingBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                    <span style={{ fontSize: '18px', fontWeight: 900, minWidth: '32px' }}>{item.quantity}x</span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '16px', fontWeight: 800 }}>
                                                            {item.is_combo && <span style={{ fontSize: '10px', background: '#000', color: '#fff', padding: '1px 4px', borderRadius: '2px', marginRight: '4px' }}>COMBO</span>}
                                                            {item.food_name}
                                                        </div>
                                                        {item.item_note && (
                                                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginTop: '2px' }}>
                                                                ⚠️ Note: {item.item_note}
                                                            </div>
                                                        )}
                                                        {item.addons && item.addons.length > 0 && (
                                                            <div style={{ fontSize: '12px', marginTop: '2px', paddingLeft: '8px', borderLeft: '2px solid #000' }}>
                                                                {item.addons.flatMap((a: any) => a.selectedOptions).map((opt: any, i: number) => (
                                                                    <div key={i} style={{ fontWeight: 600 }}>+ {opt.name}</div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ textAlign: 'center', fontSize: '11px', color: '#666', borderTop: '1px dashed #999', paddingTop: '6px' }}>
                                        Staff: {lastOrder.metadata?.staff_email || 'POS Terminal'}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Bottom Sticky Action Bar */}
                    <div className="pos-billing-footer no-print">
                        <button onClick={handlePrint} className="pos-footer-btn-print">
                            <Printer size={18} /> Print Bill
                        </button>
                        <button onClick={handleNewOrder} className="pos-footer-btn-next">
                            <ArrowRight size={18} /> Next Order
                        </button>
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

        {/* Mobile Floating Order Bar (When cart has items) */}
        {cart.length > 0 && (
          <div 
            className="pos-mobile-cart-bar"
            onClick={() => setIsMobileCartOpen(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="pos-cart-bar-badge">
                <ShoppingCart size={18} />
                <span>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'white', lineHeight: '1.2' }}>
                  {cart.length} {cart.length === 1 ? 'item' : 'items'} in order
                </div>
                <div style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 800 }}>
                  ₹{total.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="pos-cart-bar-action">
              <span>VIEW ORDER</span>
              <ArrowRight size={16} />
            </div>
          </div>
        )}

        {/* Circular Floating Cart Button (when cart is empty or on tablet) */}
        {cart.length === 0 && (
          <button 
            className="mobile-cart-toggle" 
            onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
            aria-label="Open cart"
          >
            <ShoppingCart size={24} />
          </button>
        )}
    </div>
    </>
  );
}
