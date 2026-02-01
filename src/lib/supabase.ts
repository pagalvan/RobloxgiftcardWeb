import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Tipos para la base de datos
export type UserRole = 'admin' | 'cliente' | 'proveedor';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface GiftCardCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

export interface GiftCard {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  currency: string;
  denomination: number; // Valor de la giftcard (ej: 10, 25, 50, 100)
  image_url: string;
  stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: GiftCardCategory;
}

export interface GiftCardCode {
  id: string;
  giftcard_id: string;
  code: string; // Código encriptado
  is_sold: boolean;
  is_redeemed: boolean;
  provider_id: string;
  buyer_id?: string;
  sold_at?: string;
  created_at: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  giftcard_id: string;
  giftcard_code_id?: string;
  amount: number;
  status: 'pending' | 'awaiting_confirmation' | 'completed' | 'failed' | 'refunded' | 'rejected';
  payment_method?: string;
  // Campos para pago Nequi
  depositor_name?: string;
  payment_proof_url?: string;
  payment_status: 'pending_payment' | 'awaiting_confirmation' | 'confirmed' | 'rejected';
  payment_confirmed_at?: string;
  payment_confirmed_by?: string;
  rejection_reason?: string;
  // Token para confirmación WhatsApp
  confirmation_token?: string;
  // Campos para código revelado
  is_code_revealed: boolean;
  code_revealed_at?: string;
  created_at: string;
  giftcard?: GiftCard;
  code?: GiftCardCode;
}

export interface StoreSettings {
  id: string;
  setting_key: string;
  setting_value: string;
  description?: string;
  updated_at: string;
}

export interface SiteBanner {
  id: string;
  message: string;
  message_line2?: string;
  is_animated: boolean;
  is_active: boolean;
  background_color: string;
  text_color: string;
  created_at: string;
  updated_at: string;
}

// Funciones de autenticación
export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  });
  
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) return null;
  return data;
}

// Funciones para GiftCards
export async function getCategories(): Promise<GiftCardCategory[]> {
  const { data, error } = await supabase
    .from('giftcard_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data || [];
}

export async function getGiftCards(categoryId?: string): Promise<GiftCard[]> {
  let query = supabase
    .from('giftcards')
    .select(`
      *,
      category:giftcard_categories(*)
    `)
    .eq('is_active', true)
    .gt('stock', 0);
  
  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }
  
  const { data, error } = await query.order('denomination');
  
  if (error) throw error;
  return data || [];
}

export async function getGiftCardById(id: string): Promise<GiftCard | null> {
  const { data, error } = await supabase
    .from('giftcards')
    .select(`
      *,
      category:giftcard_categories(*)
    `)
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

// Funciones para Proveedor
export async function addGiftCardCode(giftcardId: string, code: string, providerId: string) {
  const { data, error } = await supabase
    .from('giftcard_codes')
    .insert({
      giftcard_id: giftcardId,
      code: code,
      provider_id: providerId,
      is_sold: false,
      is_redeemed: false
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Actualizar stock
  await supabase.rpc('increment_stock', { giftcard_id: giftcardId });
  
  return data;
}

export async function getProviderCodes(providerId: string) {
  const { data, error } = await supabase
    .from('giftcard_codes')
    .select(`
      *,
      giftcard:giftcards(name, denomination, currency)
    `)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// Funciones para Cliente
export async function purchaseGiftCard(userId: string, giftcardId: string) {
  // Obtener un código disponible
  const { data: code, error: codeError } = await supabase
    .from('giftcard_codes')
    .select('*')
    .eq('giftcard_id', giftcardId)
    .eq('is_sold', false)
    .limit(1)
    .single();
  
  if (codeError || !code) {
    throw new Error('No hay códigos disponibles');
  }
  
  // Obtener precio de la giftcard
  const giftcard = await getGiftCardById(giftcardId);
  if (!giftcard) throw new Error('Giftcard no encontrada');
  
  // Crear compra y marcar código como vendido
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      user_id: userId,
      giftcard_id: giftcardId,
      giftcard_code_id: code.id,
      amount: giftcard.price,
      status: 'completed'
    })
    .select()
    .single();
  
  if (purchaseError) throw purchaseError;
  
  // Marcar código como vendido
  await supabase
    .from('giftcard_codes')
    .update({ 
      is_sold: true, 
      buyer_id: userId,
      sold_at: new Date().toISOString()
    })
    .eq('id', code.id);
  
  // Decrementar stock
  await supabase.rpc('decrement_stock', { giftcard_id: giftcardId });
  
  return { purchase, code: code.code };
}

export async function getUserPurchases(userId: string): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      *,
      giftcard:giftcards(*),
      code:giftcard_codes(code)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// Funciones Admin
export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId: string, role: UserRole) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function createGiftCard(giftcard: Partial<GiftCard>) {
  const { data, error } = await supabase
    .from('giftcards')
    .insert(giftcard)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateGiftCard(id: string, updates: Partial<GiftCard>) {
  const { data, error } = await supabase
    .from('giftcards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteGiftCard(id: string) {
  const { error } = await supabase
    .from('giftcards')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function createCategory(category: Partial<GiftCardCategory>) {
  const { data, error } = await supabase
    .from('giftcard_categories')
    .insert(category)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getStats() {
  const { data: totalUsers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' });
  
  const { data: totalSales } = await supabase
    .from('purchases')
    .select('amount')
    .eq('status', 'completed');
  
  const { data: totalGiftcards } = await supabase
    .from('giftcards')
    .select('id', { count: 'exact' });
  
  const { data: availableCodes } = await supabase
    .from('giftcard_codes')
    .select('id', { count: 'exact' })
    .eq('is_sold', false);
  
  return {
    totalUsers: totalUsers?.length || 0,
    totalRevenue: totalSales?.reduce((sum, p) => sum + p.amount, 0) || 0,
    totalGiftcards: totalGiftcards?.length || 0,
    availableCodes: availableCodes?.length || 0
  };
}
