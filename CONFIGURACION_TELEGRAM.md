# Configuración del Sistema de Pagos con Telegram

Has migrado exitosamente de WhatsApp (CallMeBot) a Telegram. Ahora las notificaciones de compra llegarán a tu chat o grupo de Telegram, permitiéndote aprobar o rechazar pagos con un solo clic.

## 🚀 Pasos para Conectar (Solo haces esto una vez)

### 1. Crear tu Bot de Telegram
1. Abre Telegram y busca a **@BotFather**.
2. Envía el comando `/newbot`.
3. Elige un nombre para tu bot (ej: `Tienda Roblox Bot`).
4. Elige un nombre de usuario (debe terminar en `bot`, ej: `RobloxStoreNotifyBot`).
5. **BotFather te dará un TOKEN.** (Se ve como `123456:ABC-DEF...`). **Cópialo**.

### 2. Obtener tu Chat ID
1. Inicia un chat con tu nuevo bot (búscalo y dale "Iniciar").
2. Ahora busca a **@userinfobot** en Telegram y dale "Iniciar".
3. Te responderá con tus datos. Copia el número que aparece en **Id**. (Ej: `123456789`).
   * *Opcional: Si quieres que llegue a un grupo, agrega al bot al grupo y obtén el ID del grupo (empieza con -100).*

### 3. Configurar en tu Admin Panel
1. Ve a tu sitio web: `/admin/configuracion`
2. Baja a la sección **Bot de Telegram**.
3. Pega el **Bot Token** que te dio BotFather.
4. Pega el **Chat ID** que obtuviste.
5. Guarda los cambios.

## 📱 Cómo Funciona

1. **El Cliente** realiza una compra y sube su comprobante.
2. **El Sistema** sube la imagen y te envía un mensaje a Telegram inmediatamente.
3. **El Mensaje** incluye:
   * Datos del cliente y monto.
   * **Foto del comprobante** (para ver si es real).
   * Dos botones: **[✅ CONFIRMAR]** y **[❌ RECHAZAR]**.
4. **Tú** tocas el botón correspondiente.
   * **Si confirmas:** Se asigna un código, se reduce el stock y se marca como completado.
   * **Si rechazas:** Se marca como rechazado y no se entrega nada.
5. Se abrirá una página confirmando la acción.

## 🛠️ Archivos Clave del Sistema

* `src/lib/telegram.ts`: Función encargada de hablar con la API de Telegram.
* `src/pages/api/create-purchase.ts`: Envía la notificación cuando se crea la compra.
* `src/pages/api/telegram-confirm.ts`: Procesa el clic en los botones de "Confirmar" o "Rechazar".
* `src/pages/admin/telegram-result.astro`: Página que ves después de hacer clic.
* `src/pages/admin/configuracion.astro`: Donde guardas tus credenciales.

## ⚠️ Solución de Problemas

* **No llegan los mensajes:** Verifica que el Token y Chat ID sean correctos en Configuración. Asegúrate de haberle dado "Start" a tu bot.
* **Error al confirmar:** Si dice "Token inválido", es posible que ya hayas usado ese enlace. Cada botón sirve una sola vez.

---
**Nota:** El sistema anterior de WhatsApp ha sido eliminado completamente.
