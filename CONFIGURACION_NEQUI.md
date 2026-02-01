# Sistema de Pago con Nequi - Guía de Configuración

## 📱 Notificaciones Automáticas por WhatsApp

Las notificaciones ahora se envían **automáticamente** a tu celular cuando un cliente realiza una compra. El cliente **nunca** ve los enlaces de confirmación.

### ⚡ Configuración Rápida de CallMeBot (GRATIS)

Para recibir WhatsApp automáticos necesitas activar CallMeBot:

1. **Agrega este número a tus contactos:** `+34 623 78 95 95`
2. **Envíale este mensaje por WhatsApp:** `I allow callmebot to send me messages`
3. **Recibirás tu API Key** en la respuesta (un número como `123456`)
4. **Ve a Admin → Configuración** y pega el API Key

¡Listo! Ya recibirás notificaciones automáticas.

### Cómo funciona:
1. El cliente sube su comprobante de pago
2. **El sistema te envía un WhatsApp automáticamente** con:
   - Info de la compra (producto, monto, cliente)
   - Enlace para ver el comprobante
   - **Enlace para CONFIRMAR** ✅
   - **Enlace para RECHAZAR** ❌
3. Solo haces clic en el enlace correspondiente desde tu celular
4. El código se asigna al cliente automáticamente

### Ejemplo del mensaje que recibirás:
```
🔔 NUEVA COMPRA PENDIENTE

📦 Producto: Roblox 10 USD
💰 Monto: $45,000
👤 Cliente: Juan Pérez
💳 Depositante: Juan P

📸 Ver comprobante:
[enlace a la imagen]

━━━━━━━━━━━━━━━
✅ CONFIRMAR PAGO:
[enlace para confirmar]

❌ RECHAZAR PAGO:
[enlace para rechazar]
━━━━━━━━━━━━━━━
```

---

## �🔧 Pasos para configurar en Supabase

### 1. Ejecutar Migración SQL
Ejecuta este SQL en **Supabase SQL Editor**:

```sql
-- =============================================
-- MIGRACIÓN PARA SISTEMA DE PAGO NEQUI
-- =============================================

-- 1. Agregar nuevas columnas a purchases
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS depositor_name TEXT;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'confirmed';
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS confirmation_token TEXT UNIQUE;

-- 2. Actualizar constraints de status
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check 
  CHECK (status IN ('pending', 'awaiting_confirmation', 'completed', 'failed', 'refunded', 'rejected'));

-- 3. Agregar constraint de payment_status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_payment_status_check') THEN
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_payment_status_check 
      CHECK (payment_status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'rejected'));
  END IF;
END $$;

-- 4. Crear tabla de configuración de tienda
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Habilitar RLS en store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- 6. Políticas para store_settings
DROP POLICY IF EXISTS "Store settings are viewable by everyone" ON public.store_settings;
CREATE POLICY "Store settings are viewable by everyone" ON public.store_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage store settings" ON public.store_settings;
CREATE POLICY "Admins can manage store settings" ON public.store_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 7. Insertar configuración de Nequi (CAMBIA ESTOS VALORES)
INSERT INTO public.store_settings (setting_key, setting_value, description) VALUES
  ('nequi_phone', '3001234567', 'Número de Nequi para recibir pagos'),
  ('nequi_name', 'Tu Nombre Aquí', 'Nombre del titular de la cuenta Nequi'),
  ('admin_whatsapp', '573001234567', 'Número de WhatsApp del admin (con código de país 57)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- 8. Política para que usuarios puedan actualizar sus compras
DROP POLICY IF EXISTS "Users can update their own purchases" ON public.purchases;
CREATE POLICY "Users can update their own purchases" ON public.purchases
  FOR UPDATE USING (user_id = auth.uid());

-- 9. Política para que admins puedan actualizar cualquier compra
DROP POLICY IF EXISTS "Admins can update any purchase" ON public.purchases;
CREATE POLICY "Admins can update any purchase" ON public.purchases
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 10. Función para decrementar stock (si no existe)
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.giftcards
  SET stock = stock - 1
  WHERE id = product_id AND stock > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Crear Bucket de Storage para Comprobantes

1. Ve a **Supabase Dashboard** → **Storage**
2. Click en **New Bucket**
3. Nombre: `payment-proofs`
4. Marca **Public bucket** ✅
5. Click **Create bucket**

Luego agrega estas políticas al bucket:

```sql
-- Políticas de Storage para payment-proofs
-- INSERT: usuarios autenticados pueden subir
CREATE POLICY "Users can upload payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs' 
  AND auth.role() = 'authenticated'
);

-- SELECT: todos pueden ver (necesario para mostrar las imágenes)
CREATE POLICY "Payment proofs are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-proofs');

-- DELETE: solo admins pueden borrar
CREATE POLICY "Admins can delete payment proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### 3. Configurar tus datos de Nequi

⚡ **AHORA MÁS FÁCIL**: Ve al panel de administración:

1. Ingresa a **Admin → Configuración** (`/admin/configuracion`)
2. Completa los campos:
   - **Número Nequi**: Tu número de Nequi (ej: 3001234567)
   - **Nombre del titular**: Tu nombre completo como aparece en Nequi
   - **WhatsApp Admin**: Tu número con código de país (ej: 573001234567)
3. Click en **Guardar Configuración**
4. ¡Listo! Los cambios se aplican inmediatamente

También puedes usar SQL si prefieres:

```sql
UPDATE public.store_settings 
SET setting_value = 'TU_NUMERO_NEQUI' 
WHERE setting_key = 'nequi_phone';

UPDATE public.store_settings 
SET setting_value = 'TU_NOMBRE_COMPLETO' 
WHERE setting_key = 'nequi_name';

UPDATE public.store_settings 
SET setting_value = '57TU_NUMERO_WHATSAPP' 
WHERE setting_key = 'admin_whatsapp';
```

---

## 📱 Flujo de Compra

1. **Cliente** selecciona producto → Ve página de checkout
2. **Cliente** ve datos de Nequi (número, nombre) y monto a pagar
3. **Cliente** hace el depósito en Nequi
4. **Cliente** sube captura del comprobante y su nombre
5. **Sistema** guarda la compra con estado "awaiting_confirmation"
6. **Admin** recibe notificación en el panel de admin
7. **Admin** revisa el comprobante y confirma/rechaza
8. Si **confirma**: Se asigna un código al cliente
9. **Cliente** puede ver su código en "Mis Compras"

---

## 🔒 Seguridad

- Los códigos **NUNCA** se asignan hasta que el admin confirma el pago
- La columna `giftcard_code_id` queda `NULL` hasta la confirmación
- Solo el admin puede asignar códigos mediante la API `/api/confirm-payment`
- Los comprobantes se guardan en Storage y son visibles solo para el admin

---

## 📂 Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `/pages/checkout/[id].astro` | Página de checkout con Nequi |
| `/pages/api/create-purchase.ts` | API para crear compra pendiente |
| `/pages/api/confirm-payment.ts` | API para confirmar/rechazar pagos (solo admin) |
| `/pages/api/whatsapp-confirm.ts` | API para confirmar/rechazar desde WhatsApp |
| `/pages/admin/pagos.astro` | Panel de verificación de pagos |
| `/pages/admin/configuracion.astro` | Panel de configuración Nequi/WhatsApp |
| `/pages/admin/whatsapp-result.astro` | Resultado de confirmación por WhatsApp |
| `AdminSidebar.astro` | Actualizado con "Verificar Pagos" y "Configuración" |
| `mis-compras.astro` | Actualizado con estados de pago |

---

## 🎯 URLs Importantes

- **Checkout**: `/checkout/[giftcard-id]`
- **Panel Admin Pagos**: `/admin/pagos`
- **Configuración Nequi**: `/admin/configuracion`
- **Mis Compras**: `/mis-compras`
