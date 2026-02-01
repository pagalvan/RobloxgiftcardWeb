# Guía de Despliegue en Vercel

Tu proyecto ya ha sido configurado para desplegarse en Vercel.

## 1. Subir a GitHub
Si aún no has subido tu código a GitHub:
1. Crea un nuevo repositorio en GitHub (puede ser privado).
2. Sube tu código:
   ```bash
   git add .
   git commit -m "Preparado para Vercel"
   git push
   ```

## 2. Configurar en Vercel
1. Ve a [vercel.com/new](https://vercel.com/new) e inicia sesión con GitHub.
2. Selecciona tu repositorio **RobloxgiftcardWeb**.
3. En **Framework Preset** debería detectar automáticamente `Astro`.
4. **IMPORTANTE - Variables de Entorno:**
   Despliega la sección **Environment Variables** y agrega las que tienes en tu archivo `.env` o en Supabase:
   * `PUBLIC_SUPABASE_URL`: (Tu URL de Supabase)
   * `PUBLIC_SUPABASE_ANON_KEY`: (Tu llave pública de Supabase)

5. Haz clic en **Deploy**.

## 3. Configuración final
Una vez desplegado:
1. Ve a **Supabase > Authentication > URL Configuration**.
2. En **Site URL**, pon la URL que Vercel te asignó (ej: `https://roblox-tienda.vercel.app`).
3. En **Redirect URLs**, agrega `https://tudominio.vercel.app/**` para que funcione el login y las redirecciones de OAuth si las usas.

## 4. Verificar Telegram
Ahora que tu sitio tiene HTTPS:
1. Haz una compra de prueba en el sitio en vivo.
2. Verás que los botones de Telegram ahora aparecerán correctamente porque la URL ya no es `localhost`.
