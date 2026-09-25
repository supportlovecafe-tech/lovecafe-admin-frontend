import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { Plus, Coffee, Tag, DollarSign, Image as ImageIcon, Search, Trash2, Edit2, CheckCircle, X, Upload, Loader2, Download, Settings, Check, AlertCircle } from 'lucide-react';
import { Database } from '../lib/database.types';

type FoodItem = Database['public']['Tables']['food_items']['Row'] & {
  cinemas?: { name: string } | null;
};
type Cinema = Database['public']['Tables']['cinemas']['Row'];

interface FormData {
  name: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
  cinemaId: string;
  applyGst: boolean;
  isVeg: boolean;
}

interface CategoryItem {
  key: string;
  label: string;
  section: 'READY_FOOD' | 'KITCHEN_FOOD';
}

export function extractEmojiAndName(label: string): { emoji: string; name: string } {
  const trimmed = (label || '').trim();
  const match = trimmed.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u200d|[❤️🌟🍿🥛🥤🍦🧃🧀🍟🥪🍔🍗🌯🌮🥟🍚🍜🍝🍕☕🥗🍩🍫])+\s*/u);
  if (match) {
    const emoji = match[0].trim();
    const name = trimmed.slice(match[0].length).trim();
    return { emoji: emoji || '🍽️', name: name || trimmed };
  }
  
  const lower = trimmed.toLowerCase();
  let emoji = '🍽️';
  if (lower.includes('nacho')) emoji = '🧀';
  else if (lower.includes('boba') || lower.includes('bubble')) emoji = '🧋';
  else if (lower.includes('popcorn')) emoji = '🍿';
  else if (lower.includes('burger')) emoji = '🍔';
  else if (lower.includes('pizza')) emoji = '🍕';
  else if (lower.includes('lassi')) emoji = '🥛';
  else if (lower.includes('shake')) emoji = '🥤';
  else if (lower.includes('ice') || lower.includes('cream')) emoji = '🍦';
  else if (lower.includes('drink') || lower.includes('beverage') || lower.includes('juice') || lower.includes('water')) emoji = '🧃';
  else if (lower.includes('tea') || lower.includes('chai') || lower.includes('coffee')) emoji = '☕';
  else if (lower.includes('snack')) emoji = '🍟';
  else if (lower.includes('sandwich')) emoji = '🥪';
  else if (lower.includes('taco')) emoji = '🌮';
  else if (lower.includes('wrap')) emoji = '🌯';
  else if (lower.includes('momo') || lower.includes('dimsum')) emoji = '🥟';
  else if (lower.includes('noodle')) emoji = '🍜';
  else if (lower.includes('rice')) emoji = '🍚';
  else if (lower.includes('pasta')) emoji = '🍝';
  else if (lower.includes('tikka') || lower.includes('chicken')) emoji = '🍗';
  else if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('cake')) emoji = '🍰';

  const name = trimmed
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase());

  return { emoji, name };
}

const EMOJI_PALETTE = ['🍿', '🧋', '🧀', '🍟', '🍔', '🍕', '🥤', '🍦', '🥪', '🌮', '🥟', '🍜', '🍚', '🍗', '🌯', '🍝', '☕', '🧃', '❤️', '🌟', '🍽️', '🥗', '🍩', '🍫'];

const DEFAULT_CATEGORIES: CategoryItem[] = [
  // Ready Foods
  { key: 'POPCORN', label: '🍿 Popcorn', section: 'READY_FOOD' },
  { key: 'LASSI', label: '🥛 Lassi', section: 'READY_FOOD' },
  { key: 'MILKSHAKE', label: '🥤 Milkshake', section: 'READY_FOOD' },
  { key: 'ICE_CREAM', label: '🍦 Ice Cream', section: 'READY_FOOD' },
  { key: 'BEVERAGES', label: '🧃 Beverages', section: 'READY_FOOD' },
  { key: 'BOBA', label: '🧋 Boba', section: 'READY_FOOD' },
  { key: 'NACHOS', label: '🧀 Nachos', section: 'READY_FOOD' },
  { key: 'LOVE_SPECIAL', label: '❤️ Love Special', section: 'READY_FOOD' },
  // Kitchen Foods
  { key: 'SNACKS', label: '🍟 Snacks', section: 'KITCHEN_FOOD' },
  { key: 'SANDWICH', label: '🥪 Sandwich', section: 'KITCHEN_FOOD' },
  { key: 'BURGER', label: '🍔 Burger', section: 'KITCHEN_FOOD' },
  { key: 'TIKKA', label: '🍗 Tikka', section: 'KITCHEN_FOOD' },
  { key: 'WRAPS', label: '🌯 Wraps', section: 'KITCHEN_FOOD' },
  { key: 'TACO', label: '🌮 Taco', section: 'KITCHEN_FOOD' },
  { key: 'MOMO', label: '🥟 Momo', section: 'KITCHEN_FOOD' },
  { key: 'CHINESE_RICE_COMBO', label: '🍚 Chinese Rice Combo', section: 'KITCHEN_FOOD' },
  { key: 'CHINESE_NOODLES_COMBO', label: '🍜 Chinese Noodles Combo', section: 'KITCHEN_FOOD' },
  { key: 'CHINESE_PASTA', label: '🍝 Chinese Pasta', section: 'KITCHEN_FOOD' },
  { key: 'PIZZA', label: '🍕 Pizza', section: 'KITCHEN_FOOD' },
  { key: 'FUSION_FOODS', label: '🌟 Fusion Foods', section: 'KITCHEN_FOOD' }
];

export default function MenuManager({ user }: { user: any }) {
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Custom Categories list with local storage backup
  const [customCategories, setCustomCategories] = useState<CategoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('cinema_custom_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal for adding category
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatEmoji, setNewCatEmoji] = useState('🍽️');
  const [newCatName, setNewCatName] = useState('');
  const [newCatSection, setNewCatSection] = useState<'READY_FOOD' | 'KITCHEN_FOOD'>('KITCHEN_FOOD');

  // Category Manager Modal state
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [catSearchTerm, setCatSearchTerm] = useState('');
  const [catSectionFilter, setCatSectionFilter] = useState<'ALL' | 'READY_FOOD' | 'KITCHEN_FOOD'>('ALL');
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editEmoji, setEditEmoji] = useState('🍽️');
  const [editName, setEditName] = useState('');
  const [editSection, setEditSection] = useState<'READY_FOOD' | 'KITCHEN_FOOD'>('KITCHEN_FOOD');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Combined categories
  const allCategoryList = React.useMemo(() => {
    const map = new Map<string, CategoryItem>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.key, c));
    customCategories.forEach(c => map.set(c.key, c));

    // Also pick up any category existing in foods that isn't mapped yet
    foods.forEach(f => {
      const rawCat = (f.category || '').trim();
      const catKey = rawCat.toUpperCase().replace(/\s+/g, '_');
      if (catKey && !map.has(catKey)) {
        const isReady = ['POPCORN', 'LASSI', 'MILKSHAKE', 'ICE_CREAM', 'BEVERAGES', 'LOVE_SPECIAL', 'BOBA', 'NACHOS'].includes(catKey) 
          || f.food_type === 'READY_FOOD';
        const { emoji, name } = extractEmojiAndName(rawCat);
        map.set(catKey, {
          key: catKey,
          label: `${emoji} ${name}`,
          section: isReady ? 'READY_FOOD' : 'KITCHEN_FOOD'
        });
      }
    });

    return Array.from(map.values());
  }, [customCategories, foods]);

  const handleStartEditCategory = (cat: CategoryItem) => {
    const { emoji, name } = extractEmojiAndName(cat.label);
    setEditingCategoryKey(cat.key);
    setEditEmoji(emoji);
    setEditName(name);
    setEditSection(cat.section);
  };

  const handleSaveCategory = async (oldCatKey: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      alert('Category name cannot be empty.');
      return;
    }
    const emoji = editEmoji.trim() || '🍽️';
    const newLabel = `${emoji} ${trimmed}`;
    const newKey = trimmed.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

    setIsSavingCategory(true);
    try {
      // Find all food items currently matching this category
      const affectedItems = foods.filter(f => {
        const fCat = (f.category || '').toUpperCase().trim();
        return fCat === oldCatKey || fCat === oldCatKey.replace(/_/g, ' ') || (f.category || '').toLowerCase() === oldCatKey.toLowerCase();
      });

      if (affectedItems.length > 0) {
        const confirmMsg = `There are ${affectedItems.length} menu item(s) currently under this category.\n\nUpdating will change their category to "${trimmed}" (${newKey}) and update food routing in Supabase.\n\nProceed?`;
        if (!window.confirm(confirmMsg)) {
          setIsSavingCategory(false);
          return;
        }

        // Update items in Supabase
        const { error: updateError } = await supabase
          .from('food_items')
          .update({
            category: newKey,
            food_type: editSection
          })
          .or(`category.eq.${oldCatKey},category.ilike.${oldCatKey},category.ilike.${trimmed}`);

        if (updateError) {
          console.error('Failed to update category on food_items:', updateError);
          alert('Failed to update food items in database: ' + updateError.message);
          setIsSavingCategory(false);
          return;
        }
      }

      // Update custom categories list
      const updatedItem: CategoryItem = {
        key: newKey,
        label: newLabel,
        section: editSection
      };

      const updated = [
        ...customCategories.filter(c => c.key !== oldCatKey && c.key !== newKey),
        updatedItem
      ];
      setCustomCategories(updated);
      try {
        localStorage.setItem('cinema_custom_categories', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save custom category:', e);
      }

      await triggerCacheInvalidation('');
      await fetchData();
      setEditingCategoryKey(null);
      alert(`Category "${newLabel}" saved successfully! ${affectedItems.length} menu item(s) updated.`);
    } catch (err: any) {
      console.error('Save category error:', err);
      alert('Error saving category: ' + (err?.message || err));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    const affectedCount = foods.filter(f => {
      const fCat = (f.category || '').toUpperCase().trim();
      return fCat === cat.key || fCat === cat.key.replace(/_/g, ' ') || (f.category || '').toLowerCase() === cat.key.toLowerCase();
    }).length;

    if (affectedCount > 0) {
      alert(`Cannot delete "${cat.label}": There are ${affectedCount} item(s) currently using this category.\n\nPlease change their category first.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete category "${cat.label}"?`)) return;

    const updated = customCategories.filter(c => c.key !== cat.key);
    setCustomCategories(updated);
    try {
      localStorage.setItem('cinema_custom_categories', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete category:', e);
    }
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    const formattedKey = trimmed.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    if (!formattedKey) {
      alert('Please enter a valid category name.');
      return;
    }

    const emoji = (newCatEmoji || '').trim() || '🍽️';
    const newCategory: CategoryItem = {
      key: formattedKey,
      label: `${emoji} ${trimmed}`,
      section: newCatSection
    };

    const updated = [...customCategories.filter(c => c.key !== formattedKey), newCategory];
    setCustomCategories(updated);
    try {
      localStorage.setItem('cinema_custom_categories', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save category:', err);
    }

    // Automatically select the newly created category in the food item form
    setFormData(prev => ({ ...prev, category: formattedKey }));
    setNewCatName('');
    setNewCatEmoji('🍽️');
    setShowAddCategoryModal(false);
  };

  const categories = React.useMemo(() => {
    return Array.from(new Set([
      'Snacks', 'Popcorn', 'Beverages', 'Meals',
      ...foods.map(f => f.category)
    ])).filter(Boolean).sort();
  }, [foods]);

  // Form State (Side Panel)
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    name: '', 
    description: '', 
    price: '', 
    category: 'POPCORN', 
    imageUrl: '', 
    cinemaId: user?.cinema_id || '',
    applyGst: true,
    isVeg: true
  });

  // Bulk Upload State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFileItems, setBulkFileItems] = useState<any[]>([]);
  const [bulkTargetCinemaId, setBulkTargetCinemaId] = useState(user?.cinema_id || '');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));
    
    const items: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      if (values.length === headers.length) {
        const item: any = {};
        headers.forEach((header, index) => {
          let val = values[index];
          val = val.replace(/^["']|["']$/g, '');
          item[header] = val;
        });
        items.push(item);
      }
    }
    return items;
  };

  const downloadSampleTemplate = () => {
    const headers = "ItemName,Category,Price,Description,Image,IsVeg,ApplyGst\n";
    const sample = "Salted Caramel Popcorn,SNACKS,250,Delicious popcorn,https://images.unsplash.com/photo-1578849278619-e73505e9610f,TRUE,TRUE\nClassic Nachos,SNACKS,180,Crispy tortilla chips with cheese dip,,TRUE,TRUE\nCold Coffee,BEVERAGES,150,Chilled blended creamy coffee,,TRUE,TRUE\n";
    const blob = new Blob(['\ufeff' + headers + sample], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu_sample_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCurrentMenu = () => {
    const headers = "ItemName,Category,Price,Description,Image,IsVeg,ApplyGst\n";
    
    if (!foods || foods.length === 0) {
      downloadSampleTemplate();
      return;
    }

    const rows = foods.map(item => {
      const escapeCsv = (str: string) => {
        if (!str) return '';
        const escaped = str.toString().replace(/"/g, '""');
        return `"${escaped}"`;
      };
      
      return [
        escapeCsv(item.name),
        escapeCsv(item.category || ''),
        item.price,
        escapeCsv(item.description || ''),
        escapeCsv(item.image_url || ''),
        item.is_veg ? 'TRUE' : 'FALSE',
        item.apply_gst ? 'TRUE' : 'FALSE'
      ].join(',');
    }).join('\n');

    const blob = new Blob(['\ufeff' + headers + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_menu_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError(null);
    setBulkSuccessMsg(null);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        let parsed: any[] = [];
        
        if (file.name.endsWith('.json')) {
          parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error("JSON file must be an array of food items.");
          }
        } else if (file.name.endsWith('.csv')) {
          parsed = parseCSV(text);
        } else {
          throw new Error("Unsupported file format. Please upload .csv or .json");
        }
        
        const mapped = parsed.map((item, idx) => {
          const name = item.name || item.ItemName || item.itemName;
          const category = (item.category || item.Category || 'SNACKS').toUpperCase();
          const price = parseFloat(item.price || item.Price);
          const description = item.description || item.Description || '';
          const imageUrl = item.image_url || item.imageUrl || item.image || item.Image || '';
          
          let isVeg = true;
          if (item.is_veg !== undefined) isVeg = String(item.is_veg).toLowerCase() === 'true';
          else if (item.veg !== undefined) isVeg = String(item.veg).toLowerCase() === 'true';
          
          let applyGst = true;
          if (item.apply_gst !== undefined) applyGst = String(item.apply_gst).toLowerCase() === 'true';
          else if (item.gst !== undefined) applyGst = String(item.gst).toLowerCase() === 'true';
          
          const errors: string[] = [];
          if (!name) errors.push("Missing name");
          if (isNaN(price)) errors.push("Invalid price");
          
          return {
            index: idx + 1,
            name,
            category,
            price,
            description,
            image_url: imageUrl,
            is_veg: isVeg,
            apply_gst: applyGst,
            errors
          };
        });
        
        setBulkFileItems(mapped);
      } catch (err: any) {
        setBulkError("Parsing Error: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkSubmit = async () => {
    if (bulkFileItems.length === 0) return;
    const invalidItems = bulkFileItems.filter(item => item.errors.length > 0);
    if (invalidItems.length > 0) {
      setBulkError(`Please fix the ${invalidItems.length} invalid items in your file before importing.`);
      return;
    }
    
    setImporting(true);
    setBulkError(null);
    
    const targetCinemaId = user?.role === 'OUTLET_MANAGER' ? user.cinema_id : bulkTargetCinemaId;
    
    const payload = bulkFileItems.map(item => {
      const matchedCat = allCategoryList.find(c => c.key === item.category);
      const derivedFoodType = matchedCat ? matchedCat.section : 'KITCHEN_FOOD';
      
      return {
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        food_type: derivedFoodType,
        image_url: item.image_url,
        cinema_id: targetCinemaId === '' ? null : targetCinemaId,
        apply_gst: item.apply_gst,
        is_veg: item.is_veg,
        is_available: true
      };
    });
    
    const { error } = await supabase.from('food_items').insert(payload);
    if (error) {
      console.error('Bulk Insert Error:', error);
      setBulkError('Failed to import items: ' + error.message);
      setImporting(false);
      return;
    }
    
    await triggerCacheInvalidation(targetCinemaId);
    setBulkSuccessMsg(`Successfully imported ${payload.length} items!`);
    setBulkFileItems([]);
    fetchData();
    setImporting(false);
    setTimeout(() => {
      setShowBulkModal(false);
      setBulkSuccessMsg(null);
    }, 1500);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    let foodQuery = supabase.from('food_items').select('*, cinemas(name)').order('created_at', { ascending: false });
    let cinemaQuery = supabase.from('cinemas').select('id, name, location, rating, feature, image_url, owner_id, created_at');

    if (user?.role === 'OUTLET_MANAGER' && user?.cinema_id) {
        foodQuery = foodQuery.or(`cinema_id.eq.${user.cinema_id},cinema_id.is.null`);
        cinemaQuery = cinemaQuery.eq('id', user.cinema_id);
    }

    const [foodRes, cinemaRes] = await Promise.all([foodQuery, cinemaQuery]);
    if (foodRes.data) setFoods(foodRes.data as FoodItem[]);
    if (cinemaRes.data) setCinemas(cinemaRes.data);
    setLoading(false);
  };

  const triggerCacheInvalidation = async (cinemaId?: string | null) => {
    try {
        await fetch(`${API_BASE_URL}/api/menu/invalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cinemaId: cinemaId || user?.cinema_id })
        });
    } catch (e) {
        console.error("Cache invalidation failed:", e);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', price: '', category: 'POPCORN', imageUrl: '', cinemaId: user?.cinema_id || '', applyGst: true, isVeg: true });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleOpenEdit = (item: FoodItem) => {
    const rawCat = (item.category || '').trim();
    const catUpper = rawCat.toUpperCase().replace(/\s+/g, '_');
    const matched = allCategoryList.find(c => c.key === catUpper || c.key === rawCat.toUpperCase());
    setFormData({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        category: matched ? matched.key : (item.category || 'POPCORN'),
        imageUrl: item.image_url || '',
        cinemaId: item.cinema_id || '',
        applyGst: item.apply_gst !== false,
        isVeg: item.is_veg !== false
    });
    setIsEditing(true);
    setCurrentId(item.id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `menu/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
            cacheControl: '0',
            upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      const url = publicUrlData.publicUrl;
      console.log('Successfully uploaded image. Public URL:', url);
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (error: any) {
      console.error('Upload error:', error);
      alert('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this menu item?")) return;
    setLoading(true);
    const { error } = await supabase.from('food_items').delete().eq('id', id);
    if (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item: ' + error.message);
    } else {
        await triggerCacheInvalidation(foods.find(f => f.id === id)?.cinema_id);
    }
    fetchData();
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Force all newly created or updated items to be global to share the same menu across all outlets
    const targetCinemaId = ''; // user?.role === 'OUTLET_MANAGER' ? user.cinema_id : formData.cinemaId;
    
    const matchedCat = allCategoryList.find(c => c.key === formData.category);
    const derivedFoodType = matchedCat ? matchedCat.section : 'KITCHEN_FOOD';

    const payload: Database['public']['Tables']['food_items']['Insert'] = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        food_type: derivedFoodType,
        image_url: formData.imageUrl,
        cinema_id: targetCinemaId === '' ? null : targetCinemaId,
        apply_gst: formData.applyGst,
        is_veg: formData.isVeg
    };

    if (isEditing && currentId) {
        const { error } = await supabase.from('food_items').update(payload).eq('id', currentId);
        if (error) {
            console.error('Update error:', error);
            alert('Failed to update item: ' + error.message);
            setLoading(false);
            return;
        }
    } else {
        const { error } = await supabase.from('food_items').insert([payload]);
        if (error) {
            console.error('Insert error:', error);
            alert('Failed to add item: ' + error.message);
            setLoading(false);
            return;
        }
    }

    resetForm();
    await triggerCacheInvalidation(targetCinemaId);
    fetchData();
    setLoading(false);
  };

  const toggleAvailability = async (id, currentStatus) => {
      const { error } = await supabase.from('food_items').update({ is_available: !currentStatus }).eq('id', id);
      if (error) {
          console.error('Toggle error:', error);
          alert('Failed to update availability: ' + error.message);
      } else {
          await triggerCacheInvalidation(foods.find(f => f.id === id)?.cinema_id);
      }
      fetchData();
  };

  const filteredFoods = foods.filter(f => 
    f.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: 'calc(100vh - 120px)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '900', letterSpacing: '-1.5px' }}>{user?.role === 'SUPER_ADMIN' ? 'Global Menu' : 'Outlet Menu'}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Curate the culinary experience for your patrons.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            type="button"
            onClick={() => setShowCategoryManager(true)}
            className="btn-glass"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 20px', 
              borderRadius: '14px', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              border: '1px solid rgba(0, 210, 255, 0.3)',
              color: '#00d2ff',
              background: 'rgba(0, 210, 255, 0.08)'
            }}
          >
            <Settings size={18} />
            <span>Manage Categories</span>
          </button>
          <button 
            onClick={() => setShowBulkModal(true)}
            className="btn-glass"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            <Upload size={18} color="var(--primary-red)" />
            <span>Bulk Import Menu</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
        
        {/* Left: Search & Items Grid */}
        <div style={{ flex: 1.8, display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
               <Search size={20} color="rgba(255,255,255,0.2)" />
               <input 
                  type="text" 
                  placeholder="Search catalog by item name or category..." 
                  style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, fontSize: '14px', outline: 'none' }}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
                    {filteredFoods.map(item => (
                        <div key={item.id} className="glass-card hover-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ height: '140px', position: 'relative', background: 'var(--surface-container-high)' }}>
                                <img 
                                  src={item.image_url ? item.image_url : 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?w=400'} 
                                  alt={item.name} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: item.is_available ? 1 : 0.4 }} 
                                  onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?w=400'; }}
                                />
                                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleOpenEdit(item)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                    <button onClick={() => handleDelete(item.id)} style={{ background: 'rgba(211,47,47,0.6)', color: 'white', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                                <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
                                    <button 
                                        onClick={() => toggleAvailability(item.id, item.is_available)}
                                        style={{ background: item.is_available ? 'rgba(76,175,80,0.9)' : 'rgba(0,0,0,0.7)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', backdropFilter: 'blur(4px)' }}
                                    >
                                        {item.is_available ? 'AVAILABLE' : 'SOLD OUT'}
                                    </button>
                                </div>
                            </div>
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '15px', fontWeight: 'bold' }}>{item.name}</h3>
                                    <div style={{ color: 'var(--secondary-orange)', fontWeight: 'bold', fontSize: '15px' }}>₹{item.price}</div>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '12px' }}>{item.description}</p>
                                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    {(() => {
                                        const rawCat = (item.category || '').trim();
                                        const catUpper = rawCat.toUpperCase().replace(/\s+/g, '_');
                                        const matched = allCategoryList.find(c => c.key === catUpper || c.key === rawCat.toUpperCase());
                                        return (
                                            <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px', color: 'rgba(255,255,255,0.75)', fontWeight: '500' }}>
                                                {matched ? matched.label : item.category}
                                            </span>
                                        );
                                    })()}
                                    {user?.role === 'SUPER_ADMIN' && <span style={{ fontSize: '10px', color: 'var(--primary-red)', fontWeight: 'bold' }}>{item.cinemas?.name || 'Global'}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Right: Master Form */}
        <div style={{ width: '380px' }}>
            <div className="glass-card animate-fade-in" style={{ padding: '32px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.5px' }}>{isEditing ? 'Edit Delicacy' : 'Add to Menu'}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{isEditing ? 'Refining item details' : 'Introduce a new flavor profile'}</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {user?.role === 'SUPER_ADMIN' && (
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Target Outlet</label>
                            <select className="input-premium" value={formData.cinemaId} onChange={e => setFormData({...formData, cinemaId: e.target.value})} style={{ appearance: 'none' }}>
                                <option value="">Global (All Outlets)</option>
                                {cinemas.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="input-group">
                        <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Item Name</label>
                        <input className="input-premium" placeholder="e.g. Salted Caramel Popcorn" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="input-group">
                            <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Price (₹)</label>
                            <input type="number" className="input-premium" placeholder="250" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
                        </div>
                        <div className="input-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: 0 }}>Category</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowCategoryManager(true)}
                                        title="Manage Categories & Edit Spellings/Emojis"
                                        style={{
                                            background: 'rgba(0, 210, 255, 0.12)',
                                            border: '1px solid rgba(0, 210, 255, 0.3)',
                                            color: '#00d2ff',
                                            borderRadius: '6px',
                                            padding: '2px 8px',
                                            fontSize: '11px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Settings size={12} />
                                        <span>Manage</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAddCategoryModal(true)}
                                        title="Add New Category"
                                        style={{
                                            background: 'rgba(255, 47, 146, 0.15)',
                                            border: '1px solid rgba(255, 47, 146, 0.3)',
                                            color: '#ff2f92',
                                            borderRadius: '6px',
                                            width: '24px',
                                            height: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            padding: 0
                                        }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                            <select 
                                className="input-premium" 
                                value={formData.category} 
                                onChange={e => setFormData({...formData, category: e.target.value})} 
                                required 
                                style={{ appearance: 'none', background: 'var(--surface-container-high)', color: 'white' }}
                            >
                                <optgroup label="🟢 Ready Food" style={{ background: '#1c1c1e', color: '#ffb36a' }}>
                                    {allCategoryList.filter(c => c.section === 'READY_FOOD').map(cat => (
                                        <option key={cat.key} value={cat.key}>{cat.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="🔥 Kitchen Food" style={{ background: '#1c1c1e', color: '#00d2ff' }}>
                                    {allCategoryList.filter(c => c.section === 'KITCHEN_FOOD').map(cat => (
                                        <option key={cat.key} value={cat.key}>{cat.label}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Description</label>
                        <textarea className="input-premium" placeholder="Flavor notes..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={2} />
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Menu Item Image</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ 
                            height: '100px', 
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
                              <Loader2 className="animate-spin" size={20} color="var(--primary-red)" />
                            ) : formData.imageUrl ? (
                              <img src={formData.imageUrl.trim()} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?w=400'; }} />
                            ) : (
                              <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <ImageIcon size={20} style={{ marginBottom: '4px' }} />
                                <div style={{ fontSize: '10px' }}>Upload Image</div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>OR URL</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
                          </div>
                          <input 
                            className="input-premium" 
                            placeholder="https://..." 
                            value={formData.imageUrl} 
                            onChange={e => setFormData({...formData, imageUrl: e.target.value.trim()})} 
                          />
                        </div>
                    </div>

                    <div className="input-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <input 
                                type="checkbox" 
                                id="applyGst" 
                                checked={formData.applyGst} 
                                onChange={e => setFormData({...formData, applyGst: e.target.checked})} 
                                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-red)' }} 
                            />
                            <div>
                                <label htmlFor="applyGst" style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', cursor: 'pointer' }}>Apply GST</label>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                             <button 
                                type="button"
                                onClick={() => setFormData({...formData, isVeg: true})}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: formData.isVeg ? '#4CAF50' : 'transparent', color: formData.isVeg ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                             >VEG</button>
                             <button 
                                type="button"
                                onClick={() => setFormData({...formData, isVeg: false})}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: !formData.isVeg ? '#D32F2F' : 'transparent', color: !formData.isVeg ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                             >NON-VEG</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                        {isEditing && <button type="button" onClick={resetForm} style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.05)', color: 'white', borderRadius: '12px', fontWeight: 'bold' }}><X size={18} /></button>}
                        <button type="submit" className="btn-lucrative" style={{ flex: 2, padding: '16px' }}>{isEditing ? 'UPDATE ITEM' : 'ADD TO MENU'}</button>
                    </div>
                </form>
            </div>
        </div>
      </div>

      {showBulkModal && (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="glass-card" style={{
              width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column',
              maxHeight: '90vh', overflow: 'hidden', padding: '32px', border: '1px solid rgba(255,255,255,0.1)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.5px', margin: 0 }}>Bulk Import Menu Items</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>Upload a CSV or JSON file to populate your catalog.</p>
              </div>
              <button onClick={() => { setShowBulkModal(false); setBulkFileItems([]); setBulkError(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '6px' }}>
              
              {/* Target Cinema Selection (Super Admin only) */}
              {user?.role === 'SUPER_ADMIN' && (
                <div className="input-group">
                  <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', display: 'block' }}>Target Outlet</label>
                  <select className="input-premium" value={bulkTargetCinemaId} onChange={e => setBulkTargetCinemaId(e.target.value)} style={{ appearance: 'none' }}>
                    <option value="">Global (All Outlets)</option>
                    {cinemas.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Upload Drop Zone */}
              {bulkFileItems.length === 0 && (
                <div style={{ 
                  border: '2px dashed rgba(255,255,255,0.15)',
                  borderRadius: '16px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.01)',
                  position: 'relative',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <Upload size={40} color="var(--primary-red)" />
                  <div>
                    <span style={{ fontWeight: 'bold' }}>Click to upload</span> or drag and drop
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Supports CSV or JSON files</div>
                  </div>
                  <input 
                    type="file" 
                    accept=".csv,.json" 
                    onChange={handleBulkFileChange} 
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                  />
                </div>
              )}

              {/* Instructions / Template Download */}
              {bulkFileItems.length === 0 && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Make sure your CSV has these exact columns: <br/>
                      <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '6px', color: 'var(--accent-gold)' }}>ItemName, Category, Price, Description, Image, IsVeg, ApplyGst</code>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button 
                        type="button"
                        onClick={downloadSampleTemplate}
                        style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '10px 14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                      >
                        <Download size={16} />
                        Download Sample Excel / CSV
                      </button>
                      <button 
                        type="button"
                        onClick={downloadCurrentMenu}
                        style={{ background: 'rgba(0, 210, 255, 0.1)', color: '#00d2ff', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '10px 14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 210, 255, 0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 210, 255, 0.1)'}
                      >
                        <Download size={16} />
                        Export Current Menu (Excel / CSV)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* File Template Guidance */}
              {bulkFileItems.length === 0 && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0', color: 'rgba(255,255,255,0.4)' }}>File Format Guidelines</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                    Your file must include the following headers/keys:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>name</span> (string) - Required
                    </div>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>price</span> (number) - Required
                    </div>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>category</span> (string) - Required
                    </div>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>description</span> (string)
                    </div>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>image_url</span> (string)
                    </div>
                    <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontWeight: 'bold', color: 'white' }}>is_veg</span> (true/false)
                    </div>
                  </div>
                </div>
              )}

              {/* Parsed Items Preview */}
              {bulkFileItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Parsed {bulkFileItems.length} items:</div>
                    <button onClick={() => setBulkFileItems([])} style={{ background: 'none', border: 'none', color: 'var(--primary-red)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Clear List</button>
                  </div>
                  <div className="glass-card" style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>#</th>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>Name</th>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>Category</th>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>Price</th>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>Veg/GST</th>
                          <th style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: '900' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkFileItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.3)' }}>{item.index}</td>
                            <td style={{ padding: '10px 16px', fontWeight: 'bold' }}>
                              <div>{item.name || <span style={{ color: 'var(--primary-red)' }}>Unnamed Item</span>}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description || 'No description'}</div>
                            </td>
                            <td style={{ padding: '10px 16px' }}><span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.4)' }}>{item.category}</span></td>
                            <td style={{ padding: '10px 16px', fontWeight: 'bold', color: 'var(--secondary-orange)' }}>₹{isNaN(item.price) ? '—' : item.price}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ color: item.is_veg ? '#4CAF50' : '#D32F2F', fontWeight: 'bold', marginRight: '8px' }}>{item.is_veg ? 'VEG' : 'NON-VEG'}</span>
                              <span style={{ color: item.apply_gst ? '#FFB36A' : 'rgba(255,255,255,0.2)' }}>{item.apply_gst ? 'GST' : 'NO GST'}</span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {item.errors.length > 0 ? (
                                <span style={{ color: 'var(--primary-red)', fontWeight: 'bold' }}>⚠️ {item.errors.join(', ')}</span>
                              ) : (
                                <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>✓ Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status / Errors */}
              {bulkError && (
                <div style={{ color: '#ff6b9d', background: 'rgba(255,47,146,0.08)', padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500, border: '1px solid rgba(255,47,146,0.2)' }}>
                  {bulkError}
                </div>
              )}
              {bulkSuccessMsg && (
                <div style={{ color: '#4CAF50', background: 'rgba(76,175,80,0.08)', padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500, border: '1px solid rgba(76,175,80,0.2)' }}>
                  {bulkSuccessMsg}
                </div>
              )}

            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', marginTop: '20px' }}>
              <button 
                type="button" 
                onClick={() => { setShowBulkModal(false); setBulkFileItems([]); setBulkError(null); }}
                style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                disabled={importing}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-lucrative" 
                style={{ flex: 2, padding: '14px', opacity: bulkFileItems.length === 0 || importing ? 0.6 : 1, cursor: bulkFileItems.length === 0 || importing ? 'not-allowed' : 'pointer' }}
                disabled={bulkFileItems.length === 0 || importing}
                onClick={handleBulkSubmit}
              >
                {importing ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Importing...</span>
                  </div>
                ) : (
                  <span>Import Menu Items</span>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Category Manager & Spelling Editor Modal */}
      {showCategoryManager && (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
            padding: '20px'
        }}>
          <div className="glass-card" style={{
              width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              padding: '28px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.7)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(0, 210, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d2ff' }}>
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: '900', margin: 0, color: 'white' }}>Category & Spelling Manager</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 0' }}>
                      Add sticker/emojis, correct category spellings, or switch routing sections. Saving syncs across all items in the database.
                    </p>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => { setShowCategoryManager(false); setEditingCategoryKey(null); }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Add Section */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>
                Quick Add New Category
              </div>
              <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <input
                    type="text"
                    value={newCatEmoji}
                    onChange={e => setNewCatEmoji(e.target.value)}
                    style={{ width: '32px', textAlign: 'center', fontSize: '18px', background: 'transparent', border: 'none', outline: 'none', color: 'white' }}
                    title="Emoji Icon"
                  />
                  <div style={{ display: 'flex', gap: '2px', overflowX: 'auto', maxWidth: '160px' }}>
                    {EMOJI_PALETTE.slice(0, 6).map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setNewCatEmoji(em)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px' }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  className="input-premium"
                  placeholder="Category Name (e.g. Nachos, Boba)..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  style={{ flex: 1, minWidth: '160px' }}
                />

                <select
                  value={newCatSection}
                  onChange={e => setNewCatSection(e.target.value as any)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--surface-container-high)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: newCatSection === 'READY_FOOD' ? '#ffb36a' : '#00d2ff',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  <option value="READY_FOOD">🟢 Ready Food</option>
                  <option value="KITCHEN_FOOD">🔥 Kitchen Food</option>
                </select>

                <button
                  type="submit"
                  className="btn-lucrative"
                  style={{ padding: '10px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} />
                  <span>Add Category</span>
                </button>
              </form>
            </div>

            {/* Filter Tabs & Search */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '12px' }}>
                <button
                  type="button"
                  onClick={() => setCatSectionFilter('ALL')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: catSectionFilter === 'ALL' ? 'rgba(255,255,255,0.15)' : 'transparent',
                    color: catSectionFilter === 'ALL' ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  All ({allCategoryList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatSectionFilter('READY_FOOD')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: catSectionFilter === 'READY_FOOD' ? 'rgba(255, 179, 106, 0.2)' : 'transparent',
                    color: catSectionFilter === 'READY_FOOD' ? '#ffb36a' : 'var(--text-secondary)'
                  }}
                >
                  🟢 Ready Food ({allCategoryList.filter(c => c.section === 'READY_FOOD').length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatSectionFilter('KITCHEN_FOOD')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: catSectionFilter === 'KITCHEN_FOOD' ? 'rgba(0, 210, 255, 0.2)' : 'transparent',
                    color: catSectionFilter === 'KITCHEN_FOOD' ? '#00d2ff' : 'var(--text-secondary)'
                  }}
                >
                  🔥 Kitchen Food ({allCategoryList.filter(c => c.section === 'KITCHEN_FOOD').length})
                </button>
              </div>

              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={catSearchTerm}
                  onChange={e => setCatSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Scrollable Category List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', minHeight: '260px' }}>
              {allCategoryList
                .filter(cat => {
                  if (catSectionFilter !== 'ALL' && cat.section !== catSectionFilter) return false;
                  if (catSearchTerm) {
                    return cat.label.toLowerCase().includes(catSearchTerm.toLowerCase()) || cat.key.toLowerCase().includes(catSearchTerm.toLowerCase());
                  }
                  return true;
                })
                .map(cat => {
                  const itemCount = foods.filter(f => {
                    const fCat = (f.category || '').toUpperCase().trim();
                    return fCat === cat.key || fCat === cat.key.replace(/_/g, ' ') || (f.category || '').toLowerCase() === cat.key.toLowerCase();
                  }).length;
                  const isEditingThis = editingCategoryKey === cat.key;

                  if (isEditingThis) {
                    return (
                      <div
                        key={cat.key}
                        style={{
                          background: 'rgba(0, 210, 255, 0.08)',
                          border: '1px solid rgba(0, 210, 255, 0.3)',
                          borderRadius: '16px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '900', color: '#00d2ff', textTransform: 'uppercase' }}>
                            Editing Category: {cat.key}
                          </span>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                            {itemCount} item(s) currently linked
                          </span>
                        </div>

                        {/* Emoji & Spelling Form */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.06)', padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <input
                              type="text"
                              value={editEmoji}
                              onChange={e => setEditEmoji(e.target.value)}
                              style={{ width: '32px', textAlign: 'center', fontSize: '20px', background: 'transparent', border: 'none', outline: 'none', color: 'white' }}
                              title="Emoji Icon"
                            />
                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', maxWidth: '200px' }}>
                              {EMOJI_PALETTE.map(em => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => setEditEmoji(em)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px' }}
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ flex: 1, minWidth: '180px' }}>
                            <input
                              type="text"
                              className="input-premium"
                              placeholder="Correct Category Spelling (e.g. Nachos)..."
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              style={{ width: '100%', fontSize: '14px', fontWeight: 'bold' }}
                              autoFocus
                            />
                          </div>

                          <select
                            value={editSection}
                            onChange={e => setEditSection(e.target.value as any)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: 'var(--surface-container-high)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: editSection === 'READY_FOOD' ? '#ffb36a' : '#00d2ff',
                              fontWeight: 'bold',
                              fontSize: '12px'
                            }}
                          >
                            <option value="READY_FOOD">🟢 Ready Food</option>
                            <option value="KITCHEN_FOOD">🔥 Kitchen Food</option>
                          </select>
                        </div>

                        {itemCount > 0 && (
                          <div style={{ fontSize: '12px', color: '#ffb36a', background: 'rgba(255, 179, 106, 0.1)', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={14} />
                            <span>Saving will update all {itemCount} existing menu item(s) in the database to this category & routing.</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryKey(null)}
                            style={{ padding: '8px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                            disabled={isSavingCategory}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveCategory(cat.key)}
                            className="btn-lucrative"
                            style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                            disabled={isSavingCategory}
                          >
                            {isSavingCategory ? (
                              <>
                                <Loader2 className="animate-spin" size={14} />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Check size={14} />
                                <span>Save Changes</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={cat.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{extractEmojiAndName(cat.label).emoji}</span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'white' }}>
                            {extractEmojiAndName(cat.label).name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                            Key: {cat.key}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 'bold',
                          padding: '3px 10px',
                          borderRadius: '8px',
                          background: cat.section === 'READY_FOOD' ? 'rgba(255, 179, 106, 0.12)' : 'rgba(0, 210, 255, 0.12)',
                          color: cat.section === 'READY_FOOD' ? '#ffb36a' : '#00d2ff',
                          border: cat.section === 'READY_FOOD' ? '1px solid rgba(255, 179, 106, 0.25)' : '1px solid rgba(0, 210, 255, 0.25)'
                        }}>
                          {cat.section === 'READY_FOOD' ? '🟢 Ready Food' : '🔥 Kitchen Food'}
                        </span>

                        <span style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.06)',
                          color: itemCount > 0 ? 'white' : 'rgba(255,255,255,0.4)',
                          fontWeight: '500'
                        }}>
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(cat)}
                            title="Edit Spelling, Emoji & Section"
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'white',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}
                          >
                            <Edit2 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            title={itemCount > 0 ? "Cannot delete category while items are attached" : "Delete category"}
                            style={{
                              background: 'rgba(211,47,47,0.15)',
                              border: '1px solid rgba(211,47,47,0.3)',
                              color: '#ff4d4d',
                              borderRadius: '8px',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              opacity: itemCount > 0 ? 0.4 : 1
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setShowCategoryManager(false); setEditingCategoryKey(null); }}
                style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.08)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Category Modal */}
      {showAddCategoryModal && (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div className="glass-card" style={{
              width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column',
              padding: '28px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '900', margin: 0 }}>Add Menu Category</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 0' }}>
                  Choose an emoji icon, category name, and kitchen/ready routing.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => { setShowAddCategoryModal(false); setNewCatName(''); setNewCatEmoji('🍽️'); }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', display: 'block' }}>
                  Category Icon & Name
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={newCatEmoji}
                    onChange={e => setNewCatEmoji(e.target.value)}
                    style={{ width: '44px', height: '44px', textAlign: 'center', fontSize: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}
                    title="Emoji Icon"
                  />
                  <input 
                    type="text" 
                    className="input-premium" 
                    placeholder="e.g. Desserts, Mocktails, Rolls..." 
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    autoFocus
                    required 
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {EMOJI_PALETTE.slice(0, 10).map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setNewCatEmoji(em)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px' }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', display: 'block' }}>
                  Section / Routing
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setNewCatSection('READY_FOOD')}
                    style={{
                      padding: '14px 12px',
                      borderRadius: '12px',
                      border: newCatSection === 'READY_FOOD' ? '2px solid #ffb36a' : '1px solid rgba(255,255,255,0.08)',
                      background: newCatSection === 'READY_FOOD' ? 'rgba(255, 179, 106, 0.12)' : 'rgba(255,255,255,0.02)',
                      color: newCatSection === 'READY_FOOD' ? '#ffb36a' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>🍿</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Ready Food</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>Beverages, Popcorn, etc.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCatSection('KITCHEN_FOOD')}
                    style={{
                      padding: '14px 12px',
                      borderRadius: '12px',
                      border: newCatSection === 'KITCHEN_FOOD' ? '2px solid #00d2ff' : '1px solid rgba(255,255,255,0.08)',
                      background: newCatSection === 'KITCHEN_FOOD' ? 'rgba(0, 210, 255, 0.12)' : 'rgba(255,255,255,0.02)',
                      color: newCatSection === 'KITCHEN_FOOD' ? '#00d2ff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>🔥</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Kitchen Food</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>Cooked, Meals, Burgers</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => { setShowAddCategoryModal(false); setNewCatName(''); setNewCatEmoji('🍽️'); }}
                  style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-lucrative" 
                  style={{ flex: 2, padding: '12px' }}
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
