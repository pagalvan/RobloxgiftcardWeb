import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';

// Esta API permite confirmar/rechazar pagos desde Telegram usando un token único
// Es seguro porque cada compra tiene un token único que solo el admin recibe

export const GET: APIRoute = async ({ url, redirect }) => {
  try {
    const token = url.searchParams.get('token');
    const action = url.searchParams.get('action'); // 'confirm' o 'reject'

    if (!token || !action) {
      return redirect('/admin/telegram-result?error=Parámetros inválidos');
    }

    if (!['confirm', 'reject'].includes(action)) {
      return redirect('/admin/telegram-result?error=Acción no válida');
    }

    // Buscar la compra por token
    const { data: purchase, error: fetchError } = await supabase
      .from('purchases')
      .select('*, giftcard:giftcards(name)')
      .eq('confirmation_token', token)
      .single();

    if (fetchError || !purchase) {
      return redirect('/admin/telegram-result?error=Compra no encontrada o token inválido');
    }

    // Verificar que la compra está pendiente de confirmación
    if (purchase.payment_status !== 'awaiting_confirmation') {
      const statusMsg = purchase.payment_status === 'confirmed' 
        ? 'Este pago ya fue CONFIRMADO anteriormente' 
        : 'Este pago ya fue RECHAZADO anteriormente';
      return redirect(`/admin/telegram-result?error=${encodeURIComponent(statusMsg)}`);
    }

    if (action === 'confirm') {
      // ===== CONFIRMAR PAGO =====
      
      // 1. Obtener un código disponible
      const { data: code, error: codeError } = await supabase
        .from('giftcard_codes')
        .select('*')
        .eq('giftcard_id', purchase.giftcard_id)
        .eq('is_sold', false)
        .limit(1)
        .single();

      if (codeError || !code) {
        return redirect('/admin/telegram-result?error=' + encodeURIComponent('No hay códigos disponibles. El pago fue recibido pero no hay stock.'));
      }

      // 2. Marcar el código como vendido
      const { error: codeUpdateError } = await supabase
        .from('giftcard_codes')
        .update({
          is_sold: true,
          buyer_id: purchase.user_id,
          sold_at: new Date().toISOString()
        })
        .eq('id', code.id)
        .eq('is_sold', false);

      if (codeUpdateError) {
        return redirect('/admin/telegram-result?error=' + encodeURIComponent('Error al asignar código'));
      }

      // 3. Actualizar la compra
      const { error: purchaseUpdateError } = await supabase
        .from('purchases')
        .update({
          giftcard_code_id: code.id,
          status: 'completed',
          payment_status: 'confirmed',
          payment_confirmed_at: new Date().toISOString(),
          confirmation_token: null // Invalidar token después de usar
        })
        .eq('id', purchase.id);

      if (purchaseUpdateError) {
        // Revertir código si falla
        await supabase
          .from('giftcard_codes')
          .update({ is_sold: false, buyer_id: null, sold_at: null })
          .eq('id', code.id);

        return redirect('/admin/telegram-result?error=' + encodeURIComponent('Error al actualizar compra'));
      }

      // 4. Decrementar stock
      await supabase.rpc('decrement_stock', { product_id: purchase.giftcard_id });

      return redirect(`/admin/telegram-result?success=confirmed&product=${encodeURIComponent(purchase.giftcard?.name || 'Producto')}&amount=${purchase.amount}`);

    } else if (action === 'reject') {
      // ===== RECHAZAR PAGO =====
      
      const { error: rejectError } = await supabase
        .from('purchases')
        .update({
          status: 'rejected',
          payment_status: 'rejected',
          rejection_reason: 'Rechazado por admin via Telegram', // Podríamos agregar razón si hubiera input
          confirmation_token: null
        })
        .eq('id', purchase.id);

      if (rejectError) {
         return redirect('/admin/telegram-result?error=' + encodeURIComponent('Error al rechazar compra'));
      }

      return redirect('/admin/telegram-result?success=rejected');
    }

    return redirect('/admin/telegram-result?error=Acción desconocida');

  } catch (error) {
    console.error('API Error:', error);
    return redirect('/admin/telegram-result?error=Error interno del servidor');
  }
};
