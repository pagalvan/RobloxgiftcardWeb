-- =============================================
-- ESQUEMA DE BASE DE DATOS PARA GIFTCARD STORE
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLA: profiles (Perfiles de usuarios)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'cliente' CHECK (role IN ('admin', 'cliente', 'proveedor')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    'cliente'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TABLA: giftcard_categories (Categorías)
-- =============================================
CREATE TABLE IF NOT EXISTS public.giftcard_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: giftcards (Productos)
-- =============================================
CREATE TABLE IF NOT EXISTS public.giftcards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category_id UUID REFERENCES public.giftcard_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  denomination DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: giftcard_codes (Códigos de GiftCards)
-- =============================================
CREATE TABLE IF NOT EXISTS public.giftcard_codes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  giftcard_id UUID REFERENCES public.giftcards(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  is_sold BOOLEAN DEFAULT false,
  is_redeemed BOOLEAN DEFAULT false,
  provider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda de códigos disponibles
CREATE INDEX IF NOT EXISTS idx_giftcard_codes_available 
ON public.giftcard_codes(giftcard_id, is_sold) 
WHERE is_sold = false;

-- =============================================
-- TABLA: purchases (Compras)
-- =============================================
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  giftcard_id UUID REFERENCES public.giftcards(id) ON DELETE SET NULL NOT NULL,
  giftcard_code_id UUID REFERENCES public.giftcard_codes(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- =============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcard_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA PROFILES
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- POLÍTICAS PARA CATEGORIES
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.giftcard_categories;
CREATE POLICY "Categories are viewable by everyone" ON public.giftcard_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage categories" ON public.giftcard_categories;
CREATE POLICY "Admins can manage categories" ON public.giftcard_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- POLÍTICAS PARA GIFTCARDS
DROP POLICY IF EXISTS "Giftcards are viewable by everyone" ON public.giftcards;
CREATE POLICY "Giftcards are viewable by everyone" ON public.giftcards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage giftcards" ON public.giftcards;
CREATE POLICY "Admins can manage giftcards" ON public.giftcards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- POLÍTICAS PARA GIFTCARD_CODES
DROP POLICY IF EXISTS "Providers can view their own codes" ON public.giftcard_codes;
CREATE POLICY "Providers can view their own codes" ON public.giftcard_codes
  FOR SELECT USING (
    provider_id = auth.uid() OR 
    buyer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Providers can insert codes" ON public.giftcard_codes;
CREATE POLICY "Providers can insert codes" ON public.giftcard_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('proveedor', 'admin')
    )
  );

DROP POLICY IF EXISTS "System can update codes on purchase" ON public.giftcard_codes;
CREATE POLICY "System can update codes on purchase" ON public.giftcard_codes
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Select available codes for purchase" ON public.giftcard_codes;
CREATE POLICY "Select available codes for purchase" ON public.giftcard_codes
  FOR SELECT USING (
    is_sold = false OR 
    buyer_id = auth.uid() OR
    provider_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- POLÍTICAS PARA PURCHASES
DROP POLICY IF EXISTS "Users can view their own purchases" ON public.purchases;
CREATE POLICY "Users can view their own purchases" ON public.purchases
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can create purchases" ON public.purchases;
CREATE POLICY "Users can create purchases" ON public.purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- DATOS INICIALES
-- =============================================

-- Crear categorías de ejemplo
INSERT INTO public.giftcard_categories (name, slug, description, image_url, is_active) VALUES
  ('Roblox', 'roblox', 'Giftcards para Roblox - Compra Robux y más', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Roblox_logo_2022.svg/512px-Roblox_logo_2022.svg.png', true),
  ('PlayStation', 'playstation', 'Tarjetas de PlayStation Store', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Playstation_logo_colour.svg/512px-Playstation_logo_colour.svg.png', true),
  ('Xbox', 'xbox', 'Tarjetas de Xbox y Game Pass', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Xbox_one_logo.svg/512px-Xbox_one_logo.svg.png', true),
  ('Steam', 'steam', 'Tarjetas de Steam Wallet', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/512px-Steam_icon_logo.svg.png', true),
  ('Nintendo', 'nintendo', 'Tarjetas de Nintendo eShop', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Nintendo.svg/512px-Nintendo.svg.png', true)
ON CONFLICT (slug) DO NOTHING;

-- Crear giftcards de ejemplo para Roblox
INSERT INTO public.giftcards (category_id, name, description, price, original_price, denomination, image_url, stock, is_active)
SELECT 
  c.id,
  'Roblox ' || d.value || ' USD',
  'Giftcard de Roblox con valor de $' || d.value || ' USD. Canjea por Robux en la tienda oficial.',
  d.price,
  d.original_price,
  d.value,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Roblox_logo_2022.svg/512px-Roblox_logo_2022.svg.png',
  0,
  true
FROM public.giftcard_categories c
CROSS JOIN (
  VALUES 
    (10, 9.49, 10.99),
    (25, 23.99, 27.99),
    (50, 47.99, 54.99),
    (100, 94.99, 109.99)
) AS d(value, price, original_price)
WHERE c.slug = 'roblox'
ON CONFLICT DO NOTHING;

-- Crear giftcards de ejemplo para PlayStation
INSERT INTO public.giftcards (category_id, name, description, price, original_price, denomination, image_url, stock, is_active)
SELECT 
  c.id,
  'PlayStation Store ' || d.value || ' USD',
  'Tarjeta de PlayStation Store con valor de $' || d.value || ' USD.',
  d.price,
  NULL,
  d.value,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Playstation_logo_colour.svg/512px-Playstation_logo_colour.svg.png',
  0,
  true
FROM public.giftcard_categories c
CROSS JOIN (
  VALUES 
    (10, 9.99),
    (25, 24.99),
    (50, 49.99),
    (100, 99.99)
) AS d(value, price)
WHERE c.slug = 'playstation'
ON CONFLICT DO NOTHING;

-- =============================================
-- FUNCIONES ÚTILES
-- =============================================

-- Función para obtener stock real basado en códigos disponibles
CREATE OR REPLACE FUNCTION get_real_stock(giftcard_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER 
  FROM public.giftcard_codes 
  WHERE giftcard_id = giftcard_uuid AND is_sold = false;
$$ LANGUAGE SQL;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_giftcards_updated_at ON public.giftcards;
CREATE TRIGGER update_giftcards_updated_at
  BEFORE UPDATE ON public.giftcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- GRANT PERMISOS
-- =============================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, authenticated, anon;
