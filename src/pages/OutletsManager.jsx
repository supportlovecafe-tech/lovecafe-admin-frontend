import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, MapPin, Film, Star, Edit2, Trash2, Image as ImageIcon, Save, X, Search, Upload, Loader2 } from 'lucide-react';

export default function OutletsManager() {
  const [cinemas, setCinemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State (Side Panel)
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    location: '', 
    feature: '', 
    imageUrl: '',
    screenCount: '', // Changed to string to handle empty/null easily in UI
    loginEmail: '',
    outletNumber: ''
  });

  useEffect(() => {
    fetchCinemas();
  }, []);

  const fetchCinemas = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('cinemas').select('*, screens(*)').order('created_at', { ascending: false });
      if (data) setCinemas(data);
    } catch (e) {
      console.error("Failed to fetch cinemas:", e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', location: '', feature: '', imageUrl: '', screenCount: '', loginEmail: '', outletNumber: '' });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleOpenEdit = (cinema) => {
    setFormData({
        name: cinema.name,
        location: cinema.location,
        feature: cinema.feature || '',
        imageUrl: cinema.image_url || '',
        screenCount: cinema.screens?.length?.toString() || '0',
        loginEmail: cinema.login_email || '',
        outletNumber: cinema.outlet_number || ''
    });
    setIsEditing(true);
    setCurrentId(cinema.id);
  };

  const handleFileUpload = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `cinemas/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
            cacheControl: '0',
            upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      console.log('Successfully uploaded outlet image. Public URL:', publicUrl);
      setFormData(prev => ({ ...prev, imageUrl: publicUrl }));
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure? All screens and data for this outlet will be deleted.")) return;
    setLoading(true);
    
    // First, delete any profiles (like outlet managers) associated with this cinema
    // to satisfy the foreign key constraint: profiles_cinema_id_fkey
    await supabase.from('profiles').delete().eq('cinema_id', id);
    
    const { error } = await supabase.from('cinemas').delete().eq('id', id);
    if (error) alert("Error: " + error.message);
    fetchCinemas();
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Parse screenCount: treat empty as 0
    const targetCount = formData.screenCount === '' ? 0 : parseInt(formData.screenCount);
    
    if (isEditing) {
        const { error } = await supabase.from('cinemas').update({ 
            name: formData.name, location: formData.location, feature: formData.feature, image_url: formData.imageUrl,
            login_email: formData.loginEmail || null, outlet_number: formData.outletNumber || null
        }).eq('id', currentId);
        
        if (error) alert(error.message);
        else {
            // Sync screens based on count
            const { data: existingScreens } = await supabase.from('screens').select('id').eq('cinema_id', currentId).order('name');
            const currentCount = existingScreens?.length || 0;
            
            if (targetCount > currentCount) {
                const newScreens = Array.from({ length: targetCount - currentCount }, (_, i) => ({
                    cinema_id: currentId, name: `Screen ${currentCount + i + 1}`, tag: i === 0 && currentCount === 0 ? 'IMAX' : 'Standard'
                }));
                await supabase.from('screens').insert(newScreens);
            } else if (targetCount < currentCount) {
                const screensToRemove = existingScreens.slice(targetCount).map(s => s.id);
                if (screensToRemove.length > 0) {
                  await supabase.from('screens').delete().in('id', screensToRemove);
                }
            }
        }
    } else {
        // Limit check: maximum 5 outlets
        if (cinemas.length >= 5) {
            alert("Trial Limit Reached: You can create a maximum of 5 outlets. Please remove an existing outlet or contact support to upgrade.");
            setLoading(false);
            return;
        }

        const { data: cinema, error: cinemaErr } = await supabase.from('cinemas').insert([{ 
            name: formData.name, location: formData.location, feature: formData.feature, image_url: formData.imageUrl,
            login_email: formData.loginEmail || null, outlet_number: formData.outletNumber || null
        }]).select().single();

        if (cinemaErr) alert(cinemaErr.message);
        else if (targetCount > 0) {
            const screens = Array.from({ length: targetCount }, (_, i) => ({
                cinema_id: cinema.id, name: `Screen ${i + 1}`, tag: i === 0 ? 'IMAX' : 'Gold'
            }));
            await supabase.from('screens').insert(screens);
        }
    }
    resetForm();
    fetchCinemas();
    setLoading(false);
  };

  const filteredCinemas = cinemas.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: 'calc(100vh - 120px)' }}>
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>Cinema Network</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Expand and monitor your global cinematic footprint.</p>
        </div>
      </header>

      <div className="dashboard-grid" style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
        
        {/* Left: Search & Cards */}
        <div style={{ flex: 1.8, display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
               <Search size={20} color="rgba(255,255,255,0.2)" />
               <input 
                  type="text" 
                  placeholder="Search by outlet name or location..." 
                  style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, fontSize: '14px', outline: 'none' }}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                    {filteredCinemas.map(cinema => (
                        <div key={cinema.id} className="glass-card hover-card" style={{ overflow: 'hidden' }}>
                            <div style={{ height: '160px', position: 'relative', background: 'var(--surface-container-high)' }}>
                                <img 
                                  src={cinema.image_url ? cinema.image_url : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400'} 
                                  alt={cinema.name} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                  onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400'; }}
                                />
                                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleOpenEdit(cinema)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(cinema.id)} style={{ background: 'rgba(211,47,47,0.6)', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <div style={{ padding: '20px' }}>
                                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{cinema.name}</h3>
                                {cinema.outlet_number && (
                                    <div style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 'bold', marginTop: '2px' }}>
                                        Outlet #{cinema.outlet_number}
                                    </div>
                                )}
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                    <MapPin size={14} /> {cinema.location}
                                </div>
                                {cinema.login_email && (
                                    <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.25)', marginBottom: '6px', fontWeight: '800' }}>Outlet Login</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{cinema.login_email}</div>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>{cinema.screens?.length || 0} Screens</span>
                                    {cinema.feature && <span style={{ background: 'rgba(255,47,146,0.1)', color: 'var(--primary-red)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>{cinema.feature}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Right: Detailed Form */}
        <div style={{ width: '380px' }}>
            <div className="glass-card animate-fade-in" style={{ padding: '32px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.5px' }}>{isEditing ? 'Update Branch' : 'Deploy Outlet'}</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{isEditing ? 'Modifying existing node' : 'Initialize a new cinematic node'}</p>
                    </div>
                    {!isEditing && (
                        <div style={{ 
                            background: cinemas.length >= 5 ? 'rgba(255,60,60,0.1)' : 'rgba(255,255,255,0.05)', 
                            padding: '4px 10px', 
                            borderRadius: '8px', 
                            fontSize: '11px', 
                            fontWeight: '800',
                            color: cinemas.length >= 5 ? '#ff6b6b' : 'var(--text-secondary)',
                            border: cinemas.length >= 5 ? '1px solid rgba(255,60,60,0.2)' : '1px solid rgba(255,255,255,0.1)'
                        }}>
                            {cinemas.length}/5 Used
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Identity</label>
                            <input className="input-premium" placeholder="Outlet Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Outlet #</label>
                            <input className="input-premium" placeholder="e.g. 101" value={formData.outletNumber} onChange={e => setFormData({...formData, outletNumber: e.target.value})} />
                        </div>
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Location</label>
                        <input className="input-premium" placeholder="City / Mall" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required />
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Outlet Image</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ 
                            height: '120px', 
                            width: '100%', 
                            borderRadius: '12px', 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px dashed rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            position: 'relative'
                          }}>
                            {uploading ? (
                              <Loader2 className="animate-spin" size={24} color="var(--primary-red)" />
                            ) : formData.imageUrl ? (
                              <img src={formData.imageUrl.trim()} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400'; }} />
                            ) : (
                              <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <ImageIcon size={24} style={{ marginBottom: '8px' }} />
                                <div style={{ fontSize: '10px' }}>No Image Selected</div>
                              </div>
                            )}
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleFileUpload} 
                              style={{ 
                                position: 'absolute', 
                                top: 0, 
                                left: 0, 
                                width: '100%', 
                                height: '100%', 
                                opacity: 0, 
                                cursor: 'pointer' 
                              }} 
                            />
                          </div>
                          <input 
                            className="input-premium" 
                            placeholder="OR Enter Image URL (https://...)" 
                            value={formData.imageUrl} 
                            onChange={e => setFormData({...formData, imageUrl: e.target.value.trim()})} 
                          />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Feature</label>
                            <input className="input-premium" placeholder="e.g. 4DX" value={formData.feature} onChange={e => setFormData({...formData, feature: e.target.value})} />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Screens (0 Allowed)</label>
                            <input type="number" className="input-premium" value={formData.screenCount} onChange={e => setFormData({...formData, screenCount: e.target.value})} min="0" />
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', marginTop: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '16px', letterSpacing: '1.5px' }}>Outlet Login Credentials</div>
                        <div className="input-group" style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Authorized Google Email</label>
                            <input className="input-premium" placeholder="outlet@lovecafe.com" value={formData.loginEmail} onChange={e => setFormData({...formData, loginEmail: e.target.value})} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                        {isEditing && <button type="button" onClick={resetForm} style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.05)', color: 'white', borderRadius: '12px', fontWeight: 'bold' }}>CANCEL</button>}
                        <button 
                            type="submit" 
                            className="btn-lucrative" 
                            style={{ 
                                flex: 2, 
                                padding: '16px',
                                opacity: (!isEditing && cinemas.length >= 5) ? 0.5 : 1,
                                cursor: (!isEditing && cinemas.length >= 5) ? 'not-allowed' : 'pointer'
                            }}
                            disabled={!isEditing && cinemas.length >= 5}
                        >
                            {isEditing ? 'SAVE CHANGES' : (cinemas.length >= 5 ? 'LIMIT REACHED' : 'CREATE OUTLET')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      </div>
    </div>
  );
}
