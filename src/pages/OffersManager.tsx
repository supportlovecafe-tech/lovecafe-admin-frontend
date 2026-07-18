import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Tag, Search, Trash2, Edit2, CheckCircle, X, ToggleLeft, ToggleRight, Loader2, Sparkles, Percent, DollarSign, HelpCircle, AlertCircle, Image as ImageIcon, Upload, Camera } from 'lucide-react';
import { Database } from '../lib/database.types';

type Offer = Database['public']['Tables']['offers']['Row'] & {
  offer_items?: { food_item_id: string; custom_price?: number | null }[];
};
type FoodItem = Database['public']['Tables']['food_items']['Row'];

interface OfferFormData {
  category: string;
  title: string;
  description: string;
  discountPercentage: string;
  flatDiscountAmount: string;
  promoPrice: string;
  buyQuantity: number;
  getQuantity: number;
  isActive: boolean;
  selectedItemIds: string[];
  customPrices: Record<string, string>;
  posterUrl: string;  // banner_url stored here
}

export default function OffersManager({ user }: { user: any }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mapSearchTerm, setMapSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal / Drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // We generate a temp UUID for new offers so we can name the poster file deterministically
  const [tempOfferId, setTempOfferId] = useState<string>(() => crypto.randomUUID());
  
  const [formData, setFormData] = useState<OfferFormData>({
    category: 'BUY_1_GET_1',
    title: '',
    description: '',
    discountPercentage: '',
    flatDiscountAmount: '',
    promoPrice: '',
    buyQuantity: 1,
    getQuantity: 1,
    isActive: true,
    selectedItemIds: [],
    customPrices: {},
    posterUrl: ''
  });

  const offerCategories = [
    { value: 'BUY_1_GET_1', label: 'Buy 1 Get 1 Free 🎁', buy: 1, get: 1 },
    { value: 'BUY_1_GET_2', label: 'Buy 1 Get 2 Free 🎁', buy: 1, get: 2 },
    { value: 'BUY_2_GET_1', label: 'Buy 2 Get 1 Free 🎁', buy: 2, get: 1 },
    { value: 'OFFER_OF_THE_DAY', label: 'Offer of the Day 🌟' },
    { value: 'OFFER_OF_THE_WEEK', label: 'Offer of the Week 📅' },
    { value: 'OFFER_OF_THE_FESTIVAL', label: 'Offer of the Festival 🎉' },
    { value: 'FLAT_DISCOUNT', label: 'Flat Discount 🏷️' },
    { value: 'OFFER_OF_THE_FILM', label: 'Offer of the Film 🎬' },
    { value: 'UNLIMITED', label: 'Unlimited Refills 🔄' },
  ];

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch offers and join items
      let offersQuery = supabase
        .from('offers')
        .select('*, offer_items(food_item_id, custom_price)')
        .order('created_at', { ascending: false });

      if (user?.role === 'OUTLET_MANAGER' && user?.cinema_id) {
        offersQuery = offersQuery.eq('cinema_id', user.cinema_id);
      }

      const { data: offersData, error: offersError } = await offersQuery;
      if (offersError) throw offersError;

      // 2. Fetch food items for binding
      let foodQuery = supabase
        .from('food_items')
        .select('*')
        .order('category', { ascending: true });

      if (user?.role === 'OUTLET_MANAGER' && user?.cinema_id) {
        foodQuery = foodQuery.eq('cinema_id', user.cinema_id);
      }

      const { data: foodData, error: foodError } = await foodQuery;
      if (foodError) throw foodError;

      // Filter available foods in memory to handle NULL values (which default to available)
      const availableFoods = (foodData as FoodItem[] || []).filter(item => item.is_available !== false);

      setOffers(offersData as Offer[] || []);
      setFoodItems(availableFoods);
    } catch (e) {
      console.error("Error loading offers data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (offer: Offer) => {
    const nextState = !offer.is_active;
    
    // Optimistic UI update
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, is_active: nextState } : o));

    try {
      const { error } = await supabase
        .from('offers')
        .update({ is_active: nextState })
        .eq('id', offer.id);

      if (error) throw error;
    } catch (e) {
      console.error("Failed to toggle offer status:", e);
      // Revert on failure
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, is_active: !nextState } : o));
    }
  };

  const handleDeleteOffer = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this offer? This will instantly disable it for all customers.")) return;

    try {
      const { error } = await supabase
        .from('offers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setOffers(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      console.error("Error deleting offer:", e);
    }
  };

  const handleCategoryChange = (catVal: string) => {
    const selectedCat = offerCategories.find(c => c.value === catVal);
    setFormData(prev => ({
      ...prev,
      category: catVal,
      buyQuantity: selectedCat?.buy || 1,
      getQuantity: selectedCat?.get || 1,
      // Clear fields to avoid wrong values
      discountPercentage: '',
      flatDiscountAmount: '',
      promoPrice: ''
    }));
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setTempOfferId(crypto.randomUUID()); // fresh ID for new offer poster path
    setUploadError(null);
    setFormData({
      category: 'BUY_1_GET_1',
      title: '',
      description: '',
      discountPercentage: '',
      flatDiscountAmount: '',
      promoPrice: '',
      buyQuantity: 1,
      getQuantity: 1,
      isActive: true,
      selectedItemIds: [],
      customPrices: {},
      posterUrl: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (offer: Offer) => {
    setEditingId(offer.id);
    setUploadError(null);
    const itemIds = offer.offer_items?.map(oi => oi.food_item_id) || [];
    const customPrices: Record<string, string> = {};
    offer.offer_items?.forEach((oi: any) => {
      if (oi.custom_price !== undefined && oi.custom_price !== null) {
        customPrices[oi.food_item_id] = oi.custom_price.toString();
      }
    });
    setFormData({
      category: offer.category,
      title: offer.title,
      description: offer.description || '',
      discountPercentage: offer.discount_percentage ? offer.discount_percentage.toString() : '',
      flatDiscountAmount: offer.flat_discount_amount ? offer.flat_discount_amount.toString() : '',
      promoPrice: offer.promo_price ? offer.promo_price.toString() : '',
      buyQuantity: offer.buy_quantity || 1,
      getQuantity: offer.get_quantity || 1,
      isActive: offer.is_active ?? true,
      selectedItemIds: itemIds,
      customPrices,
      posterUrl: offer.banner_url || ''
    });
    setIsModalOpen(true);
  };

  // ─── Poster Upload ────────────────────────────────────────────────
  // Uses a deterministic path: offers/<cinema_id>/<offer_id>.<ext>
  // upsert: true means re-uploading replaces the old file automatically.
  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const offerId = editingId || tempOfferId;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cinemaId = user?.cinema_id || 'global';
      const storagePath = `offers/${cinemaId}/${offerId}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('images')
        .upload(storagePath, file, { cacheControl: '0', upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('images').getPublicUrl(storagePath);
      // Append a cache-bust query param so the new image loads immediately
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      setFormData(prev => ({ ...prev, posterUrl: publicUrl }));

      // If editing an existing offer, persist banner_url to DB immediately
      if (editingId) {
        await supabase.from('offers').update({ banner_url: publicUrl }).eq('id', editingId);
      }
    } catch (err: any) {
      console.error('Poster upload error:', err);
      setUploadError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Poster Delete ────────────────────────────────────────────────
  // Removes the file from Supabase Storage and clears banner_url in the offers row.
  const handleDeletePoster = async () => {
    if (!formData.posterUrl) return;
    setUploading(true);
    setUploadError(null);

    try {
      // Extract the storage path from the public URL
      // URL format: https://<project>.supabase.co/storage/v1/object/public/images/offers/<cin>/<id>.ext
      const url = new URL(formData.posterUrl.split('?')[0]);
      const pathParts = url.pathname.split('/public/images/');
      if (pathParts.length >= 2) {
        const storagePath = pathParts[1];
        await supabase.storage.from('images').remove([storagePath]);
      }

      setFormData(prev => ({ ...prev, posterUrl: '' }));

      // If editing an existing offer, clear banner_url in DB immediately
      if (editingId) {
        await supabase.from('offers').update({ banner_url: null }).eq('id', editingId);
        setOffers(prev => prev.map(o => o.id === editingId ? { ...o, banner_url: null } : o));
      }
    } catch (err: any) {
      console.error('Poster delete error:', err);
      setUploadError('Delete failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };


  const handleToggleItemSelection = (itemId: string) => {
    setFormData(prev => {
      const isSelected = prev.selectedItemIds.includes(itemId);
      const nextIds = isSelected 
        ? prev.selectedItemIds.filter(id => id !== itemId)
        : [...prev.selectedItemIds, itemId];
      return { ...prev, selectedItemIds: nextIds };
    });
  };

  const handleSelectAllItems = () => {
    setFormData(prev => {
      const allIds = foodItems.map(f => f.id);
      const isAllSelected = prev.selectedItemIds.length === allIds.length;
      return {
        ...prev,
        selectedItemIds: isAllSelected ? [] : allIds
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return alert("Please enter an offer title.");
    if (formData.selectedItemIds.length === 0) return alert("Please map at least one menu item to this offer!");

    setSaving(true);
    try {
      const offerPayload = {
        cinema_id: user.cinema_id,
        category: formData.category,
        title: formData.title,
        description: formData.description,
        is_active: formData.isActive,
        discount_percentage: formData.discountPercentage ? parseFloat(formData.discountPercentage) : 0,
        flat_discount_amount: formData.flatDiscountAmount ? parseFloat(formData.flatDiscountAmount) : 0,
        promo_price: formData.promoPrice ? parseFloat(formData.promoPrice) : null,
        buy_quantity: formData.buyQuantity,
        get_quantity: formData.getQuantity,
        banner_url: formData.posterUrl || null,
        updated_at: new Date().toISOString()
      };

      let offerId = editingId;

      if (editingId) {
        // Update offer
        const { error: updateErr } = await supabase
          .from('offers')
          .update(offerPayload)
          .eq('id', editingId);
        
        if (updateErr) throw updateErr;
      } else {
        // Insert offer — use the temp UUID we generated upfront so any uploaded
        // poster is already saved at the correct storage path.
        const newId = tempOfferId;
        const { error: insertErr } = await supabase
          .from('offers')
          .insert([{ ...offerPayload, id: newId }])
          .select()
          .single();
        
        if (insertErr) {
          // Fallback: insert without explicit ID if UUID conflicts
          const { data: newOffer, error: insertErr2 } = await supabase
            .from('offers')
            .insert([offerPayload])
            .select()
            .single();
          if (insertErr2) throw insertErr2;
          offerId = newOffer.id;
        } else {
          offerId = newId;
        }
      }

      // Update mapping junctions in offer_items table
      // First delete existing maps
      const { error: deleteErr } = await supabase
        .from('offer_items')
        .delete()
        .eq('offer_id', offerId!);
      
      if (deleteErr) throw deleteErr;

      // Insert new maps
      if (formData.selectedItemIds.length > 0) {
        const mappings = formData.selectedItemIds.map(itemId => {
          const customPriceStr = formData.customPrices[itemId];
          const customPrice = (customPriceStr && !isNaN(parseFloat(customPriceStr)))
            ? parseFloat(customPriceStr)
            : null;
          
          return {
            offer_id: offerId!,
            food_item_id: itemId,
            custom_price: customPrice
          };
        });

        const { error: mapErr } = await supabase
          .from('offer_items')
          .insert(mappings);

        if (mapErr) throw mapErr;
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error("Failed to save offer:", err);
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredOffers = offers.filter(o => 
    o.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (o.description || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', height: 'calc(100vh - 120px)', padding: '40px', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sparkles className="animate-pulse" size={30} style={{ color: 'var(--primary-glow)' }} />
            Promos & Offers
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Configure premium, real-time outlet promotions, BOGOs, and refill discounts.
          </p>
        </div>

        <button 
          onClick={handleOpenCreate}
          className="btn-lucrative"
        >
          <Plus size={18} /> CREATE NEW PROMO
        </button>
      </div>

      {/* Search and Filters */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search campaigns by name, category, or description..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-premium"
            style={{ paddingLeft: '48px' }}
          />
        </div>
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', itemsAlign: 'center', justifyContent: 'center', padding: '60px' }}>
          <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 12px', color: 'var(--primary-glow)' }} />
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Fetching promotions and offers catalog...</p>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', border: '1px dashed var(--glass-border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
          <AlertCircle size={40} style={{ marginBottom: '12px', margin: '0 auto 12px', color: 'var(--primary-glow)' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>No promotion campaigns set</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto' }}>
            Introduce special BOGO discounts, flat off coupon products, or custom priced refills to boost outlet sales!
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {filteredOffers.map((offer) => {
            const itemCount = offer.offer_items?.length || 0;
            const categoryObj = offerCategories.find(c => c.value === offer.category);
            
            return (
              <div key={offer.id} 
                className="glass-card hover-card" 
                style={{ 
                  padding: '0', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  minHeight: '320px', 
                  position: 'relative', 
                  overflow: 'hidden',
                  borderColor: offer.is_active ? 'rgba(255,47,146,0.25)' : 'var(--glass-border)',
                  opacity: offer.is_active ? 1 : 0.6
                }}
              >
                {/* Poster Image or Gradient Background */}
                {offer.banner_url ? (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '110px', overflow: 'hidden' }}>
                    <img 
                      src={offer.banner_url} 
                      alt={offer.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px', background: 'linear-gradient(to top, rgba(10,10,15,0.95), transparent)' }} />
                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                      <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.85)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', backdropFilter: 'blur(4px)' }}>📸 POSTER</span>
                    </div>
                  </div>
                ) : (
                  offer.is_active && (
                    <div style={{
                      position: 'absolute', top: 0, right: 0, width: '120px', height: '120px',
                      background: 'radial-gradient(circle, rgba(255,47,146,0.08) 0%, transparent 70%)',
                      pointerEvents: 'none'
                    }} />
                  )
                )}

                <div style={{ padding: '24px', paddingTop: offer.banner_url ? '120px' : '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className={`badge ${
                      offer.category.startsWith('BUY_') ? 'badge-pink' : 
                      offer.category === 'UNLIMITED' ? 'badge-blue' : 'badge-gold'
                    }`}>
                      {categoryObj?.label.split(' ').pop() || '🎁'} {offer.category.replaceAll('_', ' ')}
                    </span>
                    <label className="toggle-switch" title={offer.is_active ? "Deactivate Promo" : "Activate Promo"}>
                      <input 
                        type="checkbox" 
                        checked={offer.is_active} 
                        onChange={() => handleToggleActive(offer)} 
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {offer.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '54px' }}>
                    {offer.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Promo Value</span>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary-glow)' }}>
                      {offer.category.startsWith('BUY_') && `Buy ${offer.buy_quantity} Get ${offer.get_quantity} Free`}
                      {offer.category === 'UNLIMITED' && `₹${offer.promo_price} Refill`}
                      {offer.category === 'FLAT_DISCOUNT' && `₹${offer.flat_discount_amount} OFF`}
                      {!offer.category.startsWith('BUY_') && offer.category !== 'UNLIMITED' && offer.category !== 'FLAT_DISCOUNT' && (
                        offer.discount_percentage ? `${offer.discount_percentage}% OFF` : 
                        offer.promo_price ? `₹${offer.promo_price} Special` : 
                        offer.flat_discount_amount ? `₹${offer.flat_discount_amount} OFF` : 'N/A'
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Mapped: <strong style={{ color: 'white' }}>{itemCount} items</strong>
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleOpenEdit(offer)}
                        className="btn-ghost"
                        style={{ padding: '6px 10px', borderRadius: '8px' }}
                        title="Edit Offer"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDeleteOffer(offer.id)}
                        className="btn-ghost"
                        style={{ padding: '6px 10px', borderRadius: '8px', borderColor: 'rgba(248,113,113,0.2)', color: 'var(--error)' }}
                        title="Delete Offer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ 
            padding: '32px', 
            width: '90%', 
            maxWidth: '850px', 
            background: 'var(--surface-mid)', 
            maxHeight: '90vh', 
            overflowY: 'auto',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '24px' 
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Percent size={22} style={{ color: 'var(--primary-glow)' }} />
                {editingId ? 'Edit Promotion Campaign' : 'Create Promotion Campaign'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost"
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              
              {/* Left Side: Campaign Config */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '300px' }}>
                <div className="form-group">
                  <label className="form-label">Offer Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="input-premium"
                    style={{ appearance: 'none' }}
                  >
                    {offerCategories.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Campaign Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Summer Special BOGO Popcorn"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="input-premium"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Campaign Description</label>
                  <textarea 
                    rows={2}
                    placeholder="e.g., Buy 1 Large Caramel Popcorn and get another 1 completely free at checkout."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="input-premium"
                    style={{ resize: 'none' }}
                  />
                </div>

                {/* ── Offer Poster Upload ─────────────────────────────── */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Camera size={13} /> Offer Poster / Banner
                  </label>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                    Shown as a full-bleed card in the customer app homepage. Recommended: 3:1 ratio, under 2MB.
                  </p>

                  <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {uploading ? (
                      <div style={{ textAlign: 'center', padding: '24px' }}>
                        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary-glow)', marginBottom: '8px' }} />
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Uploading poster...</div>
                      </div>
                    ) : formData.posterUrl ? (
                      <>
                        <img
                          src={formData.posterUrl}
                          alt="Offer poster preview"
                          style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        {/* Hover overlay with Replace / Remove */}
                        <div
                          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)')}
                        >
                          <label style={{ cursor: 'pointer', background: 'var(--primary-glow)', color: 'white', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Upload size={13} /> Replace
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePosterUpload} style={{ display: 'none' }} />
                          </label>
                          <button
                            type="button"
                            onClick={handleDeletePoster}
                            style={{ background: 'rgba(244,67,54,0.9)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <label style={{ cursor: 'pointer', width: '100%', height: '100%', minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '24px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,47,146,0.08)', border: '1px solid rgba(255,47,146,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Upload size={20} style={{ color: 'var(--primary-glow)' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>Upload Offer Poster</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Click to browse · PNG, JPG, WEBP</div>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePosterUpload} style={{ display: 'none' }} />
                      </label>
                    )}
                  </div>

                  {uploadError && (
                    <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={11} /> {uploadError}
                    </div>
                  )}
                </div>
                {/* ─────────────────────────────────────────────────────── */}

                {/* Conditional Fields depending on Category */}
                {formData.category !== 'UNLIMITED' && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary-glow)', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Campaign Values
                    </h4>
                    
                    {/* Buy X Get Y */}
                    {formData.category.startsWith('BUY_') && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="form-group">
                          <label className="form-label">Buy Quantity</label>
                          <input 
                            type="number" 
                            value={formData.buyQuantity}
                            disabled={formData.category === 'BUY_1_GET_1' || formData.category === 'BUY_1_GET_2' || formData.category === 'BUY_2_GET_1'}
                            onChange={(e) => setFormData(prev => ({ ...prev, buyQuantity: parseInt(e.target.value) || 1 }))}
                            className="input-premium"
                            style={{ opacity: formData.category.startsWith('BUY_') ? 0.7 : 1 }}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Get Free Quantity</label>
                          <input 
                            type="number" 
                            value={formData.getQuantity}
                            disabled={formData.category === 'BUY_1_GET_1' || formData.category === 'BUY_1_GET_2' || formData.category === 'BUY_2_GET_1'}
                            onChange={(e) => setFormData(prev => ({ ...prev, getQuantity: parseInt(e.target.value) || 1 }))}
                            className="input-premium"
                            style={{ opacity: formData.category.startsWith('BUY_') ? 0.7 : 1 }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Flat Discount */}
                    {formData.category === 'FLAT_DISCOUNT' && (
                      <div className="form-group">
                        <label className="form-label">Flat Discount Amount (₹)</label>
                        <input 
                          type="number" 
                          placeholder="50"
                          value={formData.flatDiscountAmount}
                          onChange={(e) => setFormData(prev => ({ ...prev, flatDiscountAmount: e.target.value }))}
                          className="input-premium"
                        />
                      </div>
                    )}

                    {/* Offers of Day / Week / Festival / Film (Custom Configurations) */}
                    {!formData.category.startsWith('BUY_') && formData.category !== 'UNLIMITED' && formData.category !== 'FLAT_DISCOUNT' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Configure one of these parameters as the value trigger:
                        </p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '10px' }}>Discount %</label>
                            <input 
                              type="number" 
                              placeholder="15"
                              value={formData.discountPercentage}
                              onChange={(e) => setFormData(prev => ({ ...prev, discountPercentage: e.target.value, flatDiscountAmount: '', promoPrice: '' }))}
                              className="input-premium"
                              style={{ padding: '10px 12px', fontSize: '13px' }}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '10px' }}>Flat OFF (₹)</label>
                            <input 
                              type="number" 
                              placeholder="50"
                              value={formData.flatDiscountAmount}
                              onChange={(e) => setFormData(prev => ({ ...prev, flatDiscountAmount: e.target.value, discountPercentage: '', promoPrice: '' }))}
                              className="input-premium"
                              style={{ padding: '10px 12px', fontSize: '13px' }}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '10px' }}>Promo Price (₹)</label>
                            <input 
                              type="number" 
                              placeholder="199"
                              value={formData.promoPrice}
                              onChange={(e) => setFormData(prev => ({ ...prev, promoPrice: e.target.value, discountPercentage: '', flatDiscountAmount: '' }))}
                              className="input-premium"
                              style={{ padding: '10px 12px', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side: Map Products (Checkbox list) */}
              <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Map Menu Items</label>
                  <button 
                    type="button" 
                    onClick={handleSelectAllItems}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-glow)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    {formData.selectedItemIds.length === foodItems.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                  Check the boxes of all catalog products participating in this offer.
                </p>

                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search menu items..." 
                    value={mapSearchTerm}
                    onChange={(e) => setMapSearchTerm(e.target.value)}
                    className="input-premium"
                    style={{ paddingLeft: '36px', paddingRight: '12px', paddingBottom: '8px', paddingTop: '8px', fontSize: '13px', minHeight: '36px' }}
                  />
                </div>

                <div style={{ 
                  height: '320px', 
                  overflowY: 'auto', 
                  border: '1px solid var(--glass-border)', 
                  borderRadius: '16px', 
                  padding: '16px', 
                  background: 'rgba(255,255,255,0.01)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '10px' 
                }}>
                  {foodItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No items found. Create some in Menu Editor!
                    </div>
                  ) : (
                    foodItems.filter(item => item.name.toLowerCase().includes(mapSearchTerm.toLowerCase())).map(item => {
                      const isChecked = formData.selectedItemIds.includes(item.id);
                      return (
                        <div 
                          key={item.id} 
                          onClick={() => handleToggleItemSelection(item.id)}
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            gap: '8px', 
                            padding: '10px 14px', 
                            borderRadius: '12px', 
                            border: '1px solid var(--glass-border)', 
                            cursor: 'pointer', 
                            background: isChecked ? 'rgba(255,47,146,0.06)' : 'rgba(255,255,255,0.01)',
                            borderColor: isChecked ? 'var(--primary-glow)' : 'var(--glass-border)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div style={{ 
                              width: '18px', 
                              height: '18px', 
                              borderRadius: '6px', 
                              border: '1px solid var(--glass-border)', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              background: isChecked ? 'var(--primary-glow)' : 'transparent',
                              borderColor: isChecked ? 'var(--primary-glow)' : 'var(--glass-border)',
                            }}>
                              {isChecked && <CheckCircle size={12} style={{ color: 'white' }} />}
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <span>{item.category}</span>
                                <span style={{ fontWeight: 'bold', color: 'var(--accent-gold)' }}>₹{item.price}</span>
                              </div>
                            </div>
                          </div>

                          {isChecked && (formData.category === 'UNLIMITED' || formData.category === 'OFFER_OF_THE_DAY' || formData.category === 'OFFER_OF_THE_WEEK' || formData.category === 'OFFER_OF_THE_FESTIVAL' || formData.category === 'OFFER_OF_THE_FILM') && (
                            <div 
                              onClick={(e) => e.stopPropagation()} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                width: '100%', 
                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                paddingTop: '8px',
                                marginTop: '4px'
                              }}
                            >
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Special Price (₹):</span>
                              <input 
                                type="number" 
                                placeholder={formData.promoPrice || "Custom price"}
                                value={formData.customPrices[item.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormData(prev => ({
                                    ...prev,
                                    customPrices: {
                                      ...prev.customPrices,
                                      [item.id]: val
                                    }
                                  }));
                                }}
                                className="input-premium"
                                style={{ 
                                  flex: 1, 
                                  height: '28px', 
                                  padding: '4px 8px', 
                                  fontSize: '12px', 
                                  borderRadius: '6px', 
                                  background: 'rgba(0,0,0,0.2)' 
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost"
                style={{ padding: '12px 24px' }}
              >
                CANCEL
              </button>
              
              <button 
                type="submit" 
                onClick={handleSubmit}
                disabled={saving}
                className="btn-lucrative"
                style={{ padding: '12px 24px' }}
              >
                {saving ? 'SAVING...' : editingId ? 'UPDATE CAMPAIGN' : 'SAVE CAMPAIGN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
