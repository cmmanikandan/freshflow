/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  CATEGORIES, 
  PRODUCTS, 
  ICONS 
} from './constants';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  loginWithEmail,
  signUpWithEmail,
  updateProfile,
  logout, 
  onAuthStateChanged, 
  FirebaseUser,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  increment,
  arrayUnion,
  handleFirestoreError,
  OperationType
} from './firebase';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

// --- Types ---
type Screen = 
  | 'splash' 
  | 'onboarding' 
  | 'login' 
  | 'home' 
  | 'listing' 
  | 'detail' 
  | 'basket' 
  | 'cart' 
  | 'checkout' 
  | 'tracking' 
  | 'subscription' 
  | 'health' 
  | 'profile' 
  | 'admin'
  | 'rewards'
  | 'orders'
  | 'addresses'
  | 'payment'
  | 'wishlist'
  | 'vendor';

interface CartItem {
  productId: number;
  quantity: number;
}

interface PaymentConfig {
  merchantName: string;
  upiId: string;
  qrImage: string;
}

// --- Components ---

const Button = ({ children, onClick, className = '', variant = 'primary', disabled = false }: any) => {
  const variants: any = {
    primary: 'gradient-primary text-white',
    secondary: 'gradient-secondary text-white',
    outline: 'border-2 border-primary text-primary bg-transparent',
    ghost: 'bg-transparent text-ink hover:bg-black/5',
  };
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${variants[variant]} ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '', onClick }: any) => (
  <div 
    onClick={onClick}
    className={`bg-white rounded-3xl p-4 shadow-sm border border-black/5 ${onClick ? 'cursor-pointer active:scale-[0.98] transition-all' : ''} ${className}`}
  >
    {children}
  </div>
);

const Navbar = ({ active, setScreen }: { active: Screen, setScreen: (s: Screen) => void }) => (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-4xl glass rounded-2xl p-4 flex justify-around items-center z-50">
    {[
      { id: 'home', icon: ICONS.Home, label: 'Home' },
      { id: 'listing', icon: ICONS.Search, label: 'Shop' },
      { id: 'basket', icon: ICONS.Zap, label: 'AI Basket' },
      { id: 'health', icon: ICONS.Flame, label: 'Health' },
      { id: 'profile', icon: ICONS.User, label: 'Profile' },
    ].map((item) => (
      <button 
        key={item.id}
        onClick={() => setScreen(item.id as Screen)}
        className={`flex flex-col items-center gap-1 transition-all ${active === item.id ? 'text-primary scale-110' : 'text-ink/40'}`}
      >
        <item.icon size={24} strokeWidth={active === item.id ? 2.5 : 2} />
        <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
      </button>
    ))}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: any) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" 
        />
        <motion.div 
          initial={{ y: '100%' }} 
          animate={{ y: 0 }} 
          exit={{ y: '100%' }} 
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[3rem] z-[70] shadow-2xl max-h-[80vh] flex flex-col"
        >
          <div className="flex justify-between items-center mb-6 px-8 pt-8 flex-shrink-0">
            <h3 className="text-2xl font-black">{title}</h3>
            <button onClick={onClose} className="w-10 h-10 bg-bg rounded-full flex items-center justify-center">
              <ICONS.Plus className="rotate-45" size={24} />
            </button>
          </div>
          <div className="overflow-y-auto px-8 pb-8 flex-1">
            {children}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

export default function App() {
  const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
    merchantName: 'FreshFlow',
    upiId: '',
    qrImage: ''
  };

  const [screen, setScreen] = useState<Screen>('splash');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [priceRange, setPriceRange] = useState([0, 10000]);
  const [showFilters, setShowFilters] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Real Data States
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Modals
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState(false);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [newAddress, setNewAddress] = useState({ type: 'Home', details: '' });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({ type: 'Visa', details: '', expiry: '' });
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState<any>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ 
    photoURL: '',
    name: '', 
    phone: '', 
    street: '', 
    landmark: '', 
    city: '', 
    district: '', 
    pinCode: '',
    location: null as { lat: number, lng: number } | null
  });
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: '', type: '', image: '' });
  const [isBulkImportVendorModalOpen, setIsBulkImportVendorModalOpen] = useState(false);
  const [bulkVendorJson, setBulkVendorJson] = useState('');
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(DEFAULT_PAYMENT_CONFIG);
  const [isSavingPaymentConfig, setIsSavingPaymentConfig] = useState(false);

  const razorpayKeyId = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID || 'rzp_test_SJ47gyjCKEIpt2';

  const ORDER_STATUSES = ['Processing', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

  const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const onResize = () => setIsDesktopViewport(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [selectedDiet, setSelectedDiet] = useState('Keto');
  const [couponCode, setCouponCode] = useState('');
  const [isCouponApplied, setIsCouponApplied] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [basketPrompt, setBasketPrompt] = useState('');
  const [isGeneratingBasket, setIsGeneratingBasket] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);

  const generateBasket = async () => {
    if (!basketPrompt.trim()) return;
    setIsGeneratingBasket(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I want to cook: ${basketPrompt}. Based on these available products: ${JSON.stringify(PRODUCTS.map(p => ({ id: p.id, name: p.name, category: p.category, description: p.description })))}. Suggest which products I should buy to fulfill this request. Return ONLY a JSON array of product IDs.`,
        config: {
          systemInstruction: "You are a helpful grocery shopping assistant. Given a cooking request and a list of available products, suggest the best products to buy to fulfill the request. Return only the JSON array of product IDs.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER }
          }
        }
      });
      
      const suggestedIds = JSON.parse(response.text || "[]");
      const suggestedProducts = PRODUCTS.filter(p => suggestedIds.includes(p.id));
      setAiSuggestions(suggestedProducts);
    } catch (error) {
      console.error("AI Generation failed", error);
    } finally {
      setIsGeneratingBasket(false);
    }
  };

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    setSearchQuery(value);
    setShowSearchSuggestions(true);
  };

  const handleSearchSubmit = (query: string) => {
    if (query.trim()) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    }
    setShowSearchSuggestions(false);
  };

  const getCategoryFilterCounts = () => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const counts: any = {};
    
    categories.forEach(cat => {
      const count = products.filter(p => {
        const productName = String(p?.name || '').toLowerCase();
        const productCategory = String(p?.category || '').toLowerCase();
        const productDescription = String(p?.description || '').toLowerCase();
        const productPrice = Number(p?.price || 0);
        
        const matchesSearch = !normalizedQuery || productName.includes(normalizedQuery) || productCategory.includes(normalizedQuery) || productDescription.includes(normalizedQuery);
        const matchesCategory = productCategory === cat.name.toLowerCase();
        const matchesPrice = productPrice >= priceRange[0] && productPrice <= priceRange[1];
        
        return matchesSearch && matchesCategory && matchesPrice;
      }).length;
      counts[cat.name] = count;
    });
    
    return counts;
  };

  // --- Effects ---
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = doc(db, 'users', currentUser.uid);
        
        // Listen for profile changes
        unsubscribeProfile = onSnapshot(userDoc, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfile(data);
            setWishlist(data.wishlist || []);
            if (screen === 'splash' || screen === 'login') {
              setScreen('home');
            }
          } else {
            // Create profile if it doesn't exist
            const newProfile = {
              uid: currentUser.uid,
              name: currentUser.displayName || 'User',
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              role: currentUser.email === 'manikandanprabhu37@gmail.com' ? 'admin' : 'user',
              points: 0,
              vouchers: 0,
              addresses: [],
              paymentMethods: []
            };
            setDoc(userDoc, newProfile).catch(err => 
              handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`)
            );
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });

      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        setProfile(null);
        if (screen !== 'splash' && screen !== 'onboarding') {
          setScreen('login');
        }
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Data Fetching and Seeding
  useEffect(() => {
    if (!isAuthReady) return;

    let productsUnsubscribe: () => void;
    let ordersUnsubscribe: () => void;
    let usersUnsubscribe: () => void;
    let categoriesUnsubscribe: () => void;
    let vendorsUnsubscribe: () => void;
    let subscriptionsUnsubscribe: () => void;
    let paymentConfigUnsubscribe: () => void;

    const fetchData = async () => {
      setLoadingData(true);
      try {
        // 1. Fetch Products (Public)
        productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
          const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setProducts(productsData);
          
          // Seed if empty AND user is admin
          if (productsData.length === 0 && profile?.role === 'admin') {
            seedInitialData();
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

        // 2. Fetch Categories (Public)
        categoriesUnsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
          const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setCategories(categoriesData);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'categories'));

        // Fetch Vendors (Public)
        vendorsUnsubscribe = onSnapshot(collection(db, 'vendors'), (snapshot) => {
          const vendorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setVendors(vendorsData);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'vendors'));

        paymentConfigUnsubscribe = onSnapshot(doc(db, 'app_settings', 'payment_config'), (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<PaymentConfig>;
            setPaymentConfig({
              merchantName: data.merchantName || DEFAULT_PAYMENT_CONFIG.merchantName,
              upiId: data.upiId || '',
              qrImage: data.qrImage || ''
            });
          } else {
            setPaymentConfig(DEFAULT_PAYMENT_CONFIG);
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, 'app_settings/payment_config'));

        // 3. Authenticated Data
        if (user) {
          // Fetch Orders
          // Admins and vendors see all, users see theirs
          const ordersRef = collection(db, 'orders');
          const ordersQuery = (profile?.role === 'admin' || profile?.role === 'vendor')
            ? query(ordersRef) 
            : query(ordersRef, where('customer.uid', '==', user.uid));

          ordersUnsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(ordersData.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          }, (error) => handleFirestoreError(error, OperationType.GET, 'orders'));

          // Fetch Users (Admin only)
          if (profile?.role === 'admin') {
            usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
              const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setUsers(usersData);
            }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));
          }

          // Fetch Subscriptions
          subscriptionsUnsubscribe = onSnapshot(collection(db, `users/${user.uid}/subscriptions`), (snapshot) => {
            const subsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSubscriptions(subsData);
          }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/subscriptions`));
        }

        setLoadingData(false);
      } catch (error) {
        console.error("Error setting up listeners:", error);
        setLoadingData(false);
      }
    };

    fetchData();

    return () => {
      productsUnsubscribe?.();
      ordersUnsubscribe?.();
      usersUnsubscribe?.();
      categoriesUnsubscribe?.();
      vendorsUnsubscribe?.();
      subscriptionsUnsubscribe?.();
      paymentConfigUnsubscribe?.();
    };
  }, [isAuthReady, user, profile?.role]);

  const seedInitialData = async () => {
    console.log("Seeding initial data...");
    const initialProducts = [
      { name: 'Fresh Strawberries', price: 499, category: 'fruits', unit: '500g', image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&q=80&w=200', rating: 4.8, reviews: 124, description: 'Sweet and juicy organic strawberries.' },
      { name: 'Organic Bananas', price: 120, category: 'fruits', unit: '1kg', image: 'https://images.unsplash.com/photo-1603833665858-e81b1c7e4460?auto=format&fit=crop&q=80&w=200', rating: 4.5, reviews: 89, description: 'Fresh organic bananas from local farms.' },
      { name: 'Green Broccoli', price: 250, category: 'vegetables', unit: '500g', image: 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&q=80&w=200', rating: 4.7, reviews: 56, description: 'Crispy and fresh green broccoli.' },
      { name: 'Red Bell Pepper', price: 150, category: 'vegetables', unit: '1pc', image: 'https://images.unsplash.com/photo-1563565312-82ca213b70ec?auto=format&fit=crop&q=80&w=200', rating: 4.6, reviews: 42, description: 'Sweet and crunchy red bell pepper.' },
      { name: 'Whole Milk', price: 350, category: 'dairy', unit: '1L', image: 'https://images.unsplash.com/photo-1563636619-e9107da5a1bb?auto=format&fit=crop&q=80&w=200', rating: 4.9, reviews: 210, description: 'Fresh whole milk from grass-fed cows.' },
      { name: 'Greek Yogurt', price: 500, category: 'dairy', unit: '500g', image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&q=80&w=200', rating: 4.8, reviews: 156, description: 'Creamy and high-protein greek yogurt.' },
    ];

    const initialCategories = [
      { name: 'Fruits', icon: 'Apple', slug: 'fruits' },
      { name: 'Vegetables', icon: 'Carrot', slug: 'vegetables' },
      { name: 'Dairy', icon: 'Milk', slug: 'dairy' },
      { name: 'Bakery', icon: 'Croissant', slug: 'bakery' },
      { name: 'Meat', icon: 'Beef', slug: 'meat' },
    ];

    try {
      for (const p of initialProducts) {
        await addDoc(collection(db, 'products'), { ...p, createdAt: serverTimestamp() });
      }
      for (const c of initialCategories) {
        await addDoc(collection(db, 'categories'), { ...c, createdAt: serverTimestamp() });
      }
      console.log("Seeding complete!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seeding');
    }
  };

  useEffect(() => {
    if (screen === 'splash') {
      const timer = setTimeout(() => {
        if (isAuthReady) {
          setScreen(user ? 'home' : 'onboarding');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [screen, isAuthReady, user]);

  // Sync cart with Firestore if user is logged in (optional, but good for "live" feel)
  // For now, we'll keep it local but handle checkout persistence.

  // --- Handlers ---
  const handleSaveAddress = async () => {
    if (!user || !profile) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      let updatedAddresses = [...(profile.addresses || [])];
      
      if (editingAddress !== null) {
        updatedAddresses[editingAddress] = newAddress;
      } else {
        updatedAddresses.push(newAddress);
      }

      await updateDoc(userRef, { addresses: updatedAddresses });
      setIsAddressModalOpen(false);
      setEditingAddress(null);
      setNewAddress({ type: 'Home', details: '' });
      showToast('Address saved');
    } catch (error) {
      console.error(error);
      showToast('Failed to save address. Check Firestore rules.', 'error');
    }
  };

  const handleDeleteAddress = async (index: number) => {
    if (!user || !profile) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedAddresses = (profile.addresses || []).filter((_: any, i: number) => i !== index);
      await updateDoc(userRef, { addresses: updatedAddresses });
      showToast('Address deleted');
    } catch (error) {
      console.error(error);
      showToast('Failed to delete address', 'error');
    }
  };

  const handleSavePayment = async () => {
    if (!user || !profile) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedPayments = [...(profile.paymentMethods || []), newPayment];
      await updateDoc(userRef, { paymentMethods: updatedPayments });
      setIsPaymentModalOpen(false);
      setNewPayment({ type: 'Visa', details: '', expiry: '' });
      showToast('Payment method saved');
    } catch (error) {
      console.error(error);
      showToast('Failed to save payment method', 'error');
    }
  };

  const handleDeletePayment = async (index: number) => {
    if (!user || !profile) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedPayments = (profile.paymentMethods || []).filter((_: any, i: number) => i !== index);
      await updateDoc(userRef, { paymentMethods: updatedPayments });
      showToast('Payment method removed');
    } catch (error) {
      console.error(error);
      showToast('Failed to remove payment method', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      setScreen('login');
      return;
    }
    try {
      const userRef = doc(db, 'users', user.uid);
      const newWishlist = wishlist.includes(productId)
        ? wishlist.filter(id => id !== productId)
        : [...wishlist, productId];
      
      setWishlist(newWishlist); // Optimistic update
      await updateDoc(userRef, { wishlist: newWishlist });
      showToast(wishlist.includes(productId) ? 'Removed from wishlist' : 'Added to wishlist');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const addToCart = (productId: string, quantity: number = 1, unit: string = '1kg') => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId && item.unit === unit);
      if (existing) {
        return prev.map(item => item.productId === productId && item.unit === unit ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prev, { productId, quantity, unit }];
    });
    showToast('Added to cart');
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const product = products.find(p => p.id === item.productId);
      return total + (product?.price || 0) * item.quantity;
    }, 0);
  }, [cart, products]);

  const isManualPaymentMethod = (paymentType?: string) => ['UPI', 'QR'].includes(paymentType || '');

  const loadRazorpayScript = async (): Promise<boolean> => {
    if (window.Razorpay) return true;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSavePaymentConfig = async () => {
    if (!user || profile?.role !== 'admin') return;

    if (!paymentConfig.upiId.trim()) {
      showToast('Please enter UPI ID', 'error');
      return;
    }

    setIsSavingPaymentConfig(true);
    try {
      await setDoc(
        doc(db, 'app_settings', 'payment_config'),
        {
          merchantName: paymentConfig.merchantName.trim() || 'FreshFlow',
          upiId: paymentConfig.upiId.trim(),
          qrImage: paymentConfig.qrImage || '',
          updatedBy: user.uid,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      showToast('Payment settings saved');
    } catch (error) {
      console.error(error);
      showToast('Failed to save payment settings. Deploy Firestore rules.', 'error');
    } finally {
      setIsSavingPaymentConfig(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    let result = products.filter(p => {
      const productName = String(p?.name || '').toLowerCase();
      const productCategory = String(p?.category || '').toLowerCase();
      const productDescription = String(p?.description || '').toLowerCase();
      const productPrice = Number(p?.price || 0);

      const matchesSearch =
        !normalizedQuery ||
        productName.includes(normalizedQuery) ||
        productCategory.includes(normalizedQuery) ||
        productDescription.includes(normalizedQuery);
      const matchesCategory =
        selectedCategory === 'All' ||
        productCategory === selectedCategory.toLowerCase();
      const matchesPrice = productPrice >= priceRange[0] && productPrice <= priceRange[1];
      return matchesSearch && matchesCategory && matchesPrice;
    });

    if (sortBy === 'price_asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return result;
  }, [searchQuery, selectedCategory, products, sortBy, priceRange]);

  // --- Screen Components ---

  const SplashScreen = () => (
    <div className="h-screen flex flex-col items-center justify-center gradient-primary text-white overflow-hidden">
      <motion.div 
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 12 }}
        className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-6"
      >
        <ICONS.ShoppingCart size={64} className="text-primary" />
      </motion.div>
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-4xl font-black tracking-tighter"
      >
        FreshFlow
      </motion.h1>
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ delay: 0.8 }}
        className="text-lg font-medium mt-2"
      >
        Smart Grocery, Smarter Life
      </motion.p>
      <div className="absolute bottom-20">
        <div className="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-full h-full bg-white"
          />
        </div>
      </div>
    </div>
  );

  const OnboardingScreen = () => {
    const steps = [
      { title: 'AI Smart Shopping', desc: 'Our AI predicts your needs and suggests the best products for your health.', icon: ICONS.Zap },
      { title: 'Fast Delivery', desc: 'Get your groceries delivered to your doorstep in under 15 minutes.', icon: ICONS.Truck },
      { title: 'Personalized Experience', desc: 'Customized diet plans and nutritional tracking just for you.', icon: ICONS.Heart },
    ];
    const step = steps[onboardingStep];

    return (
      <div className="h-screen bg-white p-8 flex flex-col justify-between">
        <div className="flex justify-end">
          <button onClick={() => setScreen('login')} className="text-ink/40 font-bold uppercase tracking-widest text-sm">Skip</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div 
            key={onboardingStep}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-64 h-64 bg-primary/10 rounded-full flex items-center justify-center mb-12"
          >
            <step.icon size={120} className="text-primary animate-float" />
          </motion.div>
          <motion.h2 
            key={`t-${onboardingStep}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl font-black mb-4"
          >
            {step.title}
          </motion.h2>
          <motion.p 
            key={`d-${onboardingStep}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-ink/60 leading-relaxed"
          >
            {step.desc}
          </motion.p>
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex justify-center gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === onboardingStep ? 'w-8 bg-primary' : 'w-2 bg-primary/20'}`} />
            ))}
          </div>
          <Button onClick={() => onboardingStep < 2 ? setOnboardingStep(s => s + 1) : setScreen('login')}>
            {onboardingStep === 2 ? 'Get Started' : 'Next'}
          </Button>
        </div>
      </div>
    );
  };

  const LoginScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');

    const handleGoogleLogin = async () => {
      setIsLoading(true);
      setError('');
      try {
        await loginWithGoogle();
        // Redirection is handled by onAuthStateChanged + Splash/Auth check
      } catch (err: any) {
        setError(err.message || 'Failed to login with Google');
        setIsLoading(false);
      }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        if (isSignUp) {
          const userCredential = await signUpWithEmail(email, password);
          if (name && userCredential.user) {
            await updateProfile(userCredential.user, { displayName: name });
          }
        } else {
          await loginWithEmail(email, password);
        }
        // Redirection handled by onAuthStateChanged
      } catch (err: any) {
        console.error("Auth error:", err);
        setError(err.message || 'Authentication failed');
        setIsLoading(false);
      }
    };

    return (
      <div className="h-screen bg-bg p-8 flex flex-col justify-center overflow-y-auto">
        <div className="mb-8">
          <h2 className="text-4xl font-black mb-2">{isSignUp ? 'Create Account' : 'Welcome Back!'}</h2>
          <p className="text-ink/60">{isSignUp ? 'Join our smart shopping community today.' : 'Sign in to continue your smart shopping journey.'}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-sm font-bold mb-6 text-center">
            {error}
          </div>
        )}

        <Card className="flex flex-col gap-4 p-6">
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-2">Full Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe" 
                  className="bg-bg p-4 rounded-2xl outline-none focus:ring-2 ring-primary/20 transition-all" 
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-2">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com" 
                className="bg-bg p-4 rounded-2xl outline-none focus:ring-2 ring-primary/20 transition-all" 
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-2">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-bg p-4 pr-12 rounded-2xl outline-none focus:ring-2 ring-primary/20 transition-all" 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/50 hover:text-primary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <ICONS.EyeOff size={18} /> : <ICONS.Eye size={18} />}
                </button>
              </div>
            </div>
            <Button disabled={isLoading} type="submit">
              {isLoading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </Button>
          </form>

          <div className="flex items-center gap-4 my-2">
            <div className="flex-1 h-px bg-black/5" />
            <span className="text-xs font-bold text-ink/20">OR</span>
            <div className="flex-1 h-px bg-black/5" />
          </div>
          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="flex items-center justify-center gap-3 p-4 border-2 border-black/5 rounded-2xl font-bold hover:bg-black/5 transition-all disabled:opacity-50"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            {isLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </Card>
        <p className="text-center mt-8 text-sm text-ink/40">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"} 
          <button 
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            className="text-primary font-bold ml-1"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    );
  };

  const CategoryIcon = ({ name, size = 24 }: { name: string, size?: number }) => {
    const Icon = (ICONS as any)[name] || ICONS.Package;
    return <Icon size={size} />;
  };

  const HomeScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-bold text-ink/40 uppercase tracking-widest">Delivery to</p>
          <div className="flex items-center gap-1 cursor-pointer" onClick={() => setScreen('addresses')}>
            <ICONS.MapPin size={16} className="text-primary" />
            <span className="font-bold truncate max-w-[150px]">
              {profile?.addresses?.[0] ? `${profile.addresses[0].type}, ${profile.addresses[0].details}` : 'Select Address'}
            </span>
            <ICONS.ChevronRight size={16} className="text-ink/40" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setScreen('cart')} className="relative w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-secondary text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {cart.length}
              </span>
            )}
          </button>
          <button onClick={() => setIsNotificationsOpen(true)} className="relative w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.Bell size={20} />
            {profile?.notifications?.some((n: any) => !n.read) && (
              <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <ICONS.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" size={20} />
        <input 
          type="text" 
          value={searchInput}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          placeholder="Search fresh groceries..." 
          autoComplete="off"
          className="w-full bg-white p-4 pl-12 pr-24 rounded-2xl shadow-sm border border-black/5 outline-none focus:ring-2 ring-primary/20"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-3 text-primary">
          <ICONS.Mic size={20} className="cursor-pointer" onClick={() => setIsVoiceSearchOpen(true)} />
          <ICONS.Camera size={20} className="cursor-pointer" onClick={() => setIsImageSearchOpen(true)} />
        </div>
      </div>

      {searchInput.trim() ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xl font-black">Search Results</h4>
            <button onClick={() => setScreen('listing')} className="text-primary font-bold text-sm">Open in Shop</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {filteredProducts.length > 0 ? filteredProducts.slice(0, 6).map(product => (
              <Card key={product.id} className="flex flex-col gap-3 group">
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={product.image}
                    className="w-full aspect-square object-cover transition-transform group-hover:scale-110"
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    onClick={() => { setSelectedProduct(product); setScreen('detail'); }}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold truncate">{product.name}</p>
                  <p className="text-xs text-ink/40">{product.unit}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-lg font-black text-primary">₹{product.price}</p>
                    <button onClick={() => addToCart(product.id)} className="w-8 h-8 gradient-primary text-white rounded-lg flex items-center justify-center shadow-md active:scale-90 transition-all">
                      <ICONS.Plus size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            )) : (
              <div className="col-span-2 text-center py-10">
                <p className="text-ink/40 font-bold">No products found</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>

      {/* Banner */}
      <div className="gradient-primary rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="relative z-10">
          <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Limited Offer</span>
          <h3 className="text-2xl font-black mt-2">Get 50% OFF</h3>
          <p className="text-white/80 text-sm mb-4">On your first AI-suggested basket</p>
          <Button variant="secondary" className="py-2 px-4 text-sm">Claim Now</Button>
        </div>
        <ICONS.Zap size={120} className="absolute -right-4 -bottom-4 text-white/10 rotate-12" />
      </div>

      {/* Categories */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-xl font-black">Categories</h4>
          <button onClick={() => setScreen('listing')} className="text-primary font-bold text-sm">View All</button>
        </div>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
          {categories.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => { setSelectedCategory(cat.slug); setScreen('listing'); }}
              className="flex flex-col items-center gap-2 min-w-[80px]"
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${cat.color || 'bg-bg text-primary'}`}>
                <CategoryIcon name={cat.icon} size={28} />
              </div>
              <span className="text-xs font-bold">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Reorder */}
      <div>
        <h4 className="text-xl font-black mb-4">Quick Reorder</h4>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
          {products.slice(0, 3).map(product => (
            <Card key={product.id} className="min-w-[160px] flex flex-col gap-2">
              <img src={product.image} className="w-full h-24 object-cover rounded-xl" alt={product.name} referrerPolicy="no-referrer" />
              <div>
                <p className="text-xs font-bold truncate">{product.name}</p>
                <p className="text-primary font-black">₹{product.price}</p>
              </div>
              <button onClick={() => addToCart(product.id)} className="w-full py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all">
                Add Again
              </button>
            </Card>
          ))}
        </div>
      </div>

      {/* AI Recommendations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ICONS.Zap className="text-secondary" size={20} />
            <h4 className="text-xl font-black">AI Recommendations</h4>
          </div>
          <button onClick={() => setIsRewardModalOpen(true)} className="flex items-center gap-1 text-secondary font-bold text-sm bg-secondary/10 px-3 py-1 rounded-full">
            <ICONS.Gift size={14} />
            Spin & Win
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {products.slice(0, 4).map(product => (
            <Card key={product.id} className="flex flex-col gap-3 group">
              <div className="relative overflow-hidden rounded-2xl">
                <img 
                  src={product.image} 
                  className="w-full aspect-square object-cover transition-transform group-hover:scale-110" 
                  alt={product.name} 
                  referrerPolicy="no-referrer"
                  onClick={() => { setSelectedProduct(product); setScreen('detail'); }}
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
                  className={`absolute top-2 right-2 w-8 h-8 glass rounded-full flex items-center justify-center transition-all ${wishlist.includes(product.id) ? 'text-red-500' : 'text-ink/40'}`}
                >
                  <ICONS.Heart size={16} fill={wishlist.includes(product.id) ? "currentColor" : "none"} />
                </button>
              </div>
              <div>
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold truncate flex-1">{product.name}</p>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-secondary">
                    <ICONS.Star size={10} fill="currentColor" />
                    {product.rating}
                  </div>
                </div>
                <p className="text-xs text-ink/40">{product.unit}</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-lg font-black text-primary">₹{product.price}</p>
                  <button onClick={() => addToCart(product.id)} className="w-8 h-8 gradient-primary text-white rounded-lg flex items-center justify-center shadow-md active:scale-90 transition-all">
                    <ICONS.Plus size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );

  const ListingScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { setScreen('home'); setSelectedCategory('All'); setSearchInput(''); setSearchQuery(''); }} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-2xl font-black">Shop All</h2>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.Settings size={20} className={showFilters ? 'text-primary' : 'text-ink'} />
        </button>
      </div>
      
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-4 overflow-hidden"
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-ink/60 uppercase">Sort By</h3>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {[
                  { id: 'relevance', label: 'Relevance' },
                  { id: 'price_asc', label: 'Price: Low to High' },
                  { id: 'price_desc', label: 'Price: High to Low' },
                  { id: 'rating', label: 'Top Rated' }
                ].map(sortOption => (
                  <button 
                    key={sortOption.id}
                    onClick={() => setSortBy(sortOption.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${sortBy === sortOption.id ? 'bg-primary text-white' : 'bg-white text-ink/40 border border-black/5'}`}
                  >
                    {sortOption.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-ink/60 uppercase">Price Range</h3>
                <span className="text-xs font-bold text-primary">₹{priceRange[0]} - ₹{priceRange[1]}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="10000" 
                step="100"
                value={priceRange[1]} 
                onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                className="w-full accent-primary"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <ICONS.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" size={18} />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          onFocus={() => setShowSearchSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearchSubmit(searchInput);
            } else if (e.key === 'Escape') {
              setShowSearchSuggestions(false);
            }
          }}
          placeholder="Search products in shop..."
          autoComplete="off"
          className="w-full bg-white p-3 pl-11 rounded-2xl shadow-sm border border-black/5 outline-none focus:ring-2 ring-primary/20 text-sm font-semibold"
        />
      </div>

      <div className="relative">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {['All', ...categories.map(c => c.name)].map(cat => {
            const filterCounts = getCategoryFilterCounts();
            const count = cat === 'All' ? filteredProducts.length : filterCounts[cat] || 0;
            return (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${selectedCategory === cat ? 'bg-primary text-white' : 'bg-white text-ink/40 border border-black/5'}`}
              >
                {cat}
                <span className={`px-2 py-0.5 rounded-full text-xs font-black ${selectedCategory === cat ? 'bg-white/20' : 'bg-black/5'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showSearchSuggestions && searchInput && (
        <div className="bg-white rounded-2xl shadow-lg border border-black/5 overflow-hidden" onMouseDown={(e) => e.preventDefault()}>
          {searchInput.length > 0 && recentSearches.length > 0 && (
            <div>
              <div className="px-4 py-2 border-b border-black/5 text-xs font-bold text-ink/40 uppercase bg-bg/50">
                Recent Searches
              </div>
              {recentSearches.map((search, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    setSearchInput(search);
                    setSearchQuery(search);
                    handleSearchSubmit(search);
                                      setShowSearchSuggestions(false);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg transition-all text-left border-b border-black/5 last:border-b-0"
                >
                  <ICONS.Clock size={16} className="text-ink/40" />
                  <span className="flex-1 text-sm font-bold">{search}</span>
                  <ICONS.ArrowUpRight size={14} className="text-ink/20" />
                </button>
              ))}
            </div>
          )}
          {searchInput.length > 0 && filteredProducts.length === 0 && (
            <div className="px-4 py-4 text-center">
              <p className="text-xs font-bold text-ink/40">No matching products</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-ink/40 uppercase">Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filteredProducts.length > 0 ? filteredProducts.map(product => (
          <Card key={product.id} className="flex flex-col gap-3">
            <img src={product.image} className="w-full aspect-square object-cover rounded-2xl" alt={product.name} referrerPolicy="no-referrer" onClick={() => { setSelectedProduct(product); setScreen('detail'); }} />
            <div>
              <p className="text-sm font-bold">{product.name}</p>
              <p className="text-xs text-ink/40">{product.unit}</p>
              <div className="flex justify-between items-center mt-2">
                <p className="text-lg font-black text-primary">₹{product.price}</p>
                <button onClick={() => addToCart(product.id)} className="w-8 h-8 gradient-primary text-white rounded-lg flex items-center justify-center">
                  <ICONS.Plus size={16} />
                </button>
              </div>
            </div>
          </Card>
        )) : (
          <div className="col-span-2 text-center py-12">
            <ICONS.Package size={64} className="text-ink/10 mx-auto mb-4" />
            <p className="text-ink/40 font-bold mb-2">No products found</p>
            <p className="text-xs text-ink/20 mb-6">Try different {searchQuery ? 'keywords' : 'filters'} or browse by category</p>
            {searchQuery && (
              <div className="flex gap-2 flex-wrap justify-center mb-6">
                <Button 
                  variant="outline" 
                  className="text-xs px-3 py-1"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    setShowSearchSuggestions(false);
                  }}
                >
                  Clear Search
                </Button>
                <Button 
                  variant="outline" 
                  className="text-xs px-3 py-1"
                  onClick={() => setSelectedCategory('All')}
                >
                  All Products
                </Button>
              </div>
            )}
            {recentSearches.length > 0 && (
              <div className="mt-6 pt-6 border-t border-black/5">
                <p className="text-xs font-bold text-ink/40 uppercase mb-3">Recent Searches</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {recentSearches.map((search, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setSearchInput(search);
                        setSearchQuery(search);
                        handleSearchSubmit(search);
                      }}
                      className="px-3 py-1 bg-bg rounded-full text-xs font-bold hover:bg-primary/10 transition-all"
                    >
                      {search}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const DetailScreen = () => {
    const [quantity, setQuantity] = useState(1);
    const [selectedUnit, setSelectedUnit] = useState(selectedProduct?.unit || '1kg');
    const product = selectedProduct || products[0];
    
    const getMultiplier = (unit: string) => {
      const toBase = (u: string) => {
        const val = parseFloat(u);
        if (u.endsWith('kg')) return val * 1000;
        if (u.endsWith('g')) return val;
        if (u.endsWith('L')) return val * 1000;
        if (u.endsWith('ml')) return val;
        return val;
      };
      
      const baseValue = toBase(product.unit || '1kg');
      const targetValue = toBase(unit);
      
      return targetValue / baseValue;
    };

    const multiplier = getMultiplier(selectedUnit);
    const calculatedPrice = Math.round(product.price * multiplier * quantity);

    if (!product) return <div className="p-8 text-center">Loading product...</div>;
    return (
      <div className="h-screen bg-white flex flex-col">
        <div className="relative h-[40vh]">
          <img src={product.image} className="w-full h-full object-cover" alt={product.name} referrerPolicy="no-referrer" />
          <div className="absolute top-8 left-6 right-6 flex justify-between">
            <button onClick={() => setScreen('home')} className="w-10 h-10 glass rounded-xl flex items-center justify-center">
              <ICONS.ChevronLeft size={20} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
              className={`w-10 h-10 glass rounded-xl flex items-center justify-center transition-all ${wishlist.includes(product.id) ? 'text-red-500' : 'text-ink/40'}`}
            >
              <ICONS.Heart size={20} fill={wishlist.includes(product.id) ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-bg -mt-8 rounded-t-[3rem] p-8 flex flex-col gap-6 shadow-2xl relative z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-black">{product.name}</h2>
              <select 
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="text-ink/40 font-bold bg-transparent outline-none"
              >
                {['100g', '200g', '250g', '500g', '1kg', '2kg', '500ml', '1L'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full flex items-center gap-1 font-bold text-sm">
              <ICONS.Star size={14} fill="currentColor" />
              {product.rating}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 bg-white p-4 rounded-2xl flex flex-col items-center gap-1">
              <ICONS.Flame className="text-orange-500" size={20} />
              <span className="text-xs font-bold text-ink/40 uppercase">Calories</span>
              <span className="font-black">{product.calories} kcal</span>
            </div>
            <div className="flex-1 bg-white p-4 rounded-2xl flex flex-col items-center gap-1">
              <ICONS.Dna className="text-blue-500" size={20} />
              <span className="text-xs font-bold text-ink/40 uppercase">Protein</span>
              <span className="font-black">{product.protein}</span>
            </div>
          </div>

          <div>
            <h4 className="font-black mb-2">Description</h4>
            <p className="text-ink/60 leading-relaxed text-sm">
              {product.description}
            </p>
          </div>

          <div className="mt-auto flex items-center justify-between gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink/40 uppercase">Total Price</span>
              <span className="text-3xl font-black text-primary">₹{calculatedPrice}</span>
            </div>
            <div className="flex items-center gap-2 bg-bg rounded-xl p-1">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">-</button>
              <span className="font-black w-8 text-center">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">+</button>
            </div>
            <Button onClick={() => addToCart(product.id, quantity, selectedUnit)} className="flex-1 py-4">Add to Cart</Button>
          </div>
        </div>
      </div>
    );
  };

  const BasketScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black flex items-center gap-2">
          AI Smart Basket <ICONS.Zap className="text-secondary" />
        </h2>
        <p className="text-ink/60">Tell us what you want to cook or your diet goals, and we'll fill your basket!</p>
      </div>

      <Card className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black uppercase text-ink/40">What's on your mind?</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={basketPrompt}
              onChange={(e) => setBasketPrompt(e.target.value)}
              placeholder="e.g. Italian dinner for 4, Keto snacks..." 
              autoComplete="off"
              className="flex-1 bg-bg p-4 rounded-2xl outline-none text-sm font-bold border-2 border-transparent focus:border-primary/20 transition-all"
            />
            <button 
              onClick={generateBasket}
              disabled={isGeneratingBasket || !basketPrompt.trim()}
              className="w-14 h-14 gradient-primary text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {isGeneratingBasket ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ICONS.Zap size={24} />
              )}
            </button>
          </div>
        </div>
      </Card>

      {aiSuggestions.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-black">AI Suggestions</h4>
            <button 
              onClick={() => {
                aiSuggestions.forEach(p => addToCart(p.id));
                setAiSuggestions([]);
                setBasketPrompt('');
              }}
              className="text-xs font-black text-primary uppercase"
            >
              Add All to Cart
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {aiSuggestions.map(product => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={product.id} 
                className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-black/5 shadow-sm"
              >
                <img src={product.image} className="w-16 h-16 rounded-xl object-cover" alt={product.name} referrerPolicy="no-referrer" />
                <div className="flex-1">
                  <p className="font-bold text-sm">{product.name}</p>
                  <p className="text-xs text-primary font-black">₹{product.price}</p>
                </div>
                <button onClick={() => addToCart(product.id)} className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                  <ICONS.Plus size={20} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h4 className="font-black">Predicted for You</h4>
        {products.slice(0, 3).map(product => (
          <div key={product.id} className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-black/5">
            <img src={product.image} className="w-16 h-16 rounded-xl object-cover" alt={product.name} referrerPolicy="no-referrer" />
            <div className="flex-1">
              <p className="font-bold text-sm">{product.name}</p>
              <p className="text-xs text-ink/40">Based on your history</p>
            </div>
            <button onClick={() => addToCart(product.id)} className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <ICONS.Plus size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const CartScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('home')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Your Cart</h2>
      </div>

      {cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
          <ICONS.ShoppingCart size={80} className="text-ink/10 mb-4" />
          <h3 className="text-xl font-bold">Your cart is empty</h3>
          <p className="text-ink/40 mb-8">Add some fresh items to get started!</p>
          <Button onClick={() => setScreen('listing')}>Start Shopping</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {cart.map(item => {
              const product = products.find(p => p.id === item.productId);
              if (!product) return null;
              return (
                <div key={item.productId} className="flex items-center gap-4 bg-white p-4 rounded-3xl border border-black/5">
                  <img src={product.image} className="w-20 h-20 rounded-2xl object-cover" alt={product.name} referrerPolicy="no-referrer" />
                  <div className="flex-1">
                    <p className="font-bold">{product.name}</p>
                    <p className="text-primary font-black">₹{product.price}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="w-8 h-8 bg-bg rounded-lg flex items-center justify-center"><ICONS.Minus size={14} /></button>
                      <span className="font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.productId, 1)} className="w-8 h-8 bg-bg rounded-lg flex items-center justify-center"><ICONS.Plus size={14} /></button>
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(item.productId)} className="text-red-500 p-2"><ICONS.Trash2 size={20} /></button>
                </div>
              );
            })}
          </div>

          <Card className="flex flex-col gap-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Enter Coupon Code" 
                className="flex-1 bg-bg p-3 rounded-xl outline-none text-sm font-bold"
              />
              <Button 
                onClick={() => { if(couponCode.toUpperCase() === 'FRESH50') setIsCouponApplied(true); }} 
                variant="outline" 
                className="px-4 py-2 text-xs"
                disabled={isCouponApplied}
              >
                {isCouponApplied ? 'Applied' : 'Apply'}
              </Button>
            </div>
            {isCouponApplied && (
              <p className="text-xs text-primary font-bold">Coupon FRESH50 applied! 50% discount on total.</p>
            )}
            <div className="flex justify-between">
              <span className="text-ink/40 font-bold">Subtotal</span>
              <span className="font-bold">₹{cartTotal.toFixed(2)}</span>
            </div>
            {isCouponApplied && (
              <div className="flex justify-between">
                <span className="text-ink/40 font-bold">Discount (50%)</span>
                <span className="font-bold text-red-500">-₹{(cartTotal * 0.5).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink/40 font-bold">Delivery Fee</span>
              <span className="font-bold text-primary">FREE</span>
            </div>
            <div className="h-px bg-black/5" />
            <div className="flex justify-between items-center">
              <span className="text-xl font-black">Total</span>
              <span className="text-2xl font-black text-primary">
                ₹{(isCouponApplied ? cartTotal * 0.5 : cartTotal).toFixed(2)}
              </span>
            </div>
            <Button onClick={() => setScreen('checkout')} className="w-full py-4 mt-2">Proceed to Checkout</Button>
          </Card>
        </>
      )}
    </div>
  );

  const VALID_COUPONS: Record<string, { type: 'percent' | 'flat', value: number, minOrder?: number }> = {
    'FRESH50': { type: 'percent', value: 50 },
    'SAVE100': { type: 'flat', value: 100, minOrder: 500 },
    'WELCOME20': { type: 'percent', value: 20 }
  };

  const handleApplyCoupon = () => {
    const code = couponCode.toUpperCase();
    const coupon = VALID_COUPONS[code];
    
    if (!coupon) {
      showToast('Invalid coupon code', 'error');
      setIsCouponApplied(false);
      setDiscountAmount(0);
      return;
    }

    if (coupon.minOrder && cartTotal < coupon.minOrder) {
      showToast(`Minimum order of ₹${coupon.minOrder} required for this coupon`, 'error');
      setIsCouponApplied(false);
      setDiscountAmount(0);
      return;
    }

    let discount = 0;
    if (coupon.type === 'percent') {
      discount = cartTotal * (coupon.value / 100);
    } else if (coupon.type === 'flat') {
      discount = coupon.value;
    }

    setDiscountAmount(discount);
    setIsCouponApplied(true);
    showToast(`Coupon ${code} applied successfully!`);
  };

  const removeCoupon = () => {
    setCouponCode('');
    setIsCouponApplied(false);
    setDiscountAmount(0);
    showToast('Coupon removed');
  };

  const CheckoutScreen = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedAddressIndex, setSelectedAddressIndex] = useState(-1);
    const [selectedPaymentIndex, setSelectedPaymentIndex] = useState(-1);
    const [selectedTimeSlot, setSelectedTimeSlot] = useState('15-20 Mins');
    const [orderName, setOrderName] = useState(profile?.name || user?.displayName || '');
    const [orderPhone, setOrderPhone] = useState('');
    const [usePoints, setUsePoints] = useState(false);

    const pointsToDiscount = usePoints ? Math.min(profile?.points || 0, cartTotal) : 0;
    const finalTotal = cartTotal - discountAmount - pointsToDiscount;

    const handlePlaceOrder = async () => {
      if (!user) {
        setScreen('login');
        return;
      }

      if (!orderName.trim()) {
        showToast('Please enter your name');
        return;
      }

      if (!orderPhone.trim()) {
        showToast('Please enter your phone number');
        return;
      }

      if (selectedAddressIndex === -1) {
        showToast('Please select a delivery address');
        return;
      }

      if (selectedPaymentIndex === -1) {
        showToast('Please select a payment method');
        return;
      }

      const addressesList = profile?.addresses?.length > 0
        ? profile.addresses
        : [{ type: 'Home', details: '123 Fresh Street, Green City, NY' }];

      const paymentMethodsList = [
        { type: 'Razorpay', details: 'Razorpay (Cards, UPI, Netbanking)' },
        { type: 'UPI', details: paymentConfig.upiId ? `Pay via UPI (${paymentConfig.upiId})` : 'Pay via UPI (Admin not configured)' },
        { type: 'QR', details: 'Scan QR and Pay' },
        { type: 'Cash', details: 'Cash on Delivery' }
      ];

      const selectedAddress = addressesList[selectedAddressIndex];
      const selectedPayment = paymentMethodsList[selectedPaymentIndex];

      setIsProcessing(true);
      try {
        if ((selectedPayment.type === 'UPI' || selectedPayment.type === 'QR') && !paymentConfig.upiId.trim()) {
          showToast('Admin has not configured UPI/QR yet', 'error');
          setIsProcessing(false);
          return;
        }

        let paymentStatus: 'Paid' | 'Pending' | 'Unpaid' = 'Pending';
        let paymentReference: string | null = null;

        if (selectedPayment.type === 'Razorpay') {
          const scriptLoaded = await loadRazorpayScript();
          if (!scriptLoaded || !window.Razorpay) {
            showToast('Unable to load Razorpay checkout', 'error');
            setIsProcessing(false);
            return;
          }

          const paymentId = await new Promise<string>((resolve, reject) => {
            const razorpay = new window.Razorpay({
              key: razorpayKeyId,
              amount: Math.max(100, Math.round(finalTotal * 100)),
              currency: 'INR',
              name: paymentConfig.merchantName || 'FreshFlow',
              description: 'FreshFlow Grocery Order',
              prefill: {
                name: orderName,
                contact: orderPhone,
                email: user.email || ''
              },
              theme: { color: '#0A9A5D' },
              handler: (response: any) => resolve(response?.razorpay_payment_id || `rzp_${Date.now()}`),
              modal: {
                ondismiss: () => reject(new Error('Razorpay payment cancelled'))
              }
            });

            razorpay.on('payment.failed', (response: any) => {
              reject(new Error(response?.error?.description || 'Razorpay payment failed'));
            });

            razorpay.open();
          });

          paymentStatus = 'Paid';
          paymentReference = paymentId;
          showToast('Razorpay payment successful!');
        } else if (selectedPayment.type === 'UPI' || selectedPayment.type === 'QR') {
          paymentStatus = 'Unpaid';
          showToast('Payment request created. Admin will verify and mark paid.');
        } else {
          paymentStatus = 'Pending';
        }

        const orderData = {
          customer: {
            uid: user.uid,
            name: orderName,
            phone: orderPhone,
            email: user.email,
            photoURL: user.photoURL
          },
          status: 'Processing',
          total: finalTotal,
          discountApplied: isCouponApplied ? { code: couponCode.toUpperCase(), amount: discountAmount } : null,
          items: cart.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
              productId: item.productId,
              name: product?.name,
              price: product?.price,
              quantity: item.quantity,
              unit: item.unit,
              image: product?.image
            };
          }),
          createdAt: serverTimestamp(),
          address: `${selectedAddress.type}: ${selectedAddress.details}`,
          paymentType: selectedPayment.type,
          paymentMethod: selectedPayment.details,
          paymentStatus,
          paymentReference,
          adminPaymentReviewRequired: isManualPaymentMethod(selectedPayment.type),
          paymentMeta: {
            upiId: paymentConfig.upiId || null,
            merchantName: paymentConfig.merchantName || 'FreshFlow'
          },
          timeSlot: selectedTimeSlot,
          pointsUsed: pointsToDiscount
        };

        await addDoc(collection(db, 'orders'), orderData);

        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          ordersCount: increment(1),
          points: increment(Math.floor(orderData.total / 100) * 10 - pointsToDiscount)
        });

        setCart([]);
        setScreen('tracking');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to place order';
        showToast(message, 'error');
      } finally {
        setIsProcessing(false);
      }
    };

    const addresses = profile?.addresses?.length > 0 
      ? profile.addresses 
      : [{ type: 'Home', details: '123 Fresh Street, Green City, NY' }];

    const paymentMethods = [
      { type: 'Razorpay', details: 'Razorpay (Cards, UPI, Netbanking)' },
      { type: 'UPI', details: paymentConfig.upiId ? `UPI ID: ${paymentConfig.upiId}` : 'UPI ID not configured by admin' },
      { type: 'QR', details: paymentConfig.qrImage ? 'Scan QR and pay to merchant' : 'QR not uploaded by admin' },
      { type: 'Cash', details: 'Cash on Delivery' }
    ];

    return (
      <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('cart')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-2xl font-black">Checkout</h2>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl border border-black/5">
            <h4 className="font-black">Contact Details</h4>
            <input 
              type="text" 
              placeholder="Name" 
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              className="bg-bg rounded-xl px-4 py-3 text-sm font-bold outline-none"
            />
            <input 
              type="tel" 
              placeholder="Phone Number" 
              value={orderPhone}
              onChange={(e) => setOrderPhone(e.target.value)}
              className="bg-bg rounded-xl px-4 py-3 text-sm font-bold outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-black">Delivery Address</h4>
              <button onClick={() => setScreen('addresses')} className="text-xs font-bold text-primary">Manage</button>
            </div>
            <div className="flex flex-col gap-3">
              {addresses.map((addr: any, i: number) => (
                <Card 
                  key={i} 
                  onClick={() => setSelectedAddressIndex(i)}
                  className={`flex items-center gap-4 border-2 transition-all ${selectedAddressIndex === i ? 'border-primary bg-primary/5' : 'border-transparent'}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedAddressIndex === i ? 'bg-primary text-white' : 'bg-bg text-primary'}`}>
                    {addr.type === 'Home' ? <ICONS.Home size={24} /> : <ICONS.Briefcase size={24} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{addr.type}</p>
                    <p className="text-xs text-ink/40">{addr.details}</p>
                  </div>
                  {selectedAddressIndex === i && <ICONS.CheckCircle className="text-primary" size={24} />}
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-black mb-4">Delivery Time</h4>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setSelectedTimeSlot('15-20 Mins')}
                className={`p-4 rounded-2xl border-2 font-bold text-center transition-all ${selectedTimeSlot === '15-20 Mins' ? 'border-primary bg-primary/5 text-primary' : 'border-black/5 bg-white text-ink/40'}`}
              >
                <p className="text-xs uppercase">Smart Suggestion</p>
                <p>15-20 Mins</p>
              </button>
              <button 
                onClick={() => setSelectedTimeSlot('Today, 2 PM - 4 PM')}
                className={`p-4 rounded-2xl border-2 font-bold text-center transition-all ${selectedTimeSlot === 'Today, 2 PM - 4 PM' ? 'border-primary bg-primary/5 text-primary' : 'border-black/5 bg-white text-ink/40'}`}
              >
                <p className="text-xs uppercase">Schedule</p>
                <p>Today, 2 PM - 4 PM</p>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-black">Payment Method</h4>
              <button onClick={() => setScreen('payment')} className="text-xs font-bold text-primary">Manage</button>
            </div>
            <div className="flex flex-col gap-3">
              {paymentMethods.map((method: any, i: number) => (
                <button 
                  key={i} 
                  onClick={() => setSelectedPaymentIndex(i)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentIndex === i ? 'border-primary bg-primary/5' : 'border-black/5 bg-white'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedPaymentIndex === i ? 'bg-primary text-white' : 'bg-bg text-primary'}`}>
                    {method.type === 'Razorpay' && <ICONS.CreditCard size={20} />}
                    {method.type === 'UPI' && <ICONS.Smartphone size={20} />}
                    {method.type === 'QR' && <ICONS.Camera size={20} />}
                    {method.type === 'Cash' && <ICONS.ShoppingBag size={20} />}
                  </div>
                  <span className={`font-bold ${selectedPaymentIndex === i ? 'text-ink' : 'text-ink/40'}`}>{method.details}</span>
                  {selectedPaymentIndex === i && <ICONS.CheckCircle className="text-primary ml-auto" size={20} />}
                </button>
              ))}
            </div>
            {selectedPaymentIndex !== -1 && paymentMethods[selectedPaymentIndex]?.type === 'UPI' && (
              <div className="mt-3 p-4 bg-primary/5 rounded-2xl border border-primary/20">
                <p className="text-xs font-black uppercase text-primary mb-1">UPI Payment</p>
                <p className="font-bold">UPI ID: {paymentConfig.upiId || 'Not configured'}</p>
                <p className="text-xs text-ink/50 mt-1">Pay to this UPI ID and place order. Admin will mark paid after receiving payment.</p>
              </div>
            )}
            {selectedPaymentIndex !== -1 && paymentMethods[selectedPaymentIndex]?.type === 'QR' && (
              <div className="mt-3 p-4 bg-primary/5 rounded-2xl border border-primary/20 flex flex-col gap-3 items-center">
                <p className="text-xs font-black uppercase text-primary">Scan QR and Pay</p>
                {paymentConfig.qrImage ? (
                  <img src={paymentConfig.qrImage} alt="Merchant QR" className="w-44 h-44 object-contain rounded-xl bg-white p-2 border border-black/5" />
                ) : (
                  <p className="text-xs text-red-500 font-bold">Admin has not uploaded QR yet.</p>
                )}
                <p className="text-xs text-ink/50 text-center">After payment, place order. Admin will verify and mark paid.</p>
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-black/5 flex flex-col gap-3">
            <h4 className="font-black text-sm">Have a Coupon?</h4>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Enter code (e.g. FRESH50)" 
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                disabled={isCouponApplied}
                className="flex-1 bg-bg rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              {isCouponApplied ? (
                <Button onClick={removeCoupon} variant="outline" className="text-red-500 border-red-200 hover:bg-red-50">Remove</Button>
              ) : (
                <Button onClick={handleApplyCoupon} disabled={!couponCode.trim()}>Apply</Button>
              )}
            </div>
            {isCouponApplied && (
              <p className="text-xs font-bold text-green-500 flex items-center gap-1">
                <ICONS.CheckCircle size={14} /> Coupon applied successfully
              </p>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-black/5 flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm">Use Points</h4>
              <p className="text-xs text-ink/40 font-bold">Available: {profile?.points || 0} points</p>
            </div>
            <div className="flex items-center gap-2">
              {usePoints && <span className="text-sm font-black text-primary">-₹{pointsToDiscount.toFixed(2)}</span>}
              <button 
                onClick={() => setUsePoints(!usePoints)}
                className={`w-12 h-6 rounded-full transition-colors ${usePoints ? 'bg-primary' : 'bg-ink/10'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${usePoints ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-ink/40 font-bold uppercase">Subtotal</span>
            <span className="font-black">₹{cartTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink/40 font-bold uppercase">Delivery</span>
            <span className="text-green-500 font-black">FREE</span>
          </div>
          {isCouponApplied && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold uppercase">Discount ({couponCode.toUpperCase()})</span>
              <span className="text-secondary font-black">-₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          {usePoints && (
            <div className="flex justify-between text-sm">
              <span className="text-primary font-bold uppercase">Points Discount</span>
              <span className="text-primary font-black">-₹{pointsToDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="h-px bg-black/5 my-1" />
          <div className="flex justify-between items-center">
            <span className="font-black text-lg">Total</span>
            <span className="text-2xl font-black text-primary">₹{finalTotal.toFixed(2)}</span>
          </div>
        </div>

        <Button 
          onClick={handlePlaceOrder} 
          disabled={isProcessing || cart.length === 0}
          className="w-full py-4 shadow-xl"
        >
          {isProcessing ? 'Processing...' : 'Place Order'}
        </Button>
      </div>
    );
  };

  const TrackingScreen = () => {
    const latestOrder = trackingOrderId ? orders.find(o => o.id === trackingOrderId) : orders[0];

    if (!latestOrder) {
      return (
        <div className="h-screen bg-bg flex flex-col items-center justify-center p-8 text-center">
          <ICONS.Package size={64} className="text-ink/10 mb-4" />
          <h3 className="text-xl font-black">No active orders</h3>
          <p className="text-ink/40 mb-8">You don't have any orders to track right now.</p>
          <Button onClick={() => setScreen('home')}>Go Shopping</Button>
        </div>
      );
    }

    const statusSteps = ORDER_STATUSES.filter(s => s !== 'Cancelled');
    const currentStepIndex = statusSteps.indexOf(latestOrder.status || 'Processing');
    const progress = ((currentStepIndex + 1) / statusSteps.length) * 100;

    return (
      <div className="h-screen bg-bg flex flex-col overflow-hidden">
        <div className="flex-1 relative">
          <div className="absolute inset-0 bg-blue-100 flex items-center justify-center">
            <div className="relative">
              <div className="w-64 h-64 bg-blue-200 rounded-full animate-pulse" />
              <ICONS.MapPin className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" size={48} />
              <motion.div 
                animate={{ x: [0, 100, 50, 0], y: [0, -50, -100, 0] }}
                transition={{ duration: 10, repeat: Infinity }}
                className="absolute top-1/2 left-1/2"
              >
                <ICONS.Truck className="text-secondary" size={32} />
              </motion.div>
            </div>
          </div>
          <button onClick={() => setScreen('orders')} className="absolute top-8 left-6 w-10 h-10 glass rounded-xl flex items-center justify-center z-10">
            <ICONS.ChevronLeft size={20} />
          </button>
        </div>
        <div className="bg-white rounded-t-[3rem] p-8 shadow-2xl flex flex-col gap-6 max-h-[60vh] overflow-y-auto">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-2xl font-black">
                {latestOrder.status === 'Delivered' ? 'Order Delivered' : `Order ${latestOrder.status}`}
              </h3>
              <p className="text-ink/40 font-bold">Order #FF-{latestOrder.id.slice(-6).toUpperCase()}</p>
            </div>
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <ICONS.Clock size={32} />
            </div>
          </div>
          
          <div className="flex flex-col gap-2 p-4 bg-bg rounded-2xl">
            <div className="flex justify-between text-sm">
              <span className="font-bold text-ink/60">Payment Status</span>
              <span className={`font-black uppercase ${latestOrder.paymentStatus === 'Paid' ? 'text-green-500' : 'text-orange-500'}`}>
                {latestOrder.paymentStatus || 'Pending'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold text-ink/60">Delivery Time</span>
              <span className="font-black text-primary">{latestOrder.timeSlot || 'Standard Delivery'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-6 mt-4">
            {statusSteps.map((step, i) => {
              const isCompleted = i <= currentStepIndex;
              const isCurrent = i === currentStepIndex;
              return (
                <div key={step} className="flex items-start gap-4 relative">
                  {i !== statusSteps.length - 1 && (
                    <div className={`absolute left-[11px] top-6 bottom-[-24px] w-0.5 ${isCompleted && !isCurrent ? 'bg-primary' : 'bg-bg'}`} />
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 mt-0.5 ${isCompleted ? 'bg-primary text-white' : 'bg-bg text-ink/20'}`}>
                    {isCompleted ? <ICONS.CheckCircle size={14} /> : <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-black ${isCompleted ? 'text-ink' : 'text-ink/40'}`}>{step}</span>
                    {isCurrent && <span className="text-xs text-primary font-bold">Currently here</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-6 border-t border-black/5">
            <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100" className="w-14 h-14 rounded-2xl object-cover" alt="Delivery Partner" />
            <div className="flex-1">
              <p className="font-black">Alex Johnson</p>
              <p className="text-xs text-ink/40">Your Delivery Partner</p>
            </div>
            <div className="flex gap-2">
              <button className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center"><ICONS.Smartphone size={20} /></button>
              <button className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center"><ICONS.Bell size={20} /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const HealthScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black flex items-center gap-2">
          Health Mode <ICONS.Flame className="text-orange-500" />
        </h2>
        <p className="text-ink/60">Personalized nutrition tracking and diet-based suggestions.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-orange-50 border-orange-100 p-6 flex flex-col items-center gap-2">
          <ICONS.Flame className="text-orange-500" size={32} />
          <span className="text-3xl font-black">1,240</span>
          <span className="text-xs font-bold text-ink/40 uppercase">Calories Today</span>
        </Card>
        <Card className="bg-blue-50 border-blue-100 p-6 flex flex-col items-center gap-2">
          <ICONS.Scale className="text-blue-500" size={32} />
          <span className="text-3xl font-black">68.5</span>
          <span className="text-xs font-bold text-ink/40 uppercase">Weight (kg)</span>
        </Card>
      </div>

      <div>
        <h4 className="font-black mb-4">Diet Plans</h4>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar">
          {['Keto', 'Vegan', 'Weight Loss', 'Muscle Gain'].map((diet) => (
            <button 
              key={diet} 
              onClick={() => setSelectedDiet(diet)}
              className={`px-6 py-4 rounded-3xl font-bold whitespace-nowrap transition-all ${selectedDiet === diet ? 'gradient-primary text-white shadow-lg' : 'bg-white border border-black/5 text-ink/40'}`}
            >
              {diet}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-black mb-4">Recommended for {selectedDiet}</h4>
        <div className="grid grid-cols-2 gap-4">
          {products.filter(p => {
            if (selectedDiet === 'Keto') return p.category === 'meat' || p.category === 'dairy';
            if (selectedDiet === 'Vegan') return p.category === 'fruits' || p.category === 'veg';
            if (selectedDiet === 'Weight Loss') return p.category === 'fruits' || p.category === 'veg';
            if (selectedDiet === 'Muscle Gain') return p.category === 'meat' || p.category === 'dairy';
            return true;
          }).map(product => (
            <Card key={product.id} className="flex flex-col gap-2">
              <img src={product.image} className="w-full h-24 object-cover rounded-xl" alt={product.name} referrerPolicy="no-referrer" />
              <p className="text-xs font-bold">{product.name}</p>
              <div className="flex justify-between items-center">
                <span className="text-primary font-black">₹{product.price}</span>
                <button onClick={() => addToCart(product.id)} className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center"><ICONS.Plus size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const SettingsScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Settings</h2>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h4 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-4 ml-2">Account</h4>
          <Card className="flex flex-col divide-y divide-black/5">
            <div 
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-black/5 transition-colors"
              onClick={() => {
                setEditProfileData({ 
                  photoURL: profile?.photoURL || '',
                  name: profile?.name || '', 
                  phone: profile?.phone || '',
                  street: profile?.street || '',
                  landmark: profile?.landmark || '',
                  city: profile?.city || '',
                  district: profile?.district || '',
                  pinCode: profile?.pinCode || '',
                  location: profile?.location || null
                });
                setIsEditProfileModalOpen(true);
              }}
            >
              <div className="flex items-center gap-3">
                <ICONS.User size={20} className="text-ink/40" />
                <span className="font-bold">Edit Profile</span>
              </div>
              <ICONS.ChevronRight size={18} className="text-ink/20" />
            </div>
            <div 
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-black/5 transition-colors"
              onClick={() => setIsNotificationsOpen(true)}
            >
              <div className="flex items-center gap-3">
                <ICONS.Bell size={20} className="text-ink/40" />
                <span className="font-bold">Notifications</span>
              </div>
              <div className="w-10 h-5 bg-primary rounded-full relative">
                <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
              </div>
            </div>
          </Card>
        </div>

        <div>
          <h4 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-4 ml-2">Preferences</h4>
          <Card className="flex flex-col divide-y divide-black/5">
            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <ICONS.Moon size={20} className="text-ink/40" />
                <span className="font-bold">Dark Mode</span>
              </div>
              <div 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-10 h-5 rounded-full relative transition-all cursor-pointer ${isDarkMode ? 'bg-primary' : 'bg-ink/10'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'right-1' : 'left-1'}`} />
              </div>
            </div>
            <div 
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-black/5 transition-colors"
              onClick={() => setIsLanguageModalOpen(true)}
            >
              <div className="flex items-center gap-3">
                <ICONS.Globe size={20} className="text-ink/40" />
                <span className="font-bold">Language</span>
              </div>
              <span className="text-xs font-bold text-primary">{selectedLanguage}</span>
            </div>
          </Card>
        </div>

        <Button variant="outline" className="text-red-500 border-red-500/20 hover:bg-red-50">Delete Account</Button>
      </div>
    </div>
  );
  const WishlistScreen = () => {
    const wishlistProducts = products.filter(p => wishlist.includes(p.id));
    return (
      <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('home')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-2xl font-black">My Wishlist</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {wishlistProducts.length > 0 ? wishlistProducts.map(product => (
            <Card key={product.id} className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-2xl">
                <img src={product.image} className="w-full aspect-square object-cover" alt={product.name} referrerPolicy="no-referrer" onClick={() => { setSelectedProduct(product); setScreen('detail'); }} />
                <button 
                  onClick={() => toggleWishlist(product.id)}
                  className="absolute top-2 right-2 w-8 h-8 glass rounded-full flex items-center justify-center text-red-500"
                >
                  <ICONS.Heart size={16} fill="currentColor" />
                </button>
              </div>
              <div>
                <p className="text-sm font-bold">{product.name}</p>
                <p className="text-xs text-ink/40">{product.unit}</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-lg font-black text-primary">₹{product.price}</p>
                  <button onClick={() => addToCart(product.id)} className="w-8 h-8 gradient-primary text-white rounded-lg flex items-center justify-center">
                    <ICONS.Plus size={16} />
                  </button>
                </div>
              </div>
            </Card>
          )) : (
            <div className="col-span-2 text-center py-20">
              <ICONS.Heart size={64} className="text-ink/10 mx-auto mb-4" />
              <p className="text-ink/40 font-bold">Your wishlist is empty</p>
              <Button onClick={() => setScreen('listing')} variant="outline" className="mt-4">Explore Products</Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SubscriptionScreen = () => {
    const handleSubscribe = async (plan: any) => {
      if (!user) {
        showToast('Please login to subscribe', 'error');
        setScreen('login');
        return;
      }
      try {
        await addDoc(collection(db, `users/${user.uid}/subscriptions`), {
          planId: plan.title,
          price: plan.price,
          items: plan.items,
          status: 'Active',
          startDate: serverTimestamp(),
        });
        showToast(`Successfully subscribed to ${plan.title}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/subscriptions`);
      }
    };

    const handleCancelSubscription = async (subId: string) => {
      if (!user) return;
      try {
        await updateDoc(doc(db, `users/${user.uid}/subscriptions`, subId), {
          status: 'Cancelled',
          endDate: serverTimestamp()
        });
        showToast('Subscription cancelled');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/subscriptions/${subId}`);
      }
    };

    return (
      <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-2xl font-black">Subscriptions</h2>
        </div>

        {subscriptions.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="font-black text-lg">My Active Plans</h3>
            {subscriptions.map((sub) => (
              <Card key={sub.id} className="p-4 flex flex-col gap-3 border-primary/20 bg-primary/5">
                <div className="flex justify-between items-center">
                  <h4 className="font-black">{sub.planId}</h4>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${sub.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {sub.status}
                  </span>
                </div>
                <p className="text-xs font-bold text-ink/40">{sub.items}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-black text-primary">{sub.price}</span>
                  {sub.status === 'Active' && (
                    <Button variant="outline" className="text-red-500 border-red-500/20 hover:bg-red-50 px-3 py-1 text-xs" onClick={() => handleCancelSubscription(sub.id)}>Cancel</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-6">
          <h3 className="font-black text-lg">Available Plans</h3>
          {[
            { title: 'Daily Milk', price: '₹45/mo', items: '1L Whole Milk daily', icon: ICONS.Milk, color: 'bg-blue-100 text-blue-600' },
            { title: 'Fresh Veggies', price: '₹80/mo', items: '3kg Mixed Veggies weekly', icon: ICONS.Carrot, color: 'bg-orange-100 text-orange-600' },
            { title: 'Fruit Basket', price: '₹60/mo', items: '2kg Seasonal Fruits weekly', icon: ICONS.Apple, color: 'bg-red-100 text-red-600' },
          ].map((plan, i) => (
            <Card key={i} className="flex items-center gap-4 p-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${plan.color}`}>
                <plan.icon size={32} />
              </div>
              <div className="flex-1">
                <h4 className="font-black">{plan.title}</h4>
                <p className="text-xs text-ink/40">{plan.items}</p>
                <p className="text-primary font-black mt-1">{plan.price}</p>
              </div>
              <Button variant="outline" className="px-4 py-2 text-xs" onClick={() => handleSubscribe(plan)}>Subscribe</Button>
            </Card>
          ))}
        </div>

        <div className="bg-secondary/10 p-6 rounded-[2rem] border border-secondary/20">
          <h4 className="font-black text-secondary mb-2">Why Subscribe?</h4>
          <ul className="text-sm text-ink/60 flex flex-col gap-2">
            <li className="flex items-center gap-2"><ICONS.CheckCircle size={16} /> Guaranteed morning delivery</li>
            <li className="flex items-center gap-2"><ICONS.CheckCircle size={16} /> Save up to 20% on retail prices</li>
            <li className="flex items-center gap-2"><ICONS.CheckCircle size={16} /> Pause or cancel anytime</li>
          </ul>
        </div>
      </div>
    );
  };

  const RewardsScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Rewards & Points</h2>
      </div>

      <Card className="gradient-secondary text-white p-8 flex flex-col items-center gap-4">
        <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center">
          <ICONS.Award size={48} className="text-white" />
        </div>
        <div className="text-center">
          <h3 className="text-4xl font-black">{profile?.points || 0}</h3>
          <p className="text-white/60 font-bold uppercase tracking-widest text-xs">Total Points Earned</p>
        </div>
        <div className="w-full h-2 bg-white/20 rounded-full mt-4 overflow-hidden">
          <div className="w-3/4 h-full bg-white" />
        </div>
        <p className="text-[10px] font-bold text-white/60">250 points until next tier</p>
      </Card>

      <div className="flex flex-col gap-4">
        <h4 className="font-black">Available Vouchers</h4>
        {[
          { title: '50% OFF', desc: 'On your next order', code: 'FRESH50', icon: ICONS.Tag, color: 'bg-orange-100 text-orange-600' },
          { title: 'FREE Delivery', desc: 'No minimum order', code: 'FREESHIP', icon: ICONS.Truck, color: 'bg-blue-100 text-blue-600' },
          { title: '₹10 Cashback', desc: 'On orders above ₹50', code: 'CASH10', icon: ICONS.CreditCard, color: 'bg-green-100 text-green-600' },
        ].map((v, i) => (
          <Card key={i} className="flex items-center gap-4 p-4 border-dashed border-2 border-black/10">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${v.color}`}>
              <v.icon size={24} />
            </div>
            <div className="flex-1">
              <h5 className="font-black text-sm">{v.title}</h5>
              <p className="text-[10px] text-ink/40 font-bold">{v.desc}</p>
            </div>
            <button 
              onClick={async () => {
                if (user) {
                  const userRef = doc(db, 'users', user.uid);
                  await updateDoc(userRef, {
                    vouchers: increment(1)
                  });
                  alert(`Voucher ${v.code} claimed!`);
                }
              }}
              className="bg-bg px-3 py-2 rounded-lg border border-black/5 active:scale-95 transition-all"
            >
              <span className="text-xs font-black font-mono">{v.code}</span>
            </button>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h4 className="font-black">How to earn points?</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-black/5 flex flex-col gap-2">
            <div className="w-8 h-8 bg-bg rounded-lg flex items-center justify-center text-primary"><ICONS.ShoppingCart size={16} /></div>
            <p className="text-[10px] font-bold text-ink/40 uppercase">Shopping</p>
            <p className="text-xs font-black">1 Point per ₹1</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-black/5 flex flex-col gap-2">
            <div className="w-8 h-8 bg-bg rounded-lg flex items-center justify-center text-secondary"><ICONS.Users size={16} /></div>
            <p className="text-[10px] font-bold text-ink/40 uppercase">Referral</p>
            <p className="text-xs font-black">50 Points per friend</p>
          </div>
        </div>
      </div>
    </div>
  );

  const OrdersScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Order History</h2>
      </div>

      <div className="flex flex-col gap-4">
        {orders.length > 0 ? orders.map(order => (
          <Card key={order.id} className="flex flex-col gap-4 p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-ink/20 uppercase tracking-widest">Order #FF-{order.id.slice(-6).toUpperCase()}</p>
                <p className="text-sm font-bold mt-1">{order.createdAt?.toDate().toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                {order.status}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-ink/60">{item.quantity}x {item.name || 'Unknown Product'}</span>
                  <span className="font-bold">₹{( (item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="h-px bg-black/5" />
            <div className="flex justify-between items-center">
              <span className="font-black">Total</span>
              <span className="text-lg font-black text-primary">₹{order.total?.toFixed(2)}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-ink/40">
                <span>Payment Method</span>
                <span>{order.paymentMethod || 'COD'}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-ink/40">
                <span>Payment Status</span>
                <span className={order.paymentStatus === 'Paid' ? 'text-green-500' : 'text-red-500'}>{order.paymentStatus || 'Pending'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setSelectedOrderForBill(order);
                  setIsBillModalOpen(true);
                }} 
                variant="outline" 
                className="flex-1 py-2 text-xs"
              >
                View Bill
              </Button>
              {order.status === 'Processing' && (
                <Button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'orders', order.id), { status: 'Cancelled' });
                      showToast('Order cancelled successfully');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                    }
                  }} 
                  variant="outline" 
                  className="flex-1 py-2 text-xs border-red-500 text-red-500 hover:bg-red-50"
                >
                  Cancel
                </Button>
              )}
              {order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                <Button onClick={() => { setTrackingOrderId(order.id); setScreen('tracking'); }} className="flex-1 py-2 text-xs">Track Order</Button>
              )}
            </div>
          </Card>
        )) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ICONS.Package size={64} className="text-ink/10 mb-4" />
            <p className="text-ink/40 font-bold">No orders found</p>
          </div>
        )}
      </div>
    </div>
  );

  const AddressesScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Saved Addresses</h2>
      </div>

      <div className="flex flex-col gap-4">
        {profile?.addresses?.map((addr: any, i: number) => (
          <Card key={i} className="p-6 flex items-center gap-4 border border-black/5">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              {addr.type === 'Home' ? <ICONS.Home size={24} /> : <ICONS.Briefcase size={24} />}
            </div>
            <div className="flex-1">
              <p className="font-bold">{addr.type}</p>
              <p className="text-xs text-ink/40">{addr.details}</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setEditingAddress(i);
                  setNewAddress(addr);
                  setIsAddressModalOpen(true);
                }}
                className="p-2 text-primary hover:bg-primary/5 rounded-lg"
              >
                <ICONS.Edit size={18} />
              </button>
              <button 
                onClick={() => handleDeleteAddress(i)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
              >
                <ICONS.Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}
        {(!profile?.addresses || profile.addresses.length === 0) && (
          <div className="text-center py-8 text-ink/20 font-bold">No addresses saved</div>
        )}
        <Button 
          variant="outline" 
          className="w-full py-4 border-dashed"
          onClick={() => {
            setEditingAddress(null);
            setNewAddress({ type: 'Home', details: '' });
            setIsAddressModalOpen(true);
          }}
        >
          <ICONS.Plus size={20} /> Add New Address
        </Button>
      </div>
    </div>
  );

  const PaymentMethodsScreen = () => (
    <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
          <ICONS.ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-black">Payment Methods</h2>
      </div>

      <div className="flex flex-col gap-4">
        {profile?.paymentMethods?.map((method: any, i: number) => (
          <Card key={i} className="p-6 flex items-center gap-4 border border-black/5">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              {method.type === 'Google Pay' ? <ICONS.Smartphone size={24} /> : <ICONS.CreditCard size={24} />}
            </div>
            <div className="flex-1">
              <p className="font-bold">{method.details}</p>
              <p className="text-xs text-ink/40">{method.expiry ? `Expires ${method.expiry}` : 'Digital Wallet'}</p>
            </div>
            <button 
              onClick={() => handleDeletePayment(i)}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
            >
              <ICONS.Trash2 size={18} />
            </button>
          </Card>
        ))}
        {(!profile?.paymentMethods || profile.paymentMethods.length === 0) && (
          <div className="text-center py-8 text-ink/20 font-bold">No payment methods saved</div>
        )}
        <Button 
          variant="outline" 
          className="w-full py-4 border-dashed"
          onClick={() => setIsPaymentModalOpen(true)}
        >
          <ICONS.Plus size={20} /> Add New Method
        </Button>
      </div>
    </div>
  );

  const ProfileScreen = () => {
    const handleLogout = async () => {
      try {
        await logout();
        setScreen('login');
      } catch (error) {
        console.error('Logout failed', error);
      }
    };

    return (
      <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-6">
          <div className="relative">
            <img 
              src={profile?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"} 
              className="w-24 h-24 rounded-[2rem] object-cover border-4 border-white shadow-xl" 
              alt="Profile" 
            />
            <button onClick={() => setScreen('settings')} className="absolute -bottom-2 -right-2 w-10 h-10 gradient-primary text-white rounded-xl flex items-center justify-center border-4 border-bg">
              <ICONS.Settings size={18} />
            </button>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black">{profile?.name || 'User'}</h2>
            <p className="text-ink/40 font-bold truncate max-w-[200px]">{profile?.email || 'user@example.com'}</p>
            <p className="text-ink/40 font-bold text-xs mt-1">{profile?.phone || '+1 (555) 000-0000'}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                {profile?.role === 'admin' ? 'Administrator' : 'Premium Member'}
              </span>
            </div>
          </div>
        </div>

        <Card className="p-6 flex flex-col gap-4 bg-primary/5 border-primary/10">
          <h3 className="font-black text-lg">Account Details</h3>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-black/5 pb-2">
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Full Name</span>
              <span className="font-black text-sm">{profile?.name || 'User'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-black/5 pb-2">
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Email</span>
              <span className="font-black text-sm">{profile?.email || 'user@example.com'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-black/5 pb-2">
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Phone</span>
              <span className="font-black text-sm">{profile?.phone || 'Not provided'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-black/5 pb-2">
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Address</span>
              <span className="font-black text-sm text-right">
                {profile?.street ? `${profile.street}, ` : ''}
                {profile?.landmark ? `${profile.landmark}, ` : ''}
                {profile?.city ? `${profile.city}, ` : ''}
                {profile?.district ? `${profile.district}, ` : ''}
                {profile?.pinCode || ''}
              </span>
            </div>
            {profile?.location && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Location</span>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${profile.location.lat},${profile.location.lng}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="font-black text-sm text-primary"
                >
                  View on Map
                </a>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Member Since</span>
              <span className="font-black text-sm">{profile?.createdAt ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-black">{profile?.ordersCount || 0}</span>
            <span className="text-[10px] font-bold text-ink/40 uppercase">Orders</span>
          </div>
          <div className="flex flex-col items-center gap-1 border-x border-black/5">
            <span className="text-xl font-black">{profile?.points || 0}</span>
            <span className="text-[10px] font-bold text-ink/40 uppercase">Points</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-black">{profile?.vouchers || 0}</span>
            <span className="text-[10px] font-bold text-ink/40 uppercase">Vouchers</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-black">Recent Orders</h4>
            <button onClick={() => setScreen('tracking')} className="text-xs font-black text-primary uppercase">Track Active</button>
          </div>
          <div className="flex flex-col gap-3">
            {orders.slice(0, 3).map(order => (
              <Card key={order.id} className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 bg-bg rounded-xl flex items-center justify-center text-ink/20 font-black text-[10px]">
                  #{order.id.slice(-4).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{order.items?.[0]?.name || 'Order'}{order.items?.length > 1 ? ` +${order.items.length - 1} more` : ''}</p>
                  <p className="text-[10px] text-ink/40 font-bold">{order.createdAt?.toDate().toLocaleDateString()} • ₹{order.total?.toFixed(2)}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                  {order.status}
                </span>
              </Card>
            ))}
            {orders.length === 0 && (
              <p className="text-center py-4 text-xs text-ink/20 font-bold">No orders yet</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {profile?.role === 'vendor' && (
            <div 
              className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-black/5 cursor-pointer hover:bg-black/5 transition-colors"
              onClick={() => setScreen('vendor')}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary`}>
                <ICONS.Store size={20} />
              </div>
              <span className="font-bold flex-1">Vendor Panel</span>
              <ICONS.ChevronRight size={20} className="text-ink/20" />
            </div>
          )}
          {[
            { icon: ICONS.Package, label: 'Order History', color: 'text-blue-500', onClick: () => setScreen('orders') },
            { icon: ICONS.Calendar, label: 'My Subscriptions', color: 'text-orange-500', onClick: () => setScreen('subscription') },
            { icon: ICONS.MapPin, label: 'Saved Addresses', color: 'text-red-500', onClick: () => setScreen('addresses') },
            { icon: ICONS.Heart, label: 'My Wishlist', color: 'text-red-500', onClick: () => setScreen('wishlist') },
            { icon: ICONS.CreditCard, label: 'Payment Methods', color: 'text-green-500', onClick: () => setScreen('payment') },
            { icon: ICONS.Gift, label: 'Rewards & Offers', color: 'text-orange-500', onClick: () => setScreen('rewards') },
            { icon: ICONS.ShieldCheck, label: 'Privacy & Security', color: 'text-purple-500', onClick: () => setScreen('settings') },
            { icon: ICONS.LayoutDashboard, label: 'Admin Dashboard', color: 'text-ink', onClick: () => setScreen('admin'), show: profile?.role === 'admin' },
            { icon: ICONS.LogOut, label: 'Logout', color: 'text-red-500', onClick: handleLogout, show: true },
          ].filter(item => item.show !== false).map((item, i) => (
            <button 
              key={i} 
              onClick={item.onClick}
              className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-black/5 hover:bg-black/5 transition-all"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-bg ${item.color}`}>
                <item.icon size={20} />
              </div>
              <span className="flex-1 text-left font-bold">{item.label}</span>
              <ICONS.ChevronRight size={18} className="text-ink/20" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const INITIAL_PRODUCT_STATE = { 
    name: '', 
    price: '', 
    category: 'fruits', 
    unit: '1kg',
    description: '',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&q=80&w=400',
    stock: 100
  };

  const [adminTab, setAdminTab] = useState('Analytics');
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProduct, setNewProduct] = useState(INITIAL_PRODUCT_STATE);

  const handleSaveProduct = async () => {
    try {
      const productData = {
        ...newProduct,
        price: parseFloat(newProduct.price),
        stock: parseInt(newProduct.stock.toString()),
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          rating: 4.5,
          reviews: 0,
          createdAt: serverTimestamp()
        });
      }
      
      setIsAddProductModalOpen(false);
      setEditingProduct(null);
      setNewProduct(INITIAL_PRODUCT_STATE);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      unit: product.unit,
      description: product.description || '',
      image: product.image,
      stock: product.stock || 100
    });
    setIsAddProductModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  const VendorScreen = () => {
    const [vendorTab, setVendorTab] = useState('Dashboard');
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
    const [bulkJson, setBulkJson] = useState('');
    const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '', image: '' });
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewProduct({ ...newProduct, image: reader.result as string });
        };
        reader.readAsDataURL(file);
      }
    };

    const handleBulkImport = async () => {
      try {
        const parsedProducts = JSON.parse(bulkJson);
        if (!Array.isArray(parsedProducts)) {
          showToast('Invalid JSON format. Must be an array of products.');
          return;
        }
        
        let count = 0;
        for (const p of parsedProducts) {
          if (p.name && p.price && p.category) {
            await addDoc(collection(db, 'products'), {
              name: p.name,
              price: parseFloat(p.price),
              category: p.category,
              image: p.image || '',
              unit: p.unit || '1 item',
              vendorId: user?.uid,
              createdAt: serverTimestamp()
            });
            count++;
          }
        }
        showToast(`Successfully imported ${count} products`);
        setIsBulkImportModalOpen(false);
        setBulkJson('');
      } catch (error) {
        showToast('Error parsing JSON or importing products');
        console.error(error);
      }
    };

    const downloadProductTemplate = () => {
      const templateData = [
        {
          name: 'Apple',
          price: 100,
          category: 'Fruits',
          unit: '1kg',
          image: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&q=80&w=400'
        },
        {
          name: 'Banana',
          price: 60,
          category: 'Fruits',
          unit: '1kg',
          image: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&q=80&w=400'
        },
        {
          name: 'Tomato',
          price: 40,
          category: 'Vegetables',
          unit: '1kg',
          image: 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&q=80&w=400'
        }
      ];
      const csv = 'name,price,category,unit,image\n' + templateData.map(p => `"${p.name}","${p.price}","${p.category}","${p.unit}","${p.image}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Product template downloaded successfully');
    };

    const handleProductCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csv = event.target?.result as string;
          const lines = csv.split('\n').map(line => line.trim()).filter(Boolean);
          if (lines.length < 2) {
            showToast('CSV file is empty or invalid', 'error');
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          const productsFromCsv: any[] = [];

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].match(/"([^"]*)"|[^,]+/g) || [];
            const product: any = {};
            headers.forEach((header, index) => {
              product[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
            });
            if (product.name && product.price && product.category) {
              productsFromCsv.push(product);
            }
          }

          if (productsFromCsv.length === 0) {
            showToast('No valid products found in CSV', 'error');
            return;
          }

          setBulkJson(JSON.stringify(productsFromCsv, null, 2));
          showToast(`Loaded ${productsFromCsv.length} products from CSV. Click Import Products.`);
        } catch (error) {
          showToast('Error parsing CSV file', 'error');
          console.error(error);
        }
      };

      reader.readAsText(file);
    };

    const downloadVendorTemplate = () => {
      const templateData = [
        {
          name: 'Green Valley Farms',
          type: 'Organic Produce',
          image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=400'
        },
        {
          name: 'Fresh Dairy Co',
          type: 'Dairy Products',
          image: 'https://images.unsplash.com/photo-1452195917191-5ed0529ce53b?auto=format&fit=crop&q=80&w=400'
        },
        {
          name: 'Spice Master Store',
          type: 'Spices & Condiments',
          image: 'https://images.unsplash.com/photo-1525611522615-33a60b9c1acb?auto=format&fit=crop&q=80&w=400'
        }
      ];
      const csv = 'name,type,image\n' + templateData.map(v => `"${v.name}","${v.type}","${v.image}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vendor_template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Vendor template downloaded successfully');
    };

    const handleBulkImportVendors = async () => {
      try {
        const parsedVendors = JSON.parse(bulkVendorJson);
        if (!Array.isArray(parsedVendors)) {
          showToast('Invalid JSON format. Must be an array of vendors.');
          return;
        }
        
        let count = 0;
        for (const v of parsedVendors) {
          if (v.name && v.type) {
            await addDoc(collection(db, 'vendors'), {
              name: v.name,
              type: v.type,
              image: v.image || '',
              rating: 0,
              sales: 0,
              createdAt: serverTimestamp()
            });
            count++;
          }
        }
        showToast(`Successfully imported ${count} vendors`);
        setIsBulkImportVendorModalOpen(false);
        setBulkVendorJson('');
      } catch (error) {
        showToast('Error parsing JSON or importing vendors');
        console.error(error);
      }
    };

    const handleVendorFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csv = event.target?.result as string;
          const lines = csv.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          const vendors = [];

          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].match(/"([^"]*)"|[^,]+/g) || [];
            const vendor: any = {};
            headers.forEach((header, index) => {
              vendor[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
            });
            if (vendor.name && vendor.type) {
              vendors.push(vendor);
            }
          }

          if (vendors.length === 0) {
            showToast('No valid vendors found in CSV', 'error');
            return;
          }

          setBulkVendorJson(JSON.stringify(vendors, null, 2));
          showToast(`Loaded ${vendors.length} vendors from CSV. Review and click Import.`);
        } catch (error) {
          showToast('Error parsing CSV file');
          console.error(error);
        }
      };
      reader.readAsText(file);
    };

    const handleAddProduct = async () => {
      if (!newProduct.name || !newProduct.price || !newProduct.category) {
        showToast('Please fill all required fields');
        return;
      }
      try {
        const productData = {
          ...newProduct,
          price: parseFloat(newProduct.price),
          stock: parseInt(newProduct.stock || '0'),
          vendorId: user?.uid,
          createdAt: editingProduct ? editingProduct.createdAt : serverTimestamp()
        };

        if (editingProduct) {
          await updateDoc(doc(db, 'products', editingProduct.id), productData);
          showToast('Product updated successfully');
        } else {
          await addDoc(collection(db, 'products'), {
            ...productData,
            createdAt: serverTimestamp()
          });
          showToast('Product added successfully');
        }
        setIsAddProductModalOpen(false);
        setNewProduct(INITIAL_PRODUCT_STATE);
        setEditingProduct(null);
      } catch (error) {
        handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
      }
    };

    return (
      <div className="pb-32 pt-8 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/5">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-2xl font-black">Vendor Panel</h2>
        </div>

        <div className="flex gap-4 overflow-x-auto hide-scrollbar border-b border-black/5 pb-2">
          {['Dashboard', 'Products', 'Orders'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setVendorTab(tab)}
              className={`px-4 py-2 font-bold text-sm transition-all ${vendorTab === tab ? 'text-primary border-b-2 border-primary' : 'text-ink/40'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {vendorTab === 'Dashboard' && (() => {
          const vendorProducts = products.filter(p => p.vendorId === user?.uid);
          const vendorProductIds = vendorProducts.map(p => p.id);
          const vendorOrders = orders.filter(o => o.items?.some((i: any) => vendorProductIds.includes(i.productId)));
          const lowStockProducts = vendorProducts.filter(p => (p.stock !== undefined ? p.stock : 50) < 10);
          
          return (
            <div className="flex flex-col gap-4">
              {lowStockProducts.length > 0 && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3">
                  <ICONS.AlertTriangle size={24} className="text-red-500" />
                  <div>
                    <h4 className="font-bold text-red-700">Low Stock Alert</h4>
                    <p className="text-xs text-red-600">{lowStockProducts.length} products are running low on stock.</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 flex flex-col gap-2 bg-primary/5 border-primary/10">
                  <ICONS.Package size={24} className="text-primary" />
                  <span className="text-2xl font-black">{vendorProducts.length}</span>
                  <span className="text-[10px] font-bold text-ink/40 uppercase">Active Products</span>
                </Card>
                <Card className="p-4 flex flex-col gap-2 bg-secondary/5 border-secondary/10">
                  <ICONS.ShoppingBag size={24} className="text-secondary" />
                  <span className="text-2xl font-black">{vendorOrders.length}</span>
                  <span className="text-[10px] font-bold text-ink/40 uppercase">Orders Today</span>
                </Card>
                <Card className="p-4 flex flex-col gap-2 bg-blue-500/5 border-blue-500/10">
                  <ICONS.TrendingUp size={24} className="text-blue-500" />
                  <span className="text-2xl font-black">₹{vendorOrders.reduce((acc, o) => acc + (o.total || 0), 0).toFixed(2)}</span>
                  <span className="text-[10px] font-bold text-ink/40 uppercase">Revenue</span>
                </Card>
                <Card className="p-4 flex flex-col gap-2 bg-purple-500/5 border-purple-500/10">
                  <ICONS.Star size={24} className="text-purple-500" />
                  <span className="text-2xl font-black">4.8</span>
                  <span className="text-[10px] font-bold text-ink/40 uppercase">Rating</span>
                </Card>
              </div>
            </div>
          );
        })()}

        {vendorTab === 'Products' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-lg">My Products</h3>
              <div className="flex gap-2">
                <Button onClick={() => setIsBulkImportModalOpen(true)} className="px-4 py-2 text-xs bg-secondary text-white">Bulk Import</Button>
                <Button onClick={() => setIsAddProductModalOpen(true)} className="px-4 py-2 text-xs">Add New</Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {products.filter(p => p.vendorId === user?.uid).map(product => (
                <Card key={product.id} className="p-4 flex gap-4 items-center">
                  <img src={product.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=100'} className="w-16 h-16 rounded-xl object-cover" alt={product.name} />
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">{product.name}</h4>
                    <p className="text-xs text-ink/40 font-bold">₹{product.price}</p>
                    <p className="text-[10px] text-primary font-bold mt-1">In Stock: {product.stock !== undefined ? product.stock : 50}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center text-ink/40 hover:bg-primary/10 hover:text-primary transition-colors">
                      <ICONS.Edit2 size={14} />
                    </button>
                  </div>
                </Card>
              ))}
              {products.filter(p => p.vendorId === user?.uid).length === 0 && (
                <p className="text-center py-4 text-xs text-ink/20 font-bold">No products added yet</p>
              )}
            </div>
          </div>
        )}

        {vendorTab === 'Orders' && (() => {
          const vendorProducts = products.filter(p => p.vendorId === user?.uid);
          const vendorProductIds = vendorProducts.map(p => p.id);
          const vendorOrders = orders.filter(o => o.items?.some((i: any) => vendorProductIds.includes(i.productId)));

          return (
            <div className="flex flex-col gap-4">
              <h3 className="font-black text-lg">Recent Orders</h3>
              <div className="flex flex-col gap-3">
                {vendorOrders.slice(0, 5).map(order => (
                  <Card key={order.id} className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm">#ORD-{order.id.slice(-6).toUpperCase()}</span>
                      <span className="text-xs font-bold text-ink/40">{order.createdAt?.toDate().toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${order.paymentStatus === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {order.paymentStatus || 'Pending'}
                        </span>
                        <span className="text-xs font-bold text-ink/40">{order.timeSlot || 'Standard Delivery'}</span>
                      </div>
                      <select 
                        value={order.status || 'Processing'}
                        onChange={async (e) => {
                          try {
                            const newStatus = e.target.value;
                            await updateDoc(doc(db, 'orders', order.id), { status: newStatus });
                            showToast(`Order status updated to ${newStatus}`);
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border-none focus:ring-0 ${order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}
                      >
                        {ORDER_STATUSES.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2 pt-2 border-t border-black/5">
                      {order.items?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-ink/60 font-bold">{item.quantity}x {item.name} ({item.unit})</span>
                          <span className="font-bold">₹{( (item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-black/5">
                      <p className="text-xs font-bold text-ink/40 uppercase">Customer Details</p>
                      <p className="text-xs font-bold">{order.customer?.name}</p>
                      <p className="text-xs font-bold">{order.customer?.phone}</p>
                      <p className="text-xs text-ink/60">{order.address}</p>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-black/5">
                      <span className="text-xs font-bold text-ink/40">{order.items?.length || 0} items</span>
                      <span className="font-black text-primary">₹{order.total?.toFixed(2)}</span>
                    </div>
                  </Card>
                ))}
                {vendorOrders.length === 0 && (
                  <p className="text-center py-4 text-xs text-ink/20 font-bold">No orders yet</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Bulk Import Modal */}
        <AnimatePresence>
          {isBulkImportModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-md rounded-[2rem] flex flex-col gap-6 max-h-[80vh]"
              >
                <div className="flex justify-between items-center p-6 flex-shrink-0">
                  <h3 className="text-2xl font-black">Bulk Import</h3>
                  <button onClick={() => setIsBulkImportModalOpen(false)} className="w-10 h-10 bg-bg rounded-full flex items-center justify-center">
                    <ICONS.X size={20} />
                  </button>
                </div>
                
                <div className="overflow-y-auto px-6 pb-6 flex-1 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase">Download CSV Template</label>
                    <Button onClick={downloadProductTemplate} variant="outline" className="w-full py-3">
                      <ICONS.Package size={16} className="mr-2" /> Download Template
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase">Upload CSV File</label>
                    <label className="w-full bg-bg rounded-2xl px-6 py-4 flex items-center justify-center gap-2 cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20">
                      <ICONS.Tag size={20} className="text-ink/40" />
                      <span className="text-sm font-bold text-ink/60">Upload CSV</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleProductCsvUpload}
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Paste JSON Data</label>
                    <textarea 
                      value={bulkJson}
                      onChange={e => setBulkJson(e.target.value)}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-mono text-xs h-48 resize-none"
                      placeholder='[{"name": "Apple", "price": 100, "category": "Fruits", "unit": "1kg"}]'
                    />
                  </div>

                  <Button onClick={handleBulkImport} className="w-full py-4 text-lg bg-secondary text-white">
                    Import Products
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk Import Vendors Modal */}
        <AnimatePresence>
          {isBulkImportVendorModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-md rounded-[2rem] flex flex-col gap-6 max-h-[80vh]"
              >
                <div className="flex justify-between items-center p-6 flex-shrink-0">
                  <h3 className="text-2xl font-black">Bulk Import Vendors</h3>
                  <button onClick={() => setIsBulkImportVendorModalOpen(false)} className="w-10 h-10 bg-bg rounded-full flex items-center justify-center">
                    <ICONS.X size={20} />
                  </button>
                </div>
                
                <div className="overflow-y-auto px-6 pb-6 flex-1 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase">Download CSV Template</label>
                    <Button onClick={downloadVendorTemplate} variant="outline" className="w-full py-3">
                      <ICONS.Package size={16} className="mr-2" /> Download Template
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase">Or Upload CSV File</label>
                    <label className="w-full bg-bg rounded-2xl px-6 py-4 flex items-center justify-center gap-2 cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20">
                      <ICONS.Tag size={20} className="text-ink/40" />
                      <span className="text-sm font-bold text-ink/60">Upload CSV</span>
                      <input 
                        type="file" 
                        accept=".csv"
                        className="hidden" 
                        onChange={handleVendorFileUpload}
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase">Or Paste JSON Data</label>
                    <textarea 
                      value={bulkVendorJson}
                      onChange={e => setBulkVendorJson(e.target.value)}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-mono text-xs h-48 resize-none"
                      placeholder='[{"name": "Green Valley Farms", "type": "Organic Produce", "image": "https://..."}]'
                    />
                  </div>

                  <Button onClick={handleBulkImportVendors} disabled={!bulkVendorJson.trim()} className="w-full py-4 text-lg bg-secondary text-white">
                    Import Vendors
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Product Modal */}
        <AnimatePresence>
          {isAddProductModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-md rounded-[2rem] flex flex-col gap-6 max-h-[90vh]"
              >
                <div className="flex justify-between items-center p-6 flex-shrink-0">
                  <h3 className="text-2xl font-black">Add Product</h3>
                  <button onClick={() => setIsAddProductModalOpen(false)} className="w-10 h-10 bg-bg rounded-full flex items-center justify-center">
                    <ICONS.X size={20} />
                  </button>
                </div>
                
                <div className="overflow-y-auto px-6 pb-6 flex-1 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Product Name</label>
                    <input 
                      type="text"
                      value={newProduct.name}
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                      placeholder="e.g. Fresh Apples"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Base Unit</label>
                    <select 
                      value={newProduct.unit}
                      onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                    >
                      {['100g', '200g', '250g', '500g', '1kg', '2kg', '500ml', '1L'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Price per {newProduct.unit} (₹)</label>
                    <input 
                      type="number"
                      value={newProduct.price}
                      onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                      placeholder="e.g. 150"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Category</label>
                    <select 
                      value={newProduct.category}
                      onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                    >
                      <option value="">Select Category</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Stock (Quantity)</label>
                    <input 
                      type="number"
                      value={newProduct.stock}
                      onChange={e => setNewProduct({...newProduct, stock: e.target.value})}
                      className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-ink/40 uppercase ml-4">Product Image</label>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="text"
                        value={newProduct.image}
                        onChange={e => setNewProduct({...newProduct, image: e.target.value})}
                        className="w-full bg-bg rounded-2xl px-6 py-4 outline-none font-bold"
                        placeholder="Image URL or upload below"
                      />
                      <label className="w-full bg-bg rounded-2xl px-6 py-4 flex items-center justify-center gap-2 cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20">
                        <ICONS.Camera size={20} className="text-ink/40" />
                        <span className="text-sm font-bold text-ink/60">Upload Image</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageUpload}
                        />
                      </label>
                      <p className="text-xs text-ink/40 text-center">
                        Or <span className="text-primary font-bold cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>upload a file</span>
                      </p>
                      <input 
                        type="file" 
                        id="file-upload"
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload}
                      />
                      {newProduct.image && (
                        <img src={newProduct.image} alt="Preview" className="w-20 h-20 object-cover rounded-xl mt-2" />
                      )}
                    </div>
                  </div>

                  <Button onClick={handleAddProduct} className="w-full py-4 text-lg">
                    Add Product
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const AdminScreen = () => (
    <div className="p-8 flex flex-col gap-8 bg-white min-h-screen">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('profile')} className="w-10 h-10 bg-bg rounded-xl flex items-center justify-center">
            <ICONS.ChevronLeft size={20} />
          </button>
          <h2 className="text-3xl font-black">Admin Dashboard</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <ICONS.Bell size={24} className="text-ink/40" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
          </div>
          <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=50" className="w-10 h-10 rounded-xl object-cover" alt="Admin" />
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto hide-scrollbar border-b border-black/5 pb-2">
        {['Analytics', 'Orders', 'Inventory', 'Users', 'Vendors', 'Products', 'Offers', 'Settings'].map(tab => (
          <button 
            key={tab} 
            onClick={() => setAdminTab(tab)}
            className={`px-4 py-2 font-bold text-sm transition-all ${adminTab === tab ? 'text-primary border-b-2 border-primary' : 'text-ink/40'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {adminTab === 'Analytics' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: 'Total Revenue', value: `₹${orders.reduce((acc, o) => acc + (o.total || 0), 0).toLocaleString()}`, trend: '+12%', icon: ICONS.TrendingUp, color: 'text-green-500' },
              { label: 'Active Orders', value: orders.filter(o => o.status !== 'Delivered').length.toString(), trend: '+5%', icon: ICONS.Package, color: 'text-blue-500' },
              { label: 'Total Users', value: users.length.toString(), trend: '+18%', icon: ICONS.Users, color: 'text-purple-500' },
              { label: 'Average Rating', value: '4.8', trend: '+0.2', icon: ICONS.Star, color: 'text-orange-500' },
            ].map((stat, i) => (
              <Card key={i} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-bg flex items-center justify-center ${stat.color}`}>
                    <stat.icon size={24} />
                  </div>
                  <span className="text-green-500 text-xs font-bold">{stat.trend}</span>
                </div>
                <p className="text-ink/40 text-sm font-bold uppercase tracking-wider">{stat.label}</p>
                <h3 className="text-3xl font-black mt-1">{stat.value}</h3>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xl font-black">Recent Orders</h4>
                <button onClick={() => setAdminTab('Orders')} className="text-primary font-bold text-sm">View All</button>
              </div>
              <div className="flex flex-col gap-4">
                {orders.slice(0, 4).map((order, i) => (
                  <div key={order.id} className="flex items-center gap-4 p-3 hover:bg-bg rounded-2xl transition-all">
                    <div className="w-12 h-12 bg-bg rounded-xl flex items-center justify-center font-black text-ink/20">#{order.id.slice(-4).toUpperCase()}</div>
                    <div className="flex-1">
                      <p className="font-bold">{order.customer?.name || 'Customer'}</p>
                      <p className="text-xs text-ink/40">{order.createdAt?.toDate().toLocaleTimeString()} • ₹{order.total?.toFixed(2)}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                      {order.status || 'Processing'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xl font-black">Sales Analytics</h4>
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-primary text-white rounded-lg text-xs font-bold">Weekly</button>
                  <button className="px-3 py-1 bg-bg text-ink/40 rounded-lg text-xs font-bold">Monthly</button>
                </div>
              </div>
              <div className="h-64 flex items-end justify-around gap-2 px-4">
                {[40, 70, 45, 90, 65, 85, 55].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      className="w-full gradient-primary rounded-t-lg"
                    />
                    <span className="text-[10px] font-bold text-ink/40">Day {i + 1}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-8">
            <h4 className="text-xl font-black mb-6">System Health</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { label: 'API Latency', value: '120ms', status: 'Optimal', color: 'text-green-500' },
                { label: 'Server Load', value: '24%', status: 'Stable', color: 'text-green-500' },
                { label: 'Error Rate', value: '0.02%', status: 'Low', color: 'text-green-500' },
              ].map((health, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <p className="text-xs text-ink/40 font-bold uppercase tracking-widest">{health.label}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black">{health.value}</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-bg ${health.color}`}>{health.status}</span>
                  </div>
                  <div className="w-full h-1 bg-bg rounded-full mt-2 overflow-hidden">
                    <div className="w-3/4 h-full bg-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {adminTab === 'Orders' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black">Order Management</h3>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-bg rounded-xl text-sm font-bold">Filter</button>
              <button className="px-4 py-2 bg-bg rounded-xl text-sm font-bold">Export</button>
            </div>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-bg border-b border-black/5">
                  <tr>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Order ID</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Customer</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Status</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Payment</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Time Slot</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Amount</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-ink/40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {orders.map((order, i) => (
                    <tr key={order.id} className="hover:bg-bg/50 transition-all">
                      <td className="p-4 font-bold text-sm">#ORD-{order.id.slice(-6).toUpperCase()}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-bg rounded-lg flex items-center justify-center font-black text-ink/20 text-[10px]">
                            {order.customer?.name?.slice(0, 2).toUpperCase() || 'JD'}
                          </div>
                          <span className="text-sm font-bold">{order.customer?.name || 'Customer'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <select 
                          value={order.status || 'Processing'}
                          onChange={async (e) => {
                            try {
                              const newStatus = e.target.value;
                              await updateDoc(doc(db, 'orders', order.id), { status: newStatus });
                              
                              // Send notification to user
                              if (order.customer?.uid) {
                                await updateDoc(doc(db, 'users', order.customer.uid), {
                                  notifications: arrayUnion({
                                    id: Date.now().toString(),
                                    title: 'Order Update',
                                    message: `Your order #FF-${order.id.slice(-6).toUpperCase()} is now ${newStatus}.`,
                                    createdAt: new Date().toISOString(),
                                    read: false
                                  })
                                });
                              }
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border-none focus:ring-0 ${order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}
                        >
                          {ORDER_STATUSES.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-ink/40 uppercase">{order.paymentType || order.paymentMethod || 'Unknown'}</span>
                          {(isManualPaymentMethod(order.paymentType) ||
                            ['Cash', 'COD'].includes(order.paymentType || '') ||
                            /cash|cod|upi|qr/i.test(order.paymentMethod || '')) ? (
                            <select
                              value={order.paymentStatus || 'Pending'}
                              onChange={async (e) => {
                                try {
                                  const newPaymentStatus = e.target.value;
                                  await updateDoc(doc(db, 'orders', order.id), {
                                    paymentStatus: newPaymentStatus,
                                    adminPaymentReviewRequired: newPaymentStatus !== 'Paid'
                                  });
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                                }
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border-none focus:ring-0 ${order.paymentStatus === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Unpaid">Unpaid</option>
                              <option value="Paid">Paid</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${order.paymentStatus === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                              {order.paymentStatus || 'Pending'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold text-ink/60">{order.timeSlot || 'Standard'}</td>
                      <td className="p-4 font-black text-sm">₹{order.total?.toFixed(2)}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                              if (window.confirm('Are you sure you want to delete this order?')) {
                                try {
                                  await deleteDoc(doc(db, 'orders', order.id));
                                  showToast('Order deleted successfully');
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.DELETE, `orders/${order.id}`);
                                }
                              }
                            }}
                            className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                          >
                            <ICONS.Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrderForBill(order);
                              setIsBillModalOpen(true);
                            }}
                            className="p-2 hover:bg-bg rounded-lg transition-all"
                            title="View invoice"
                          >
                            <ICONS.ChevronRight size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {adminTab === 'Users' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black">User Management</h3>
            <Button className="px-6">Add New User</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {users.map((u, i) => (
              <Card key={u.id} className="p-6 flex flex-col items-center text-center gap-4">
                <img src={u.photoURL || `https://i.pravatar.cc/150?u=${u.id}`} className="w-20 h-20 rounded-2xl object-cover" alt="User" />
                <div className="w-full min-w-0">
                  <h4 className="font-black text-lg truncate">{u.name || 'User'}</h4>
                  <p className="text-xs text-ink/40 font-bold truncate">{u.email}</p>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-bg text-primary mt-2 inline-block">{u.role}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button 
                    onClick={async () => {
                      const newRole = u.role === 'admin' ? 'user' : 'admin';
                      try {
                        await updateDoc(doc(db, 'users', u.id), { role: newRole });
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, `users/${u.id}`);
                      }
                    }}
                    className="py-2 bg-bg rounded-xl text-[11px] leading-tight font-bold hover:bg-black/5 transition-all"
                  >
                    Make {u.role === 'admin' ? 'User' : 'Admin'}
                  </button>
                  <button 
                    onClick={async () => {
                      const newRole = u.role === 'vendor' ? 'user' : 'vendor';
                      try {
                        await updateDoc(doc(db, 'users', u.id), { role: newRole });
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, `users/${u.id}`);
                      }
                    }}
                    className="py-2 bg-primary/10 text-primary rounded-xl text-[11px] leading-tight font-bold hover:bg-primary/20 transition-all"
                  >
                    Make {u.role === 'vendor' ? 'User' : 'Vendor'}
                  </button>
                  <button className="col-span-2 py-2 bg-red-50 text-red-500 rounded-xl text-[11px] leading-tight font-bold hover:bg-red-100 transition-all">Block</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'Inventory' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black">Inventory Management</h3>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-black uppercase">Low Stock Alerts (3)</button>
              <button className="px-4 py-2 bg-bg rounded-xl text-sm font-bold">Restock All</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h4 className="font-black mb-4">Stock Distribution</h4>
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Fruits', value: 85, color: 'bg-red-500' },
                  { label: 'Vegetables', value: 60, color: 'bg-green-500' },
                  { label: 'Dairy', value: 30, color: 'bg-blue-500' },
                  { label: 'Bakery', value: 45, color: 'bg-orange-500' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-black mb-4">Recent Stock Updates</h4>
              <div className="flex flex-col gap-3">
                {[
                  { item: 'Organic Bananas', action: 'Restocked', qty: '+50kg', time: '10m ago' },
                  { item: 'Whole Milk', action: 'Low Stock', qty: '5L left', time: '1h ago', critical: true },
                  { item: 'Avocado', action: 'Restocked', qty: '+20pcs', time: '3h ago' },
                ].map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-2 hover:bg-bg rounded-xl transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{log.item}</span>
                      <span className="text-[10px] text-ink/40 font-bold uppercase">{log.time}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-black uppercase ${log.critical ? 'text-red-500' : 'text-green-500'}`}>{log.action}</span>
                      <p className="text-[10px] font-bold text-ink/40">{log.qty}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}


      {adminTab === 'Products' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black">Product Inventory</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map(product => (
              <Card key={product.id} className="overflow-hidden group">
                <div className="relative h-40">
                  <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" alt={product.name} referrerPolicy="no-referrer" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button 
                      onClick={() => handleEditProduct(product)}
                      className="p-2 bg-white/90 backdrop-blur rounded-lg text-ink shadow-sm"
                    >
                      <ICONS.Edit size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteProduct(product.id)}
                      className="p-2 bg-red-500 text-white rounded-lg shadow-sm"
                    >
                      <ICONS.Trash2 size={14} />
                    </button>
                  </div>
                  {product.stock < 10 && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-[8px] font-black uppercase px-2 py-1 rounded-full shadow-lg animate-pulse">Low Stock</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-black text-sm">{product.name}</h4>
                    <span className="text-primary font-black text-sm">₹{product.price}</span>
                  </div>
                  <p className="text-[10px] text-ink/40 font-bold uppercase tracking-wider">{product.category} • {product.unit}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <ICONS.Star size={12} className="text-orange-500 fill-orange-500" />
                      <span className="text-[10px] font-black">{product.rating}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${product.stock < 10 ? 'text-red-500 bg-red-50' : 'text-green-500 bg-green-50'}`}>
                      {product.stock} Units Left
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'Settings' && (
        <div className="flex flex-col gap-6">
          <h3 className="text-2xl font-black">Admin Payment Settings</h3>
          <Card className="p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-ink/40">Merchant Name</label>
              <input
                type="text"
                value={paymentConfig.merchantName}
                onChange={(e) => setPaymentConfig(prev => ({ ...prev, merchantName: e.target.value }))}
                className="w-full bg-bg rounded-2xl px-4 py-3 outline-none font-bold"
                placeholder="FreshFlow"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-ink/40">UPI ID</label>
              <input
                type="text"
                value={paymentConfig.upiId}
                onChange={(e) => setPaymentConfig(prev => ({ ...prev, upiId: e.target.value }))}
                className="w-full bg-bg rounded-2xl px-4 py-3 outline-none font-bold"
                placeholder="merchant@upi"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-ink/40">Upload QR</label>
              <label className="w-full bg-bg rounded-2xl px-4 py-3 flex items-center justify-center gap-2 cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20">
                <ICONS.Camera size={18} className="text-ink/40" />
                <span className="text-sm font-bold text-ink/60">Select QR Image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setPaymentConfig(prev => ({ ...prev, qrImage: String(reader.result || '') }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {paymentConfig.qrImage && (
                <img src={paymentConfig.qrImage} alt="QR Preview" className="w-40 h-40 object-contain rounded-xl border border-black/5 p-2 bg-white" />
              )}
            </div>
            <Button onClick={handleSavePaymentConfig} disabled={isSavingPaymentConfig} className="w-full">
              {isSavingPaymentConfig ? 'Saving...' : 'Save Payment Settings'}
            </Button>
            <p className="text-xs text-ink/50 font-bold">Razorpay is auto-marked as paid. UPI and QR are manually verified by admin.</p>
          </Card>
        </div>
      )}

      {adminTab === 'Vendors' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center gap-4">
            <h3 className="text-2xl font-black">Vendor Partners</h3>
            <div className="flex gap-2">
              <Button variant="outline" className="px-4" onClick={() => setIsBulkImportVendorModalOpen(true)}>Bulk Import</Button>
              <Button className="px-6" onClick={() => setIsAddVendorModalOpen(true)}>Onboard Vendor</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vendors.length > 0 ? vendors.map((vendor) => (
              <Card key={vendor.id} className="p-4 flex gap-4 items-center">
                <img src={vendor.image || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=400'} className="w-24 h-24 rounded-2xl object-cover" alt={vendor.name} />
                <div className="flex-1">
                  <h4 className="font-black text-lg">{vendor.name}</h4>
                  <p className="text-xs text-ink/40 font-bold mb-2">{vendor.type}</p>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-ink/40 font-bold uppercase">Rating</p>
                      <p className="text-sm font-black text-orange-500">{vendor.rating || 'N/A'} ★</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink/40 font-bold uppercase">Monthly Sales</p>
                      <p className="text-sm font-black">₹{vendor.sales || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center text-ink/40 hover:bg-primary/10 hover:text-primary transition-colors">
                    <ICONS.Edit2 size={14} />
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'vendors', vendor.id));
                        showToast('Vendor removed');
                      } catch (error) {
                        handleFirestoreError(error, OperationType.DELETE, `vendors/${vendor.id}`);
                      }
                    }}
                    className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center text-ink/40 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    <ICONS.Trash2 size={14} />
                  </button>
                </div>
              </Card>
            )) : (
              <div className="col-span-1 md:col-span-2 text-center py-12 text-ink/40 font-bold">
                No vendors onboarded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {adminTab === 'Offers' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black">Campaigns & Offers</h3>
            <Button className="px-6">Create Campaign</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'Summer Sale', code: 'SUMMER20', discount: '20% OFF', status: 'Active', color: 'bg-orange-500' },
              { title: 'New User Bonus', code: 'WELCOME50', discount: '50% OFF', status: 'Active', color: 'bg-primary' },
              { title: 'Weekend Flash', code: 'FLASH10', discount: '10% OFF', status: 'Expired', color: 'bg-ink/20' },
            ].map((offer, i) => (
              <Card key={i} className="p-6 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-2 h-full ${offer.color}`} />
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-black text-xl">{offer.title}</h4>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${offer.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-bg text-ink/40'}`}>
                    {offer.status}
                  </span>
                </div>
                <div className="bg-bg p-4 rounded-2xl border-2 border-dashed border-black/10 text-center mb-4">
                  <p className="text-xs text-ink/40 font-bold mb-1 uppercase tracking-widest">Coupon Code</p>
                  <p className="text-2xl font-black tracking-tighter">{offer.code}</p>
                </div>
                <p className="text-3xl font-black text-primary">{offer.discount}</p>
                <p className="text-[10px] text-ink/40 font-bold mt-2 italic">Valid until 30th June 2026</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'Settings' && (
        <div className="flex flex-col gap-8">
          <h3 className="text-2xl font-black">System Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-8 flex flex-col gap-6">
              <h4 className="font-black text-lg border-b border-black/5 pb-4">General Configuration</h4>
              {[
                { label: 'Maintenance Mode', desc: 'Disable app for all users', enabled: false },
                { label: 'AI Recommendations', desc: 'Enable personalized product suggestions', enabled: true },
                { label: 'Push Notifications', desc: 'Send order updates to users', enabled: true },
                { label: 'Vendor Self-Onboarding', desc: 'Allow vendors to register themselves', enabled: false },
              ].map((setting, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <p className="font-bold">{setting.label}</p>
                    <p className="text-xs text-ink/40">{setting.desc}</p>
                  </div>
                  <button className={`w-12 h-6 rounded-full transition-all relative ${setting.enabled ? 'bg-primary' : 'bg-ink/10'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${setting.enabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </Card>
            <Card className="p-8 flex flex-col gap-6">
              <h4 className="font-black text-lg border-b border-black/5 pb-4">API & Integrations</h4>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase text-ink/40">Gemini API Model</label>
                  <select className="w-full bg-bg p-3 rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all">
                    <option>gemini-3-flash-preview</option>
                    <option>gemini-3.1-pro-preview</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase text-ink/40">Maps Provider</label>
                  <select className="w-full bg-bg p-3 rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all">
                    <option>Google Maps</option>
                    <option>Mapbox</option>
                  </select>
                </div>
                <Button variant="outline" className="mt-4">Test Connections</Button>
              </div>
            </Card>
          </div>
          <div className="flex justify-end gap-4">
            <Button variant="outline" className="px-8">Discard Changes</Button>
            <Button className="px-12">Save All Settings</Button>
          </div>
        </div>
      )}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsAddProductModalOpen(false)}
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative bg-white w-full max-w-lg rounded-[40px] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-3xl font-black">Add New Product</h3>
              <button onClick={() => setIsAddProductModalOpen(false)} className="w-10 h-10 bg-bg rounded-xl flex items-center justify-center">
                <ICONS.Plus className="rotate-45" size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase text-ink/40">Product Name</label>
                <input 
                  type="text" 
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  className="w-full bg-bg p-4 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                  placeholder="e.g. Organic Blueberries"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase text-ink/40">Price (₹)</label>
                  <input 
                    type="number" 
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                    className="w-full bg-bg p-4 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                    placeholder="299"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase text-ink/40">Unit</label>
                  <input 
                    type="text" 
                    value={newProduct.unit}
                    onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                    className="w-full bg-bg p-4 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                    placeholder="1kg"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase text-ink/40">Category</label>
                <select 
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                  className="w-full bg-bg p-4 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all appearance-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase text-ink/40">Product Image</label>
                <div className="w-full h-32 bg-bg rounded-2xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-black/5 transition-all">
                  <ICONS.Camera size={24} className="text-ink/20" />
                  <span className="text-xs font-bold text-ink/40">Click to upload image</span>
                </div>
              </div>
              <Button 
                className="w-full py-4 mt-4" 
                onClick={() => {
                  alert('Product added successfully!');
                  setIsAddProductModalOpen(false);
                }}
              >
                Save Product
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );

  const isDesktopWideLayout =
    (screen === 'admin' || screen === 'vendor') ||
    (isDesktopViewport && !['splash', 'onboarding', 'login'].includes(screen));

  // --- Main Render ---
  return (
    <div className={`${isDesktopWideLayout ? 'w-full max-w-[1280px]' : 'max-w-md'} mx-auto min-h-screen bg-bg relative overflow-x-hidden shadow-2xl`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen"
        >
          {screen === 'splash' && <SplashScreen />}
          {screen === 'onboarding' && <OnboardingScreen />}
          {screen === 'login' && <LoginScreen />}
          {screen === 'home' && <HomeScreen />}
          {screen === 'listing' && <ListingScreen />}
          {screen === 'detail' && <DetailScreen />}
          {screen === 'basket' && <BasketScreen />}
          {screen === 'cart' && <CartScreen />}
          {screen === 'checkout' && <CheckoutScreen />}
          {screen === 'tracking' && <TrackingScreen />}
          {screen === 'subscription' && <SubscriptionScreen />}
          {screen === 'settings' && <SettingsScreen />}
          {screen === 'rewards' && <RewardsScreen />}
          {screen === 'health' && <HealthScreen />}
          {screen === 'profile' && <ProfileScreen />}
          {screen === 'orders' && <OrdersScreen />}
          {screen === 'addresses' && <AddressesScreen />}
          {screen === 'payment' && <PaymentMethodsScreen />}
          {screen === 'wishlist' && <WishlistScreen />}
          {screen === 'vendor' && <VendorScreen />}
          {screen === 'admin' && <AdminScreen />}
        </motion.div>
      </AnimatePresence>

      {/* Persistent Navigation */}
      {['home', 'listing', 'basket', 'health', 'profile'].includes(screen) && (
        <Navbar active={screen} setScreen={setScreen} />
      )}

      {/* AI Floating Button (Quick Action) */}
      {['home', 'listing'].includes(screen) && (
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setScreen('basket')}
          className="fixed bottom-28 right-6 w-14 h-14 gradient-secondary text-white rounded-full flex items-center justify-center shadow-xl z-50"
        >
          <ICONS.Zap size={28} />
        </motion.button>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-32 left-6 right-6 z-[100]"
          >
            <div className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 ${toast.type === 'success' ? 'bg-white border-green-500 text-green-600' : 'bg-white border-red-500 text-red-500'}`}>
              {toast.type === 'success' ? <ICONS.CheckCircle size={20} /> : <ICONS.AlertCircle size={20} />}
              <span className="font-bold text-sm">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal 
        isOpen={isVoiceSearchOpen} 
        onClose={() => setIsVoiceSearchOpen(false)} 
        title="Voice Search"
      >
        <div className="flex flex-col items-center gap-8 py-12">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center relative">
            <motion.div 
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-primary/20 rounded-full"
            />
            <ICONS.Mic size={40} className="text-primary relative z-10" />
          </div>
          <p className="text-xl font-bold text-ink animate-pulse">Listening...</p>
          <p className="text-ink/40 text-center">Try saying "Fresh Strawberries" or "Organic Milk"</p>
        </div>
      </Modal>

      <Modal 
        isOpen={isImageSearchOpen} 
        onClose={() => setIsImageSearchOpen(false)} 
        title="Image Search"
      >
        <div className="flex flex-col gap-6 py-4">
          <div className="w-full aspect-video bg-bg rounded-3xl flex flex-col items-center justify-center border-2 border-dashed border-ink/10">
            <ICONS.Camera size={48} className="text-ink/20 mb-2" />
            <p className="text-sm font-bold text-ink/40">Scan product or upload image</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline">Upload Photo</Button>
            <Button>Open Camera</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isLanguageModalOpen} 
        onClose={() => setIsLanguageModalOpen(false)} 
        title="Select Language"
      >
        <div className="flex flex-col gap-3">
          {['English', 'Spanish', 'French', 'German', 'Hindi'].map(lang => (
            <button 
              key={lang}
              onClick={() => {
                setSelectedLanguage(lang);
                setIsLanguageModalOpen(false);
                showToast(`Language changed to ${lang}`);
              }}
              className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center ${selectedLanguage === lang ? 'border-primary bg-primary/5 text-primary' : 'border-black/5 bg-white text-ink/60'}`}
            >
              <span className="font-bold">{lang}</span>
              {selectedLanguage === lang && <ICONS.CheckCircle size={20} />}
            </button>
          ))}
        </div>
      </Modal>

      <Modal 
        isOpen={isAddVendorModalOpen} 
        onClose={() => setIsAddVendorModalOpen(false)} 
        title="Onboard Vendor"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Vendor Name</label>
            <input 
              type="text" 
              value={newVendor.name}
              onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Green Valley Farms"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Vendor Type</label>
            <input 
              type="text" 
              value={newVendor.type}
              onChange={(e) => setNewVendor({ ...newVendor, type: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Organic Produce"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Image URL</label>
            <input 
              type="url" 
              value={newVendor.image}
              onChange={(e) => setNewVendor({ ...newVendor, image: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="https://..."
            />
          </div>
          <Button 
            onClick={async () => {
              if (!newVendor.name || !newVendor.type) {
                showToast('Please fill all required fields', 'error');
                return;
              }
              try {
                await addDoc(collection(db, 'vendors'), {
                  ...newVendor,
                  rating: 0,
                  sales: 0,
                  createdAt: serverTimestamp()
                });
                setIsAddVendorModalOpen(false);
                setNewVendor({ name: '', type: '', image: '' });
                showToast('Vendor onboarded successfully');
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'vendors');
              }
            }} 
            className="mt-4"
          >
            Onboard Vendor
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isEditProfileModalOpen} 
        onClose={() => setIsEditProfileModalOpen(false)} 
        title="Edit Profile"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Profile Photo</label>
            <div className="flex items-center gap-3">
              <img
                src={editProfileData.photoURL || profile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150'}
                alt="Profile"
                className="w-14 h-14 rounded-xl object-cover border border-black/10"
              />
              <label className="px-3 py-2 bg-bg rounded-xl text-xs font-bold cursor-pointer hover:bg-black/5 transition-colors">
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setEditProfileData({ ...editProfileData, photoURL: String(reader.result || '') });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
            <input
              type="text"
              placeholder="Or paste image URL"
              value={editProfileData.photoURL}
              onChange={(e) => setEditProfileData({ ...editProfileData, photoURL: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Full Name</label>
            <input 
              type="text" 
              value={editProfileData.name}
              onChange={(e) => setEditProfileData({ ...editProfileData, name: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Phone Number</label>
            <input 
              type="tel" 
              value={editProfileData.phone}
              onChange={(e) => setEditProfileData({ ...editProfileData, phone: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Street</label>
            <input 
              type="text" 
              value={editProfileData.street}
              onChange={(e) => setEditProfileData({ ...editProfileData, street: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Landmark</label>
            <input 
              type="text" 
              value={editProfileData.landmark}
              onChange={(e) => setEditProfileData({ ...editProfileData, landmark: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">City/Village</label>
              <input 
                type="text" 
                value={editProfileData.city}
                onChange={(e) => setEditProfileData({ ...editProfileData, city: e.target.value })}
                className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">District</label>
              <input 
                type="text" 
                value={editProfileData.district}
                onChange={(e) => setEditProfileData({ ...editProfileData, district: e.target.value })}
                className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink/40 uppercase tracking-widest">Pin Code</label>
            <input 
              type="text" 
              value={editProfileData.pinCode}
              onChange={(e) => setEditProfileData({ ...editProfileData, pinCode: e.target.value })}
              className="bg-bg rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button 
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                  setEditProfileData({
                    ...editProfileData,
                    location: { lat: position.coords.latitude, lng: position.coords.longitude }
                  });
                  showToast('Location fetched successfully');
                }, (error) => {
                  showToast('Error fetching location');
                  console.error(error);
                });
              } else {
                showToast('Geolocation not supported');
              }
            }}
            variant="outline"
            className="mt-2"
          >
            {editProfileData.location ? 'Location Fetched' : 'Get Live Location'}
          </Button>
          <Button 
            onClick={async () => {
              if (user) {
                try {
                  await updateDoc(doc(db, 'users', user.uid), {
                    photoURL: editProfileData.photoURL,
                    name: editProfileData.name,
                    phone: editProfileData.phone,
                    street: editProfileData.street,
                    landmark: editProfileData.landmark,
                    city: editProfileData.city,
                    district: editProfileData.district,
                    pinCode: editProfileData.pinCode,
                    location: editProfileData.location
                  });
                  setIsEditProfileModalOpen(false);
                  showToast('Profile updated successfully');
                } catch (error) {
                  console.error(error);
                  showToast('Failed to update profile. Check Firestore rules.', 'error');
                }
              }
            }} 
            className="mt-4"
          >
            Save Changes
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isNotificationsOpen} 
        onClose={() => setIsNotificationsOpen(false)} 
        title="Notifications"
      >
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pb-4">
          {profile?.notifications && profile.notifications.length > 0 ? (
            [...profile.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((notif: any) => (
              <div 
                key={notif.id} 
                className={`p-4 rounded-2xl border ${notif.read ? 'bg-white border-black/5' : 'bg-primary/5 border-primary/20'} flex gap-4`}
                onClick={async () => {
                  if (!notif.read && user) {
                    try {
                      const updatedNotifs = profile.notifications.map((n: any) => n.id === notif.id ? { ...n, read: true } : n);
                      await updateDoc(doc(db, 'users', user.uid), { notifications: updatedNotifs });
                    } catch (error) {
                      console.error('Failed to mark notification as read', error);
                    }
                  }
                }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${notif.read ? 'bg-bg text-ink/40' : 'bg-primary text-white'}`}>
                  <ICONS.Bell size={18} />
                </div>
                <div className="flex flex-col gap-1">
                  <h4 className="font-black text-sm">{notif.title}</h4>
                  <p className="text-xs text-ink/60 leading-relaxed">{notif.message}</p>
                  <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mt-1">
                    {new Date(notif.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-ink/40">
              <ICONS.Bell size={48} className="mb-4 opacity-20" />
              <p className="font-bold">No notifications yet</p>
              <p className="text-xs">We'll let you know when there are updates.</p>
            </div>
          )}
        </div>
      </Modal>

      <Modal 
        isOpen={isBillModalOpen} 
        onClose={() => setIsBillModalOpen(false)} 
        title="Order Invoice"
      >
        {selectedOrderForBill && (
          <div className="flex flex-col gap-6 py-4 max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-black/5 pb-4">
              <div>
                <p className="text-xs font-black text-ink/20 uppercase tracking-widest">Invoice For Order</p>
                <h4 className="text-lg font-black">#FF-{selectedOrderForBill.id.slice(-6).toUpperCase()}</h4>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-ink/20 uppercase tracking-widest">Date</p>
                <p className="text-sm font-bold">{selectedOrderForBill.createdAt?.toDate().toLocaleDateString()}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Delivery Address</p>
                <p className="text-sm font-bold">{selectedOrderForBill.address}</p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Payment Details</p>
                <div className="flex justify-between text-sm">
                  <span className="text-ink/60">{selectedOrderForBill.paymentMethod}</span>
                  <span className={`font-bold ${selectedOrderForBill.paymentStatus === 'Paid' ? 'text-green-500' : 'text-red-500'}`}>
                    {selectedOrderForBill.paymentStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-black/5 pt-4">
              <p className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Items Ordered</p>
              {selectedOrderForBill.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="font-bold">{item.name}</span>
                    <span className="text-[10px] text-ink/40">{item.quantity} x ₹{item.price}</span>
                  </div>
                  <span className="font-black">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-black/5 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-ink/60">Subtotal</span>
                <span className="font-bold">₹{selectedOrderForBill.total?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink/60">Delivery Fee</span>
                <span className="font-bold text-green-500">FREE</span>
              </div>
              <div className="flex justify-between items-center border-t border-black/5 pt-2 mt-2">
                <span className="text-lg font-black">Total Paid</span>
                <span className="text-2xl font-black text-primary">₹{selectedOrderForBill.total?.toFixed(2)}</span>
              </div>
            </div>

            <Button onClick={() => window.print()} variant="outline" className="w-full mt-4">
              <ICONS.Package size={18} /> Download PDF
            </Button>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={isAddProductModalOpen} 
        onClose={() => { setIsAddProductModalOpen(false); setEditingProduct(null); }} 
        title={editingProduct ? "Edit Product" : "Add New Product"}
      >
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-ink/40">Product Name</label>
            <input 
              type="text" 
              value={newProduct.name}
              onChange={e => setNewProduct({...newProduct, name: e.target.value})}
              className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
              placeholder="e.g. Organic Blueberries"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black uppercase text-ink/40">Price (₹)</label>
              <input 
                type="number" 
                value={newProduct.price}
                onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black uppercase text-ink/40">Unit</label>
              <input 
                type="text" 
                value={newProduct.unit}
                onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                placeholder="e.g. 500g"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-ink/40">Category</label>
            <select 
              value={newProduct.category}
              onChange={e => setNewProduct({...newProduct, category: e.target.value})}
              className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all appearance-none"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-ink/40">Stock Quantity</label>
            <input 
              type="number" 
              value={newProduct.stock}
              onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value) || 0})}
              className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
              placeholder="100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-ink/40">Image URL</label>
            <input 
              type="text" 
              value={newProduct.image}
              onChange={e => setNewProduct({...newProduct, image: e.target.value})}
              className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
              placeholder="https://images.unsplash.com/..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-ink/40">Description</label>
            <textarea 
              value={newProduct.description}
              onChange={e => setNewProduct({...newProduct, description: e.target.value})}
              className="w-full p-3 bg-bg rounded-xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all h-24 resize-none"
              placeholder="Product details..."
            />
          </div>
          <Button onClick={handleSaveProduct} className="w-full mt-4">
            {editingProduct ? "Update Product" : "Add Product"}
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isRewardModalOpen} 
        onClose={() => setIsRewardModalOpen(false)} 
        title="Daily Rewards"
      >
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="w-48 h-48 bg-bg rounded-full flex items-center justify-center relative overflow-hidden border-8 border-white shadow-inner">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                <div key={deg} style={{ transform: `rotate(${deg}deg) translateY(-80px)` }} className="absolute w-1 h-8 bg-primary/20 rounded-full" />
              ))}
            </motion.div>
            <ICONS.Gift size={64} className="text-secondary animate-bounce" />
          </div>
          <div className="text-center">
            <h4 className="text-xl font-black">Spin the Wheel!</h4>
            <p className="text-ink/40">Win points, discounts, or free delivery.</p>
          </div>
            <Button className="w-full" onClick={async () => {
              const points = [10, 20, 50, 100][Math.floor(Math.random() * 4)];
              if (user) {
                await updateDoc(doc(db, 'users', user.uid), {
                  points: increment(points)
                });
                showToast(`You won ${points} points!`);
                setIsRewardModalOpen(false);
              }
            }}>Spin Now</Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isAddressModalOpen} 
        onClose={() => setIsAddressModalOpen(false)} 
        title={editingAddress !== null ? "Edit Address" : "Add New Address"}
      >
        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-ink/40">Address Type</label>
            <div className="grid grid-cols-2 gap-4">
              {['Home', 'Office'].map(type => (
                <button
                  key={type}
                  onClick={() => setNewAddress({...newAddress, type})}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${newAddress.type === type ? 'border-primary bg-primary/5 text-primary' : 'border-transparent bg-bg text-ink/40'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-ink/40">Full Address</label>
            <textarea 
              value={newAddress.details}
              onChange={e => setNewAddress({...newAddress, details: e.target.value})}
              className="w-full p-4 bg-bg rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all h-32 resize-none"
              placeholder="Enter your full address here..."
            />
          </div>
          <Button onClick={handleSaveAddress} className="w-full py-4">
            {editingAddress !== null ? "Update Address" : "Save Address"}
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        title="Add Payment Method"
      >
        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-ink/40">Method Type</label>
            <div className="grid grid-cols-2 gap-4">
              {['Visa', 'Google Pay'].map(type => (
                <button
                  key={type}
                  onClick={() => setNewPayment({...newPayment, type})}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${newPayment.type === type ? 'border-primary bg-primary/5 text-primary' : 'border-transparent bg-bg text-ink/40'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-ink/40">Details</label>
            <input 
              type="text" 
              value={newPayment.details}
              onChange={e => setNewPayment({...newPayment, details: e.target.value})}
              className="w-full p-4 bg-bg rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
              placeholder={newPayment.type === 'Visa' ? "Visa •••• 4242" : "example@gmail.com"}
            />
          </div>
          {newPayment.type === 'Visa' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-ink/40">Expiry Date</label>
              <input 
                type="text" 
                value={newPayment.expiry}
                onChange={e => setNewPayment({...newPayment, expiry: e.target.value})}
                className="w-full p-4 bg-bg rounded-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
                placeholder="MM/YY"
              />
            </div>
          )}
          <Button onClick={handleSavePayment} className="w-full py-4">
            Save Payment Method
          </Button>
        </div>
      </Modal>
    </div>
  );
}
