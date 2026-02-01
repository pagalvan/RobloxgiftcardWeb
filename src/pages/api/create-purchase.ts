import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';

// Función para generar token único
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}



export const POST: APIRoute = async ({ request, url }) => {
  try {
    const formData = await request.formData();
    
    const giftcardId = formData.get('giftcard_id') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const userId = formData.get('user_id') as string;
    const depositorName = formData.get('depositor_name') as string;
    const paymentProof = formData.get('payment_proof') as File;

    // Validaciones
    if (!giftcardId || !amount || !userId || !depositorName || !paymentProof) {
      return new Response(JSON.stringify({ 
        error: 'Faltan campos requeridos',
        details: { giftcardId, amount, userId, depositorName: !!depositorName, paymentProof: !!paymentProof }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el usuario existe
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      return new Response(JSON.stringify({ error: 'Usuario no válido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que hay stock disponible (pero NO reservar el código aún)
    const { count: availableCodes, error: stockError } = await supabase
      .from('giftcard_codes')
      .select('*', { count: 'exact', head: true })
      .eq('giftcard_id', giftcardId)
      .eq('is_sold', false);

    if (stockError || !availableCodes || availableCodes === 0) {
      return new Response(JSON.stringify({ error: 'No hay stock disponible' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Subir imagen del comprobante a Supabase Storage
    const fileExt = paymentProof.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('payment-proofs')
      .upload(fileName, paymentProof, {
        contentType: paymentProof.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ 
        error: 'Error al subir el comprobante',
        details: uploadError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener URL pública del comprobante
    const { data: { publicUrl } } = supabase
      .storage
      .from('payment-proofs')
      .getPublicUrl(fileName);

    // Generar token único para confirmación por WhatsApp
    const confirmationToken = generateToken();

    // Obtener la URL base del sitio
    const baseUrl = `${url.protocol}//${url.host}`;

    // Crear la compra SIN asignar código (el código se asigna solo cuando el admin confirma)
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        user_id: userId,
        giftcard_id: giftcardId,
        giftcard_code_id: null, // NO asignar código hasta confirmar pago
        amount: amount,
        status: 'awaiting_confirmation',
        payment_method: 'nequi',
        depositor_name: depositorName,
        payment_proof_url: publicUrl,
        payment_status: 'awaiting_confirmation',
        confirmation_token: confirmationToken, // Token para WhatsApp
        is_code_revealed: false
      })
      .select(`
        *,
        giftcard:giftcards(name, denomination, currency)
      `)
      .single();

    if (purchaseError) {
      console.error('Purchase error:', purchaseError);
      return new Response(JSON.stringify({ 
        error: 'Error al crear la compra',
        details: purchaseError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Enviar notificación a Telegram
    const { data: settings } = await supabase
      .from('store_settings')
      .select('*')
      .in('setting_key', ['telegram_bot_token', 'telegram_chat_id']);

    const botToken = settings?.find(s => s.setting_key === 'telegram_bot_token')?.setting_value;
    const chatId = settings?.find(s => s.setting_key === 'telegram_chat_id')?.setting_value;

    console.log('Telegram Settings Found:', { 
      hasToken: !!botToken, 
      hasChatId: !!chatId,
      tokenStart: botToken ? botToken.substring(0, 5) : 'N/A' 
    });

    if (botToken && chatId) {
      const confirmUrl = `${baseUrl}/api/telegram-confirm?token=${confirmationToken}&action=confirm`;
      const rejectUrl = `${baseUrl}/api/telegram-confirm?token=${confirmationToken}&action=reject`;
      
      const message = `🔔 *NUEVA COMPRA PENDIENTE*\n\n` +
        `📦 *Producto:* ${purchase.giftcard?.name}\n` +
        `💰 *Monto:* $${purchase.amount.toLocaleString('es-CO')}\n` +
        `👤 *Cliente:* ${userProfile.full_name || userProfile.email}\n` +
        `💳 *Depositante:* ${depositorName}\n\n` +
        `📸 Verifique el comprobante y decida:`;

      // Enviar notificación esperando respuesta para ver errores
      try {
        const telegramResult = await sendTelegramNotification({
          botToken,
          chatId,
          message,
          imageUrl: publicUrl,
          confirmUrl,
          rejectUrl
        });
        console.log('Telegram Notification Result:', telegramResult);
      } catch (err) {
        console.error('Telegram Send Error:', err);
      }
    } else {
      console.warn('Telegram notifications skipped: Bot Token or Chat ID missing.');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      purchaseId: purchase.id,
      message: 'Compra registrada. El admin revisará tu pago pronto.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error interno del servidor',
      details: String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
