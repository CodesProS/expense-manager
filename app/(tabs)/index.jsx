import React, { useEffect, useState } from 'react';
import { BarChart, PieChart, LineChart } from "react-native-chart-kit";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const DEV_USER_ID = "5be03dbe-8e27-4fb0-8701-e52b15b234b2"; // from auth.users.id


// ✅ Make sure these exist in Expo:
// app.json / app.config.js -> extra or EXPO_PUBLIC_ env vars
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
const screenWidth = Dimensions.get("window").width;


const PH = "#9CA3AF";
const chartWidth = width - 40;

//console.log("SUPABASE_URL:", SUPABASE_URL);
//console.log("HAS_ANON_KEY:", !!SUPABASE_ANON);

async function uriToBase64DataUrl(imageUri) {
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return dataUrl; // "data:image/...;base64,XXXX"
}

// ---------- UTIL ----------
function money(n) {
  const x = Number(n || 0);
  if (Number.isNaN(x)) return '0.00';
  return x.toFixed(2);
}

function getAliasInput(item) {
  return (
    item?.raw_line ||
    item?.input_text ||
    item?.title ||
    `${item?.company_name || ""} ${item?.general_name || ""} ${item?.specific_name || ""}`.trim()
  );
}

function makeTopProductsBarData(rows) {
  const top = (rows || []).slice(0, 5);

  return {
    labels: top.map((p) =>
      String(p.general_name || p.specific_name || 'Item').slice(0, 10)
    ),
    datasets: [
      {
        data: top.map((p) => Math.round(Number(p.total_spent || 0))),
      },
    ],
  };
}

function makeTopStoresBarData(rows) {
  const top = (rows || []).slice(0, 5);

  return {
    labels: top.map((s) => String(s.store_name || 'Store').slice(0, 10)),
    datasets: [
      {
        data: top.map((s) => Number(s.total || 0)),
      },
    ],
  };
}

function makeProductPieData(rows) {
  const palette = ['#6C5CE7', '#00B894', '#0984E3', '#FDCB6E', '#E17055'];
  const top = (rows || []).slice(0, 5);

  return top.map((p, idx) => ({
    name: String(p.general_name || p.specific_name || 'Item').slice(0, 12),
    population: Math.round(Number(p.total_spent || 0)),
    color: palette[idx % palette.length],
    legendFontColor: '#374151',
    legendFontSize: 12,
  }));
}

function makeMonthlyLineData(expenses) {
  const monthMap = {};
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    monthMap[key] = { label, amount: 0 };
  }

  for (const exp of expenses || []) {
    const d = new Date(exp.date);
    if (Number.isNaN(d.getTime())) continue;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthMap[key]) {
      monthMap[key].amount += Number(exp.amount || 0);
    }
  }

  const values = Object.values(monthMap);

  return {
    labels: values.map((v) => v.label),
    datasets: [
      {
        data: values.map((v) => Number(v.amount || 0)),
      },
    ],
  };
}

const commonChartConfig = {
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(108, 92, 231, ${opacity})`,
  labelColor: () => '#374151',
  propsForBackgroundLines: {
    stroke: '#E5E7EB',
  },
  barPercentage: 0.7,
};

async function saveProductAlias(inputText, productId) {
  const normalized = normalizeInputText(inputText);
  if (!normalized || !productId) return;

  const { error } = await supabase
    .from("product_aliases")
    .upsert(
      [{
        user_id: DEV_USER_ID,
        raw_text: inputText,
        normalized_rawtext: normalized,
        product_id: productId,
      }],
      {
        onConflict: "user_id,normalized_rawtext",
      }
    );

  if (error) {
    console.log("saveProductAlias error:", error.message);
  }
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInputText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDateOnly(d) {
  if (!d) return '';

  if (typeof d === 'string') {
    const s = d.trim();

    // If already YYYY-MM-DD, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
  }

  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- APP ----------
export default function App() {
  const [screen, setScreen] = useState('home');

  const [expenseMonthFilter, setExpenseMonthFilter] = useState('all');

  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);

  const [selectedExpense, setSelectedExpense] = useState(null);
  const [expenseItems, setExpenseItems] = useState([]);

  const [scannedData, setScannedData] = useState(null);
  const [loading, setLoading] = useState(false);

  // analytics
  const [monthlyData, setMonthlyData] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [totalThisMonth, setTotalThisMonth] = useState(0);

  const [expenseStoreFilter, setExpenseStoreFilter] = useState('all');

  // stats
  const [storeStats, setStoreStats] = useState([]);
  const [productStats, setProductStats] = useState([]);

  const [defaultCategoryId, setDefaultCategoryId] = useState(null);

  async function readEdgeErrorContext(context) {
    try {
      // On RN/Expo the context is a fetch Response-like object
      const text = await context?.text?.();
      return text || JSON.stringify(context, null, 2);
    } catch {
      return JSON.stringify(context, null, 2);
    }
  }

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      Alert.alert('Error', 'Failed to load categories');
      return;
    }

    const list = data || [];
    setCategories(list);

    const preferred =
      list.find(c => (c.name || '').toLowerCase() === 'other') ||
      list[0] ||
      null;

    setDefaultCategoryId(preferred?.id ?? null);

  };

  async function lookupProductAlias(inputText) {
    const normalized = normalizeInputText(inputText);
    if (!normalized) return null;

    const { data, error } = await supabase
      .from("product_aliases")
      .select("product_id, products(id, general_name, specific_name, company_name)")
      .eq("user_id", DEV_USER_ID)
      .eq("normalized_rawtext", normalized)
      .maybeSingle();

    if (error) {
      console.log("lookupProductAlias error:", error.message);
      return null;
    }

    return data || null;
  }

  const availableMonths = Array.from(
    new Set(
      expenses.map((exp) => {
        const d = new Date(exp.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })
    )
  ).sort().reverse();

  const filteredExpenses = expenses.filter((exp) => {
    const matchesMonth =
      expenseMonthFilter === 'all' ||
      (() => {
        const d = new Date(exp.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === expenseMonthFilter;
      })();

    const matchesStore =
      expenseStoreFilter === 'all' ||
      (exp.store_name || '').toLowerCase() === expenseStoreFilter.toLowerCase();

    return matchesMonth && matchesStore;
  });

  const recalculateExpenseAmount = async (expenseId) => {
    const { data, error } = await supabase
      .from('receipt_items')
      .select('total_price')
      .eq('expense_id', expenseId);

    if (error) throw error;

    const newAmount = (data || []).reduce(
      (sum, row) => sum + Number(row.total_price || 0),
      0
    );

    const { error: updateError } = await supabase
      .from('expenses')
      .update({ amount: newAmount })
      .eq('id', expenseId)
      .eq('user_id', DEV_USER_ID);

    if (updateError) throw updateError;

    return newAmount;
  };

  const deleteReceiptItem = async (item) => {
    if (!item?.id || !selectedExpense?.id) return;

    Alert.alert(
      "Delete item?",
      "This will remove only this item from the receipt.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('receipt_items')
                .delete()
                .eq('id', item.id);

              if (error) throw error;

              const newAmount = await recalculateExpenseAmount(selectedExpense.id);

              const updatedExpense = {
                ...selectedExpense,
                amount: newAmount,
              };

              setSelectedExpense(updatedExpense);

              await fetchExpenseDetail(updatedExpense);
              await fetchExpenses();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to delete item');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const updateExpenseDetails = async (expenseId, updates) => {
    if (!expenseId) return false;

    setLoading(true);
    try {
      const parsedDate = isoDateOnly(updates.date);
      if (!parsedDate) {
        Alert.alert('Error', 'Please enter a valid date in YYYY-MM-DD format.');
        return false;
      }

      const payload = {
        store_name: updates.store_name?.trim() || '',
        date: parsedDate,
        amount: Number(updates.amount || 0),
        payment_type: updates.payment_type || null,
      };

      const { data, error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', expenseId)
        .eq('user_id', DEV_USER_ID)
        .select('*, categories(*)')
        .single();

      if (error) throw error;

      setSelectedExpense(data);
      await fetchExpenses();
      return true;
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update receipt');
      return false;
    } finally {
      setLoading(false);
    }
  };

  async function resolveIncomingItemToProduct(item) {
    const inputText = getAliasInput(item);

    // 1) try alias table first
    const aliasHit = await lookupProductAlias(inputText);
    if (aliasHit?.product_id) {
      return {
        product_id: aliasHit.product_id,
        matched_product: aliasHit.products || null,
        matched_by: "alias",
        input_text: inputText,
      };
    }

    // 2) try exact/fuzzy product matching logic
    const existing = await findExistingProductMatch(item);
    if (existing?.id) {
      return {
        product_id: existing.id,
        matched_product: existing,
        matched_by: "existing_product_match",
        input_text: inputText,
      };
    }

    // 3) nothing matched yet
    return {
      product_id: null,
      matched_product: null,
      matched_by: null,
      input_text: inputText,
    };
  }

  async function findExistingProductMatch(item) {
    const general = normalizeText(item.general_name);
    const specific = normalizeText(item.specific_name);
    const company = normalizeText(item.company_name);
    const combined = normalizeText(`${company} ${general} ${specific}`);

    const { data, error } = await supabase
      .from('products')
      .select('id, general_name, specific_name, company_name')
      .eq('user_id', DEV_USER_ID)
      .limit(200);

    if (error) throw error;

    let best = null;
    let bestScore = 0;

    for (const p of data || []) {
      const pGeneral = normalizeText(p.general_name);
      const pSpecific = normalizeText(p.specific_name);
      const pCompany = normalizeText(p.company_name);
      const pCombined = normalizeText(`${pCompany} ${pGeneral} ${pSpecific}`);

      let score = 0;

      if (company && pCompany && company === pCompany) score += 3;
      if (specific && pSpecific && specific === pSpecific) score += 3;
      if (general && pGeneral && general === pGeneral) score += 2;

      if (specific && pSpecific && (specific.includes(pSpecific) || pSpecific.includes(specific))) {
        score += 2;
      }

      if (general && pGeneral && (general.includes(pGeneral) || pGeneral.includes(general))) {
        score += 1;
      }

      if (combined && pCombined && combined === pCombined) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    return bestScore >= 5 ? best : null;
  }

  const fetchExpenses = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, categories(*)')
      .eq('user_id', DEV_USER_ID)
      .order('date', { ascending: false });

    console.log("fetchExpenses error:", error);
    //console.log("fetchExpenses data:", data);
    if (error) {
      Alert.alert('Error', 'Failed to load expenses');
      return;
    }

    setExpenses(data || []);
    calculateAnalytics(data || []);
  };

  const fetchExpenseDetail = async (expense) => {
    setSelectedExpense(expense);
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('*, products(*)')
        .eq('expense_id', expense.id);

      if (error) throw error;

      setExpenseItems(data || []);
      setScreen('expenseDetail');
    } catch {
      Alert.alert('Error', 'Failed to load receipt items');
    } finally {
      setLoading(false);
    }
  };


  // --- Load core data ---
  useEffect(() => {

    if (!SUPABASE_URL || !SUPABASE_ANON) {
      Alert.alert('Config error', 'Missing Supabase env vars');
      return;
    }

    fetchCategories();
    fetchExpenses();
  }, []);

  // --- Receipt scan ---
  const scanReceipt = async () => {
    Alert.alert(
      'Add receipt',
      'Use Camera for one photo, or Gallery to select multiple screenshots/pages of the same receipt.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera', onPress: () => pickReceiptImage('camera') },
        { text: 'Gallery', onPress: () => pickReceiptImage('gallery') },
      ],
      { cancelable: true }
    );

    /*
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera permission is needed');
      return;
    }

    if (!categories?.length) {
      Alert.alert('Setup', 'Create at least 1 category first (go to Categories tab).');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,      // keeps payload smaller
      base64: false,     // we will convert from uri ourselves
    });

    const uri = (!result.canceled && result.assets?.[0]?.uri) ? result.assets[0].uri : null;
    if (!uri) return;

    setLoading(true);
    try {
      const dataUrl = await uriToBase64DataUrl(uri);

      const res = await supabase.functions.invoke('swift-endpoint', { body: { image: dataUrl } });

      console.log('scan-receipt full res:', res);

      if (res.error) {
        const e = res.error;

        const bodyText = await readEdgeErrorContext(e.context);

        console.log('scan-receipt error status:', e.status);
        console.log('scan-receipt error message:', e.message);
        console.log('scan-receipt error body:', bodyText);

        Alert.alert(
          'swift-endpoint failed',
          `status: ${e.status}\n\n${bodyText.slice(0, 1200)}`
        );
        return;
      }


      const payload = res.data || {};


      // data is expected to be like:
      // { storeName, date, total, items: [{ name, quantity, price }] }

      //const payload = data || {};

      const normalized = {
        store_name: payload.storeName || payload.store_name || '',
        date: payload.date ? isoDateOnly(payload.date) : isoDateOnly(new Date()),
        amount: Number(payload.total ?? payload.amount ?? 0),
        currency: 'USD',
        payment_type: (payload.paymentType || payload.payment_type || "unknown"),
        category_id: categories[0]?.id ?? null,
        items: Array.isArray(payload.items)
          ? payload.items.map((it) => {
            const qty = Number(it.quantity ?? 1);

            // read both values from OpenAI
            const rawUnit = (typeof it.unitPrice === "number") ? it.unitPrice : null;
            const rawLine = (typeof it.lineTotal === "number") ? it.lineTotal : null;

            // prefer lineTotal if available, else fallback to qty*unit, else 0
            const lineTotal =
              rawLine !== null ? rawLine :
                rawUnit !== null ? qty * rawUnit :
                  0;

            // if unit is missing, infer it from lineTotal
            const unitPrice =
              rawUnit !== null ? rawUnit :
                (qty > 0 && rawLine !== null) ? (rawLine / qty) :
                  null;


            return {
              general_name: it.generalName || "",
              specific_name: it.specificName || "",
              company_name: it.brandExpanded || "",
              tags: Array.isArray(it.tags) ? it.tags : [],
              category_hints: Array.isArray(it.categoryHints) ? it.categoryHints : ["other"],
              quantity: qty,
              unit_price: unitPrice,
              total_price: lineTotal,
            };

          })
          : [],


      };

      setScannedData(normalized);
      setScreen('scanReview');
    } catch (e) {
      console.log('scanReceipt failed:', e?.message || e);
      Alert.alert('Error', 'Failed to scan receipt');
    } finally {
      setLoading(false);
    }*/
  };

  async function searchProductsForItem(item) {
    const parts = [
      item.company_name,
      item.general_name,
      item.specific_name,
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    if (!parts.length) return [];

    const seen = new Map();

    for (const part of parts) {
      const { data, error } = await supabase
        .from("products")
        .select("id, general_name, specific_name, company_name")
        .eq("user_id", DEV_USER_ID)
        .or(
          `general_name.ilike.%${part}%,specific_name.ilike.%${part}%,company_name.ilike.%${part}%`
        )
        .limit(8);

      if (!error) {
        for (const row of data || []) {
          if (!seen.has(row.id)) seen.set(row.id, row);
        }
      }
    }

    return Array.from(seen.values()).slice(0, 8);
  }

  const pickReceiptImage = async (mode) => {
    try {
      let permission;

      if (mode === 'camera') {
        permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission required', 'Camera permission is needed');
          return;
        }
      } else {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission required', 'Photo library permission is needed');
          return;
        }
      }
      const result =
        mode === 'camera'
          ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.6,
            base64: false,
          })
          : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.6,
            base64: false,
            allowsMultipleSelection: true,
            selectionLimit: 10,
          });

      const uris = !result.canceled
        ? (result.assets || []).map((a) => a.uri).filter(Boolean)
        : [];

      if (!uris.length) return;

      setLoading(true);

      const dataUrls = await Promise.all(
        uris.map((uri) => uriToBase64DataUrl(uri))
      );

      const res = await supabase.functions.invoke('swift-endpoint', {
        body: { images: dataUrls },
      });

      if (res.error) {
        const e = res.error;
        console.log('scan-receipt error:', e);
        Alert.alert('Scan failed', e.message || 'Edge function failed');
        return;
      }

      const payload = res.data || {};
      const items = Array.isArray(payload.items)
        ? await Promise.all(
          payload.items.map(async (it) => {
            const qty = Number(it.quantity ?? 1);
            const lineTotal = Number(it.lineTotal ?? it.line_total ?? it.price ?? 0);
            const unitPrice =
              it.unitPrice != null
                ? Number(it.unitPrice)
                : (qty > 0 ? lineTotal / qty : null);

            const baseItem = {
              product_id: null,
              raw_line: String(it.rawLine ?? it.raw_line ?? "").trim(),
              general_name: it.generalName || "",
              specific_name: it.specificName || "",
              company_name: it.brandExpanded || "",
              tags: Array.isArray(it.tags) ? it.tags : [],
              category_hints: Array.isArray(it.categoryHints) ? it.categoryHints : ["other"],
              quantity: qty,
              unit_price: unitPrice,
              total_price: lineTotal,
            };

            const resolved = await resolveIncomingItemToProduct(baseItem);

            return {
              ...baseItem,
              product_id: resolved.product_id,
              matched_by: resolved.matched_by,
              input_text: resolved.input_text,
            };
          })
        )
        : [];

      // preload DB suggestions for scanned items
      const preloadedSuggestions = {};
      for (let i = 0; i < items.length; i++) {
        if (items[i].product_id) continue;
        try {
          const matches = await searchProductsForItem(items[i]);
          if (matches.length) {
            preloadedSuggestions[i] = matches;
          }
        } catch (err) {
          console.log(`preload suggestions failed for item ${i}:`, err?.message || err);
        }
      }

      const normalized = {
        store_name: payload.storeName || payload.store_name || "",
        date: payload.date ? isoDateOnly(payload.date) : isoDateOnly(new Date()),
        amount: Number(payload.total ?? payload.amount ?? 0),
        currency: "USD",
        payment_type: payload.paymentType || payload.payment_type || "unknown",
        items,
        preloadedSuggestions,
        category_id: pickCategoryIdFromHints(
          categories,
          items,
          defaultCategoryId ?? categories[0]?.id ?? null
        ),
      };

      setScannedData({
        ...normalized,
        preloadedSuggestions,
      });

      console.log("NORMALIZED date:", payload.date ? isoDateOnly(payload.date) : isoDateOnly(new Date()));
      setScreen('scanReview');
    } catch (e) {
      console.log('pickReceiptImage error:', e?.message || e);
      Alert.alert('Error', 'Failed to pick/scan receipt');
    } finally {
      setLoading(false);
    }
  };

  const deleteExpense = async (expense) => {
    Alert.alert(
      "Delete receipt?",
      "This will delete the receipt and all its items.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              // If you don't have ON DELETE CASCADE, see section (3) below
              const { error } = await supabase
                .from("expenses")
                .delete()
                .eq("id", expense.id)
                .eq("user_id", DEV_USER_ID);

              if (error) throw error;

              Alert.alert("Deleted", "Receipt deleted.");
              await fetchExpenses();
              setScreen("home");
            } catch (e) {
              Alert.alert("Error", e?.message || "Failed to delete receipt");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };


  // --- Save receipt (expense + products + receipt_items) ---
  const saveReceipt = async () => {
    if (!scannedData) return;

    setLoading(true);
    try {
      // 1️⃣ insert expense
      const { data: expenseRows, error: expenseError } = await supabase
        .from('expenses')
        .insert([{
          user_id: DEV_USER_ID,
          store_name: scannedData.store_name,
          date: scannedData.date,
          amount: scannedData.amount,
          currency: scannedData.currency || 'USD',
          category_id: scannedData.category_id,
          payment_type: scannedData.payment_type,
        }])
        .select()
        .single();

      if (expenseError) throw expenseError;

      const expenseId = expenseRows.id;

      // 2️⃣ insert products + receipt items
      for (const item of scannedData.items) {
        const general = (item.general_name || '').trim();
        const specific = (item.specific_name || general).trim();
        const company = (item.company_name || "").trim();

        // ✅ GUARD: don't insert blank products
        if (!general && !specific) {
          continue; // or set a placeholder instead
        }

        let productId = item.product_id;

        if (!productId) {
          const existing = await findExistingProductMatch(item);

          if (existing) {
            productId = existing.id;

            const aliasInput = getAliasInput(item);

            await saveProductAlias(aliasInput, productId);
          } else {
            const aliasInput = getAliasInput(item);
            const { data: productRow, error: productError } = await supabase
              .from('products')
              .insert([{
                user_id: DEV_USER_ID,
                general_name: general || specific,
                specific_name: specific || general,
                company_name: company,
              }])
              .select('id')
              .single();

            if (productError) throw productError;

            productId = productRow.id;

            await saveProductAlias(aliasInput, productId);
          }
        }



        const { error: riError } = await supabase
          .from('receipt_items')
          .insert([{
            expense_id: expenseId,
            product_id: productId,
            raw_line: item.raw_line || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            line_total: item.total_price, // only if you added the column
          }]);


        if (riError) throw riError;
      }



      Alert.alert('Success', 'Receipt saved!');
      setScannedData(null);
      await fetchExpenses();
      setScreen('home');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', e?.message || 'Failed to save receipt');
    } finally {
      setLoading(false);
    }
  };


  // --- Categories (admin-created, but editable via app) ---

  const createCategorySupabase = async (name, color, icon) => {
    if (!name || !color || !icon) {
      Alert.alert('Error', 'All fields required');
      return;
    }

    const { error } = await supabase
      .from('categories')
      .insert([{ name, color, icon }]);

    if (error) {
      Alert.alert('Error', 'Failed to create category');
      return;
    }

    fetchCategories();
  };



  // --- Analytics from expenses list ---
  const calculateAnalytics = (expenseData) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      monthlyMap[months[d.getMonth()]] = 0;
    }

    expenseData.forEach((exp) => {
      const expDate = new Date(exp.date);
      const monthKey = months[expDate.getMonth()];
      if (Object.prototype.hasOwnProperty.call(monthlyMap, monthKey)) {
        monthlyMap[monthKey] += Number(exp.amount || 0);
      }
    });

    setMonthlyData(Object.entries(monthlyMap).map(([month, amount]) => ({ month, amount })));

    const thisMonthExpenses = expenseData.filter((exp) => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
    });

    const monthTotal = thisMonthExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    setTotalThisMonth(monthTotal);

    const categoryMap = {};
    thisMonthExpenses.forEach((exp) => {
      const catName = exp.categories?.name || 'Uncategorized';
      const catColor = exp.categories?.color || '#999';
      if (!categoryMap[catName]) categoryMap[catName] = { name: catName, amount: 0, color: catColor };
      categoryMap[catName].amount += Number(exp.amount || 0);
    });

    setCategoryBreakdown(
      Object.values(categoryMap).map((cat) => ({
        ...cat,
        percentage: monthTotal > 0 ? ((cat.amount / monthTotal) * 100).toFixed(1) : '0.0',
      }))
    );
  };

  // --- Store/Product Stats (queries) ---
  const loadStoreStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receipt_items')
        .select(`
        quantity,
        total_price,
        expenses(store_name, amount, date),
        products(id, general_name, specific_name, company_name)
      `)
        .limit(5000);

      if (error) throw error;

      const map = {};

      for (const row of data || []) {
        const exp = row.expenses;
        const product = row.products;
        const store = exp?.store_name || '';

        if (!store) continue;

        if (!map[store]) {
          map[store] = {
            store_name: store,
            total: 0,
            receipts: 0,
            last_date: exp?.date || null,
            total_item_qty: 0,
            productCounts: {},
            uniqueProducts: new Set(),
            seenReceiptDates: new Set(),
          };
        }

        map[store].total += Number(row.total_price || 0);
        map[store].total_item_qty += Number(row.quantity || 0);

        if (exp?.date && (!map[store].last_date || new Date(exp.date) > new Date(map[store].last_date))) {
          map[store].last_date = exp.date;
        }

        if (product?.id) {
          const productName =
            product.general_name || product.specific_name || 'Unknown Item';

          map[store].productCounts[productName] =
            (map[store].productCounts[productName] || 0) + Number(row.quantity || 0);

          map[store].uniqueProducts.add(product.id);
        }
      }

      const { data: expenseRows, error: expenseError } = await supabase
        .from('expenses')
        .select('store_name, amount, date')
        .eq('user_id', DEV_USER_ID);

      if (expenseError) throw expenseError;

      for (const exp of expenseRows || []) {
        const store = exp.store_name || '';
        if (!store || !map[store]) continue;
        map[store].receipts += 1;
      }

      const rows = Object.values(map).map((store) => {
        let most_ordered_item = '';
        let most_ordered_count = 0;

        for (const [itemName, count] of Object.entries(store.productCounts)) {
          if (count > most_ordered_count) {
            most_ordered_item = itemName;
            most_ordered_count = count;
          }
        }

        return {
          ...store,
          avg_spend_per_visit: store.receipts ? store.total / store.receipts : 0,
          unique_product_count: store.uniqueProducts.size,
          most_ordered_item,
        };
      });

      rows.sort((a, b) => b.total - a.total);

      setStoreStats(rows);
      setScreen('storeStats');
    } catch (e) {
      console.log('loadStoreStats error:', e.message);
      Alert.alert('Error', 'Failed to load store stats');
    } finally {
      setLoading(false);
    }
  };

  const loadProductStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receipt_items')
        .select(`
        quantity,
        unit_price,
        total_price,
        expense_id,
        expenses(store_name, date),
        products(id, user_id, general_name, specific_name, company_name)
      `)
        .eq('products.user_id', DEV_USER_ID)
        .limit(5000);

      if (error) throw error;

      const map = {};

      for (const row of data || []) {
        const p = row.products;
        const exp = row.expenses;

        if (!p?.id) continue;

        if (!map[p.id]) {
          map[p.id] = {
            product_id: p.id,
            general_name: p.general_name || '',
            specific_name: p.specific_name || '',
            company_name: p.company_name || '',
            total_spent: 0,
            total_qty: 0,
            lines: 0,
            last_date: exp?.date || null,
            storeCounts: {},
            avg_unit_price_sum: 0,
            avg_unit_price_count: 0,
          };
        }

        map[p.id].total_spent += Number(row.total_price || 0);
        map[p.id].total_qty += Number(row.quantity || 0);
        map[p.id].lines += 1;

        if (row.unit_price != null) {
          map[p.id].avg_unit_price_sum += Number(row.unit_price);
          map[p.id].avg_unit_price_count += 1;
        }

        if (exp?.date && (!map[p.id].last_date || new Date(exp.date) > new Date(map[p.id].last_date))) {
          map[p.id].last_date = exp.date;
        }

        if (exp?.store_name) {
          map[p.id].storeCounts[exp.store_name] = (map[p.id].storeCounts[exp.store_name] || 0) + 1;
        }
      }

      const rows = Object.values(map).map((item) => {
        let top_store = '';
        let top_store_count = 0;

        for (const [store, count] of Object.entries(item.storeCounts)) {
          if (count > top_store_count) {
            top_store = store;
            top_store_count = count;
          }
        }

        return {
          ...item,
          avg_price_per_line: item.lines ? item.total_spent / item.lines : 0,
          avg_unit_price: item.avg_unit_price_count
            ? item.avg_unit_price_sum / item.avg_unit_price_count
            : 0,
          top_store,
        };
      });

      rows.sort((a, b) => b.total_spent - a.total_spent);

      setProductStats(rows);
      setScreen('productStats');
    } catch (e) {
      console.log('loadProductStats error:', e.message);
      Alert.alert('Error', 'Failed to load product stats');
    } finally {
      setLoading(false);
    }
  };

  // ---------- If user is null ----------
  // NOTE: This will spin forever if you never sign in.
  // In your real app you should add a login screen here.


  // ---------- Render Screens ----------
  return (
    <View style={styles.container}>
      {screen === 'home' && (
        <HomeScreen
          expenses={expenses}
          monthlyData={monthlyData}
          totalThisMonth={totalThisMonth}
          onOpenExpense={fetchExpenseDetail}
          onScan={scanReceipt}
          onGo={(s) => setScreen(s)}
          onStoreStats={loadStoreStats}
          onProductStats={loadProductStats}
          loading={loading}
        />
      )}

      {screen === 'expenses' && (
        <ExpensesScreen
          expenses={filteredExpenses}
          allExpenses={expenses}
          expenseMonthFilter={expenseMonthFilter}
          setExpenseMonthFilter={setExpenseMonthFilter}
          expenseStoreFilter={expenseStoreFilter}
          setExpenseStoreFilter={setExpenseStoreFilter}
          availableMonths={availableMonths}
          onOpenExpense={fetchExpenseDetail}
          onScan={scanReceipt}
          onGo={setScreen}
        />
      )}

      {screen === 'expenseDetail' && (
        <ExpenseDetailScreen
          expense={selectedExpense}
          items={expenseItems}
          onGo={setScreen}
          loading={loading}
          onDeleteExpense={deleteExpense}
          onDeleteItem={deleteReceiptItem}
          onUpdateExpense={updateExpenseDetails}
        />
      )}

      {screen === 'scanReview' && (
        <ScanReviewScreen
          scannedData={scannedData}
          setScannedData={setScannedData}
          categories={categories}
          onSave={saveReceipt}
          onClose={() => setScreen('home')}
          loading={loading}
        />
      )}

      {screen === 'categories' && (
        <CategoriesScreen
          categories={categories}
          onCreateCategory={createCategorySupabase}
          onGo={setScreen}
          onScan={scanReceipt}
        />
      )}

      {screen === 'storeStats' && (
        <StoreStatsScreen
          rows={storeStats}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'productStats' && (
        <ProductStatsScreen
          rows={productStats}
          onBack={() => setScreen('home')}
        />
      )}
    </View>
  );
}

// ---------- SCREENS ----------
function HomeScreen({
  expenses,
  monthlyData,
  totalThisMonth,
  onOpenExpense,
  onScan,
  onGo,
  onStoreStats,
  onProductStats,
  loading,
}) {
  const maxAmount = Math.max(...(monthlyData || []).map((m) => Number(m.amount || 0)), 1);
  const recentExpenses = (expenses || []).slice(0, 5);
  const monthlyLineData = makeMonthlyLineData(expenses);

  return (

    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <Text style={styles.homeTitle}>Expenses</Text>
          <TouchableOpacity style={styles.pillBtn} onPress={onStoreStats}>
            <Text style={styles.pillText}>Store Stats</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.homeHeader2}>
          <Text style={styles.sectionTitle}>Last 7 months</Text>
          <TouchableOpacity style={styles.pillBtnGray} onPress={onProductStats}>
            <Text style={styles.pillTextGray}>Product Stats</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.barChart}>
            {(monthlyData || []).map((item, idx) => {
              const barHeight = (Number(item.amount || 0) / maxAmount) * 120;
              const isMax = Number(item.amount || 0) === maxAmount;
              return (
                <View key={idx} style={styles.barWrapper}>
                  <Text style={styles.barLabel}>${Number(item.amount || 0).toFixed(0)}</Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.bar, { height: barHeight || 4, backgroundColor: isMax ? '#6C5CE7' : '#E8E8E8' }]} />
                  </View>
                  <Text style={styles.monthLabel}>{item.month}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.chartCardHome}>
          <Text style={styles.chartSectionTitle}>Spending Trend</Text>
          <LineChart
            data={monthlyLineData}
            width={chartWidth}
            height={220}
            yAxisLabel="$"
            fromZero
            chartConfig={commonChartConfig}
            bezier
            style={styles.chartStyle}
          />
        </View>

        <View style={styles.monthSummaryMini}>
          <Text style={styles.summaryText}>
            This month: <Text style={styles.summaryAmount}>${Number(totalThisMonth || 0).toFixed(0)}</Text>
          </Text>
        </View>

        <View style={styles.transactionsHeader}>
          <Text style={styles.sectionTitle}>Recent receipts</Text>
          <TouchableOpacity onPress={() => onGo('expenses')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentExpenses.map((exp) => (
          <TouchableOpacity key={exp.id} style={styles.transactionCard} onPress={() => onOpenExpense(exp)}>
            <View style={styles.transactionLeft}>
              <View style={styles.iconCircle}>
                <MaterialIcons name={exp.categories?.icon || 'shopping-cart'} size={24} color="#000" />
              </View>
              <View>
                <Text style={styles.transactionStore}>{exp.store_name}</Text>
                <Text style={styles.transactionType}>{exp.categories?.name || 'Uncategorized'}</Text>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text style={styles.transactionAmount}>${Number(exp.amount || 0)}</Text>
              <Text style={styles.transactionDate}>
                {new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={onScan}>
        <MaterialIcons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => onGo('home')}>
          <MaterialIcons name="home" size={28} color="#FF6B4A" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onGo('categories')}>
          <MaterialIcons name="category" size={28} color="#C0C0C0" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onGo('expenses')}>
          <MaterialIcons name="receipt-long" size={28} color="#C0C0C0" />
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      )}
    </View>

  );
}

function ExpensesScreen({
  expenses,
  allExpenses,
  expenseMonthFilter,
  setExpenseMonthFilter,
  expenseStoreFilter,
  setExpenseStoreFilter,
  availableMonths,
  onOpenExpense,
  onScan,
  onGo,
}) {
  const availableStores = Array.from(
    new Set((allExpenses || []).map((e) => e.store_name).filter(Boolean))
  ).sort();

  const filteredTotal = (expenses || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.simpleHeaderRow}>
        <TouchableOpacity onPress={() => onGo('home')}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.simpleTitle}>All Expenses</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              expenseMonthFilter === 'all' && styles.filterChipSelected
            ]}
            onPress={() => setExpenseMonthFilter('all')}
          >
            <Text
              style={[
                styles.filterChipText,
                expenseMonthFilter === 'all' && styles.filterChipTextSelected
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {(availableMonths || []).map((month) => (
            <TouchableOpacity
              key={month}
              style={[
                styles.filterChip,
                expenseMonthFilter === month && styles.filterChipSelected
              ]}
              onPress={() => setExpenseMonthFilter(month)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  expenseMonthFilter === month && styles.filterChipTextSelected
                ]}
              >
                {month}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Store</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              expenseStoreFilter === 'all' && styles.filterChipSelected
            ]}
            onPress={() => setExpenseStoreFilter('all')}
          >
            <Text
              style={[
                styles.filterChipText,
                expenseStoreFilter === 'all' && styles.filterChipTextSelected
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {availableStores.map((store) => (
            <TouchableOpacity
              key={store}
              style={[
                styles.filterChip,
                expenseStoreFilter === store && styles.filterChipSelected
              ]}
              onPress={() => setExpenseStoreFilter(store)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  expenseStoreFilter === store && styles.filterChipTextSelected
                ]}
              >
                {store}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.filterSummaryRow}>
          <Text style={styles.filterSummaryText}>
            {expenses.length} receipt{expenses.length === 1 ? '' : 's'} · ${money(filteredTotal)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setExpenseMonthFilter('all');
              setExpenseStoreFilter('all');
            }}
          >
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={{ color: '#6B7280', fontSize: 14 }}>
              No receipts match the current filters.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.expenseCard} onPress={() => onOpenExpense(item)}>
            <View style={styles.expenseLeft}>
              <MaterialIcons
                name={item.categories?.icon || 'shopping-cart'}
                size={32}
                color={item.categories?.color || '#999'}
              />
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseStore}>{item.store_name}</Text>
                <Text style={styles.expenseCategory}>{item.categories?.name || 'Uncategorized'}</Text>
              </View>
            </View>
            <View style={styles.expenseRight}>
              <Text style={styles.expenseAmount}>${money(item.amount)}</Text>
              <Text style={styles.expenseDate}>{isoDateOnly(item.date)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

    </View>
  );

}

async function searchProducts(q) {
  const query = (q || "").trim();
  if (!query) return [];

  // Simple OR search across the 3 fields
  const { data, error } = await supabase
    .from("products")
    .select("id, general_name, specific_name, company_name")
    .eq("user_id", DEV_USER_ID)
    .or(
      `general_name.ilike.%${query}%,specific_name.ilike.%${query}%,company_name.ilike.%${query}%`
    )
    .limit(8);

  if (error) return [];
  return data || [];
}


function ExpenseDetailScreen({
  expense,
  items,
  onGo,
  loading,
  onDeleteExpense,
  onDeleteItem,
  onUpdateExpense,
}) {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [editStoreName, setEditStoreName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPaymentType, setEditPaymentType] = useState('');

  useEffect(() => {
    setEditStoreName(expense?.store_name || '');
    setEditDate(isoDateOnly(expense?.date) || '');
    setEditAmount(String(expense?.amount ?? ''));
    setEditPaymentType(expense?.payment_type || '');
  }, [expense]);

  const handleSaveEdit = async () => {
    const ok = await onUpdateExpense(expense.id, {
      store_name: editStoreName,
      date: editDate,
      amount: editAmount,
      payment_type: editPaymentType,
    });

    if (ok) {
      setShowEditModal(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={() => onGo('expenses')}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.detailTitleWrap}
          onPress={() => setShowEditModal(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.detailTitle}>
            {expense?.store_name || 'Receipt'}
          </Text>
          <MaterialIcons name="edit" size={18} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onDeleteExpense(expense)}>
          <MaterialIcons name="delete" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.expenseDetailHeader}>
          <Text style={styles.expenseDetailAmount}>${money(expense?.amount)}</Text>
          <Text style={styles.expenseDetailDate}>{isoDateOnly(expense?.date)}</Text>
          <Text style={styles.expenseDetailPayment}>{expense?.payment_type || ''}</Text>

          <TouchableOpacity
            style={styles.inlineEditBtn}
            onPress={() => setShowEditModal(true)}
          >
            <MaterialIcons name="edit" size={16} color="#6C5CE7" />
            <Text style={styles.inlineEditText}>Edit receipt</Text>
          </TouchableOpacity>
        </View>

        {(items || []).map((it) => {
          const expanded = expandedItemId === it.id;

          return (
            <TouchableOpacity
              key={it.id}
              style={styles.itemDetailCard}
              activeOpacity={0.85}
              onPress={() =>
                setExpandedItemId(expanded ? null : it.id)
              }
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.itemGenName}>
                  {it.products?.general_name || 'Item'}
                </Text>
                <Text style={styles.itemSpecName}>
                  {it.products?.specific_name || ''}
                </Text>
                <Text style={styles.itemCompName}>
                  {it.products?.company_name || ''}
                </Text>

                {expanded && (
                  <View style={styles.itemActionRow}>
                    <TouchableOpacity
                      style={styles.itemDeleteBtn}
                      onPress={() => onDeleteItem(it)}
                    >
                      <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                      <Text style={styles.itemDeleteText}>Delete item</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.itemDetailRight}>
                <Text style={styles.itemQty}>
                  {Number(it.quantity || 0)} × ${money(it.unit_price)}
                </Text>
                <Text style={styles.itemTotalPrice}>${money(it.total_price)}</Text>
                <MaterialIcons
                  name={expanded ? "expand-less" : "expand-more"}
                  size={20}
                  color="#9CA3AF"
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModalCard}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Receipt</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <MaterialIcons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Store Name"
              placeholderTextColor={PH}
              value={editStoreName}
              onChangeText={setEditStoreName}
            />

            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={PH}
              value={editDate}
              onChangeText={setEditDate}
            />

            <TextInput
              style={styles.input}
              placeholder="Total Amount"
              placeholderTextColor={PH}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={setEditAmount}
            />

            <TextInput
              style={styles.input}
              placeholder="Payment Type"
              placeholderTextColor={PH}
              value={editPaymentType}
              onChangeText={setEditPaymentType}
            />

            <TouchableOpacity style={styles.saveEditBtn} onPress={handleSaveEdit}>
              <Text style={styles.saveEditBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      )}
    </View>
  );
}

function ScanReviewScreen({ scannedData, setScannedData, categories, onSave, onClose, loading }) {
  const [suggestionsByIndex, setSuggestionsByIndex] = useState(
    scannedData?.preloadedSuggestions || {}
  );

  const [amountText, setAmountText] = useState(String(scannedData?.amount ?? ''));
  useEffect(() => {
    setSuggestionsByIndex(scannedData?.preloadedSuggestions || {});
  }, [scannedData]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // tweak if needed
    >
      <View style={{ flex: 1 }}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>Review Receipt</Text>
          <TouchableOpacity onPress={onSave}>
            <MaterialIcons name="check" size={24} color="#6C5CE7" />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 90 }}
          enableOnAndroid={true}
          extraScrollHeight={24}
          keyboardShouldPersistTaps="handled"
        >


          <TextInput
            style={styles.input}
            placeholder="Store Name"
            placeholderTextColor={PH}
            value={scannedData?.store_name}
            onChangeText={(text) => setScannedData({ ...scannedData, store_name: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Date (YYYY-MM-DD)"
            placeholderTextColor={PH}
            value={scannedData?.date}
            onChangeText={(text) => setScannedData({ ...scannedData, date: text })}
          />
          <TextInput
            style={styles.input}
            placeholderTextColor={PH}
            placeholder="Amount"
            value={amountText}
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              // allow digits + one dot
              const cleaned = text.replace(/[^0-9.]/g, '');
              const oneDot =
                cleaned.indexOf('.') === -1
                  ? cleaned
                  : cleaned.slice(0, cleaned.indexOf('.') + 1) +
                  cleaned.slice(cleaned.indexOf('.') + 1).replace(/\./g, '');

              setAmountText(oneDot);
              setScannedData({ ...scannedData, amount: oneDot }); // keep as string for now
            }}
          />

          <TextInput
            style={styles.input}
            placeholderTextColor={PH}
            placeholder="Payment Type"
            value={scannedData?.payment_type}
            onChangeText={(text) => setScannedData({ ...scannedData, payment_type: text })}
          />

          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {(categories || []).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, scannedData?.category_id === cat.id && styles.categoryChipSelected]}
                onPress={() => setScannedData({ ...scannedData, category_id: cat.id })}
              >
                <MaterialIcons name={cat.icon} size={20} color={cat.color} />
                <Text style={styles.categoryChipText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Items</Text>
          {(scannedData?.items || []).map((item, idx) => (
            <View key={idx} style={styles.reviewItemCard}>
              <View style={styles.reviewItemHeaderRow}>

                <Text style={styles.reviewItemHeaderText}>Item {idx + 1}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const items = [...scannedData.items];
                    items.splice(idx, 1);
                    setScannedData({ ...scannedData, items });

                    // ✅ easiest: wipe suggestions so indexes can’t mismatch
                    setSuggestionsByIndex({});
                  }}
                >
                  <MaterialIcons name="delete" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>

              {item.product_id && item.matched_by === "alias" && (
                <Text style={{ color: "#059669", fontSize: 12, marginBottom: 6 }}>
                  Matched from alias
                </Text>
              )}

              {item.product_id && item.matched_by === "existing_product_match" && (
                <Text style={{ color: "#2563EB", fontSize: 12, marginBottom: 6 }}>
                  Matched from existing product
                </Text>
              )}

              {item.product_id && item.matched_by === "manual_selection" && (
                <Text style={{ color: "#7C3AED", fontSize: 12, marginBottom: 6 }}>
                  Selected manually
                </Text>
              )}

              {!item.product_id && (
                <Text style={{ color: "#D97706", fontSize: 12, marginBottom: 6 }}>
                  Needs review
                </Text>
              )}

              <TextInput
                style={styles.reviewInput}
                placeholder="General Name"
                placeholderTextColor={PH}
                value={item.general_name}
                onBlur={() => {
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                }}
                onChangeText={async (text) => {
                  const items = [...scannedData.items];
                  items[idx] = {
                    ...items[idx],
                    general_name: text,
                    product_id: null,
                    matched_by: null,
                  };
                  setScannedData({ ...scannedData, items });

                  if (text.trim().length < 2) {
                    setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                    return;
                  }

                  const results = await searchProducts(text);
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: results }));
                }}

              />
              <TextInput
                style={styles.reviewInput}
                placeholder="Specific Name"
                placeholderTextColor={PH}
                value={item.specific_name}
                onBlur={() => {
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                }}
                onChangeText={async (text) => {
                  const items = [...scannedData.items];
                  items[idx] = {
                    ...items[idx],
                    specific_name: text,
                    product_id: null,
                    matched_by: null,
                  };
                  setScannedData({ ...scannedData, items });

                  const results = await searchProducts(text);
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: results }));
                }}

              />

              <TextInput
                style={styles.reviewInput}
                placeholder="Company / Brand"
                placeholderTextColor={PH}
                value={item.company_name}
                onBlur={() => {
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                }}
                onChangeText={async (text) => {
                  const items = [...scannedData.items];
                  items[idx] = {
                    ...items[idx],
                    company_name: text,
                    product_id: null,
                    matched_by: null,
                  };
                  setScannedData({ ...scannedData, items });

                  const results = await searchProducts(text);
                  setSuggestionsByIndex((prev) => ({ ...prev, [idx]: results }));
                }}

              />

              {(suggestionsByIndex[idx] || []).length > 0 && (
                <View style={styles.dropdown}>
                  <View style={styles.dropdownHeader}>
                    <Text style={styles.dropdownHeaderText}>Suggestions</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                      }}
                    >
                      <MaterialIcons name="close" size={18} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  {(suggestionsByIndex[idx] || []).map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.dropdownRow}
                      onPress={async () => {
                        const items = [...scannedData.items];
                        const currentItem = items[idx];

                        items[idx] = {
                          ...items[idx],
                          product_id: p.id,
                          general_name: p.general_name || "",
                          specific_name: p.specific_name || "",
                          company_name: p.company_name || "",
                          matched_by: "manual_selection",
                        };

                        setScannedData({ ...scannedData, items });

                        const aliasInput = getAliasInput(currentItem);
                        await saveProductAlias(aliasInput, p.id);

                        setSuggestionsByIndex((prev) => ({ ...prev, [idx]: [] }));
                      }}
                    >
                      <Text style={styles.dropdownTitle}>
                        {p.general_name} • {p.company_name}
                      </Text>
                      <Text style={styles.dropdownSub}>
                        {p.specific_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}


              <TextInput
                style={styles.reviewInput}
                placeholder="Tags (comma separated)"
                placeholderTextColor={PH}
                value={(item.tags || []).join(", ")}
                onChangeText={(text) => {
                  const items = [...scannedData.items];
                  items[idx] = {
                    ...items[idx],
                    tags: text
                      .split(",")
                      .map((t) => t.trim().toLowerCase())
                      .filter(Boolean),
                  };
                  setScannedData({ ...scannedData, items });
                }}
              />


              <View style={styles.reviewItemRow}>
                <TextInput
                  style={styles.reviewTinyInput}
                  placeholder="Qty"
                  value={String(item.quantity)}
                  keyboardType="numeric"
                  onChangeText={(text) => {
                    const items = [...scannedData.items];
                    items[idx] = { ...items[idx], quantity: Number(text) || 0 };
                    setScannedData({ ...scannedData, items });
                  }}
                />
                <TextInput
                  style={styles.reviewTinyInput}
                  placeholder="Unit $"
                  value={String(item.unit_price)}
                  keyboardType="numeric"
                  onChangeText={(text) => {
                    const items = [...scannedData.items];
                    items[idx] = { ...items[idx], unit_price: text };
                    setScannedData({ ...scannedData, items });
                  }}
                />
                <TextInput
                  style={styles.reviewTinyInput}
                  placeholder="Total $"
                  value={String(item.total_price)}
                  keyboardType="decimal-pad"
                  onChangeText={(text) => {
                    const items = [...scannedData.items];
                    items[idx] = { ...items[idx], total_price: text };
                    setScannedData({ ...scannedData, items });
                  }}
                />
              </View>
            </View>
          ))}
        </KeyboardAwareScrollView>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C5CE7" />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function pickCategoryIdFromHints(categories, items, fallbackId) {
  if (!Array.isArray(categories) || !categories.length) return fallbackId;
  if (!Array.isArray(items) || !items.length) return fallbackId;

  const catByName = new Map(
    categories.map(c => [(c.name || '').toLowerCase(), c.id])
  );

  // count hints
  const counts = {};
  for (const it of items) {
    const hints = Array.isArray(it.category_hints) ? it.category_hints : [];
    for (const h of hints) {
      const key = String(h || '').toLowerCase().trim();
      if (!key) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  // pick the most common hint that matches an existing category name
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [hint] of sorted) {
    const id = catByName.get(hint);
    if (id) return id;
  }

  return fallbackId;
}


function CategoriesScreen({ categories, onCreateCategory, onGo, onScan }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6C5CE7');
  const [newIcon, setNewIcon] = useState('shopping-cart');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const iconList = [
    'shopping-cart',
    'restaurant',
    'local-gas-station',
    'movie',
    'fitness-center',
    'home',
    'flight',
    'medical-services',
    'school',
    'pets',
    'sports-esports',
    'music-note',
    'store',
    'local-grocery-store',
    'coffee',
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.simpleHeaderRow}>
        <TouchableOpacity onPress={() => onGo('home')}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.simpleTitle}>Categories</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 120 }}>
        {(categories || []).map((cat) => (
          <View key={cat.id} style={styles.catCard}>
            <MaterialIcons name={cat.icon} size={32} color={cat.color} />
            <Text style={styles.catCardName}>{cat.name}</Text>
          </View>
        ))}

        <Text style={styles.sectionLabel}>Add New Category</Text>
        <TextInput style={styles.input} placeholder="Name" value={newName} onChangeText={setNewName} />
        <TextInput style={styles.input} placeholder="Color (#RRGGBB)" value={newColor} onChangeText={setNewColor} />

        <TouchableOpacity style={styles.iconPickBtn} onPress={() => setShowIconPicker(!showIconPicker)}>
          <MaterialIcons name={newIcon} size={24} color={newColor} />
          <Text style={styles.iconPickText}>{newIcon}</Text>
        </TouchableOpacity>

        {showIconPicker && (
          <View style={styles.iconList}>
            {iconList.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={styles.iconItem}
                onPress={() => {
                  setNewIcon(icon);
                  setShowIconPicker(false);
                }}
              >
                <MaterialIcons name={icon} size={28} color="#333" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => {
            onCreateCategory(newName.trim(), newColor.trim(), newIcon);
            setNewName('');
            setNewColor('#6C5CE7');
            setNewIcon('shopping-cart');
          }}
        >
          <Text style={styles.createButtonText}>Create Category</Text>
        </TouchableOpacity>
      </ScrollView>


    </View>
  );
}

function StoreStatsScreen({ rows, onBack }) {
  const barData = makeTopStoresBarData(rows);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.simpleHeaderRow}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.simpleTitle}>Store Stats</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.store_name}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {rows?.length > 0 && (
              <>
                <Text style={styles.chartSectionTitle}>Top Stores by Spend</Text>
                <View style={styles.chartCard}>
                  <BarChart
                    data={barData}
                    width={chartWidth}
                    height={220}
                    yAxisLabel="$"
                    fromZero
                    showValuesOnTopOfBars
                    chartConfig={commonChartConfig}
                    style={styles.chartStyle}
                  />
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>{item.store_name}</Text>
            <Text style={styles.statsSub}>
              Total: ${money(item.total)} · Receipts: {item.receipts}
            </Text>
            <Text style={styles.statsSub}>Last: {isoDateOnly(item.last_date)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={{ color: '#6B7280' }}>No store stats yet.</Text>
          </View>
        }
      />
    </View>
  );
}

function ProductStatsScreen({ rows, onBack }) {
  const barData = makeTopProductsBarData(rows);
  const pieData = makeProductPieData(rows);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.simpleHeaderRow}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.simpleTitle}>Product Stats</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.product_id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {rows?.length > 0 && (
              <>
                <Text style={styles.chartSectionTitle}>Top Products by Spend</Text>
                <View style={styles.chartCard}>
                  <BarChart
                    data={barData}
                    width={chartWidth}
                    height={220}
                    yAxisLabel="$"
                    fromZero
                    showValuesOnTopOfBars
                    chartConfig={commonChartConfig}
                    style={styles.chartStyle}
                  />
                </View>

                <Text style={styles.chartSectionTitle}>Spend Distribution</Text>
                <View style={styles.chartCard}>
                  <PieChart
                    data={pieData}
                    width={chartWidth}
                    height={220}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="8"
                    chartConfig={commonChartConfig}
                    absolute
                  />
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>
              {item.general_name || item.specific_name || 'Product'}
            </Text>
            <Text style={styles.statsSub}>
              {item.specific_name} · {item.company_name}
            </Text>
            <Text style={styles.statsSub}>
              Spent: ${money(item.total_spent)} · Qty: {Number(item.total_qty || 0)} · Lines: {item.lines}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={{ color: '#6B7280' }}>No product stats yet.</Text>
          </View>
        }
      />
    </View>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 50 },
  containerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },

  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  homeHeader2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 6 },
  homeTitle: { fontSize: 28, fontWeight: 'bold', color: '#000' },

  pillBtn: { backgroundColor: '#FF6B4A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  pillText: { color: '#fff', fontWeight: '600' },
  pillBtnGray: { backgroundColor: '#E8E8E8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  pillTextGray: { color: '#333', fontWeight: '600' },

  chartContainer: { backgroundColor: '#fff', marginHorizontal: 20, marginTop: 16, padding: 20, borderRadius: 16 },
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 160 },
  barWrapper: { alignItems: 'center', flex: 1 },
  barLabel: { fontSize: 10, color: '#666', marginBottom: 4 },
  barContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 28, borderTopLeftRadius: 8, borderTopRightRadius: 8, minHeight: 4 },
  monthLabel: { fontSize: 12, color: '#999', marginTop: 8 },

  monthSummaryMini: { paddingHorizontal: 20, marginTop: 14 },
  summaryText: { fontSize: 16, color: '#000' },
  summaryAmount: { fontSize: 18, fontWeight: 'bold', color: '#FF6B4A' },

  transactionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  viewAll: { fontSize: 14, color: '#999' },

  transactionCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transactionLeft: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  transactionStore: { fontSize: 16, fontWeight: '600', color: '#000' },
  transactionType: { fontSize: 13, color: '#999', marginTop: 2 },
  transactionRight: { alignItems: 'flex-end' },
  transactionAmount: { fontSize: 16, fontWeight: 'bold', color: '#2ECC71' },
  transactionDate: { fontSize: 12, color: '#999', marginTop: 2 },

  simpleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff' },
  simpleTitle: { fontSize: 22, fontWeight: 'bold', color: '#000' },

  expenseCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expenseLeft: { flexDirection: 'row', alignItems: 'center' },
  expenseInfo: { marginLeft: 12 },
  expenseStore: { fontSize: 16, fontWeight: '600', color: '#000' },
  expenseCategory: { fontSize: 13, color: '#999', marginTop: 2 },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: 16, fontWeight: 'bold', color: '#2ECC71' },
  expenseDate: { fontSize: 12, color: '#999', marginTop: 2 },

  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff' },
  detailTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  scrollView: { flex: 1 },

  expenseDetailHeader: { backgroundColor: '#fff', padding: 20, alignItems: 'center', marginBottom: 8 },
  expenseDetailAmount: { fontSize: 36, fontWeight: 'bold', color: '#2ECC71' },
  expenseDetailDate: { fontSize: 14, color: '#999', marginTop: 8 },
  expenseDetailPayment: { fontSize: 13, color: '#666', marginTop: 4 },

  itemDetailCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 4, padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between' },
  itemGenName: { fontSize: 16, fontWeight: '600', color: '#000' },
  itemSpecName: { fontSize: 14, color: '#666', marginTop: 4 },
  itemCompName: { fontSize: 12, color: '#999', marginTop: 2 },
  itemDetailRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 13, color: '#999' },
  itemTotalPrice: { fontSize: 16, fontWeight: 'bold', color: '#2ECC71', marginTop: 4 },

  input: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 14, borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: '#E8E8E8' },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: '#000', marginHorizontal: 20, marginTop: 20, marginBottom: 12 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginRight: 8, marginBottom: 8 },
  categoryChipSelected: { backgroundColor: '#E3F2FD', borderWidth: 2, borderColor: '#6C5CE7' },
  categoryChipText: { fontSize: 13, color: '#000', marginLeft: 6 },

  reviewItemCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 12, borderRadius: 12 },
  reviewInput: { backgroundColor: '#F8F9FA', padding: 10, borderRadius: 8, marginVertical: 4, fontSize: 14 },
  reviewItemRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  reviewTinyInput: { backgroundColor: '#F8F9FA', padding: 10, borderRadius: 8, flex: 1, marginHorizontal: 2, fontSize: 14 },

  catCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  catCardName: { fontSize: 16, fontWeight: '600', color: '#000', marginLeft: 12 },

  iconPickBtn: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
  iconPickText: { marginLeft: 12, fontSize: 15, color: '#666' },
  iconList: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 20, marginVertical: 8 },
  iconItem: { padding: 12, margin: 4, backgroundColor: '#F8F9FA', borderRadius: 12 },
  createButton: { backgroundColor: '#6C5CE7', marginHorizontal: 20, marginVertical: 20, padding: 16, borderRadius: 12, alignItems: 'center' },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  statsCard: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6, padding: 16, borderRadius: 12 },
  statsTitle: { fontSize: 16, fontWeight: '700', color: '#000' },
  statsSub: { marginTop: 4, color: '#666' },

  fab: { position: 'absolute', bottom: 90, alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#FF6B4A', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8 },

  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },

  dropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    marginTop: 6,
    overflow: "hidden",
  },
  dropdownRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  dropdownSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  reviewItemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  reviewItemHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },

  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#F9FAFB",
  },
  dropdownHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },

  detailTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '70%',
  },

  inlineEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },

  inlineEditText: {
    marginLeft: 6,
    color: '#6C5CE7',
    fontWeight: '600',
    fontSize: 13,
  },

  itemActionRow: {
    marginTop: 12,
    flexDirection: 'row',
  },

  itemDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },

  itemDeleteText: {
    marginLeft: 6,
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  editModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingBottom: 22,
  },

  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  saveEditBtn: {
    backgroundColor: '#6C5CE7',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  saveEditBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  filterSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
  },

  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },

  filterRow: {
    paddingBottom: 10,
    paddingRight: 8,
  },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },

  filterChipSelected: {
    backgroundColor: '#6C5CE7',
  },

  filterChipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },

  filterChipTextSelected: {
    color: '#fff',
  },

  filterSummaryRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  filterSummaryText: {
    fontSize: 13,
    color: '#6B7280',
  },

  clearFiltersText: {
    fontSize: 13,
    color: '#6C5CE7',
    fontWeight: '600',
  },

  chartSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 10,
  },

  chartCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 10,
    alignItems: 'center',
  },

  chartCardHome: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 10,
    alignItems: 'center',
  },

  chartStyle: {
    borderRadius: 16,
  },


});


