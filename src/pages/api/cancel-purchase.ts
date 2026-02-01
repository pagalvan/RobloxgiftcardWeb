import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';



export const POST: APIRoute = async ({ request }) => {
  try {
    const { purchaseId, userId, reason } = await request.json();

    if (!purchaseId || !userId) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!reason || reason.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Debes indicar un motivo de cancelación (mínimo 5 caracteres)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que la compra existe y pertenece al usuario
    const { data: purchase, error: fetchError } = await supabase
      .from('purchases')
      .select(`
        *,
        user:profiles!purchases_user_id_fkey(email, full_name),
        giftcard:giftcards(name, denomination, currency)
      `)
      .eq('id', purchaseId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !purchase) {
      return new Response(JSON.stringify({ error: 'Compra no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el código NO ha sido revelado
    if (purchase.is_code_revealed) {
      return new Response(JSON.stringify({ 
        error: 'No puedes cancelar esta compra porque ya revelaste el código. Los códigos revelados no son reembolsables.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Solo se puede cancelar si está en estado pendiente
    if (purchase.payment_status !== 'awaiting_confirmation' && purchase.status !== 'awaiting_confirmation') {
      return new Response(JSON.stringify({ error: 'Esta compra no se puede cancelar' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }



    // Si tiene un código asignado, liberarlo
    if (purchase.giftcard_code_id) {
      await supabase
        .from('giftcard_codes')
        .update({ is_sold: false })
        .eq('id', purchase.giftcard_code_id);
    }

    // Cambiar estado a "cancelled" en lugar de eliminar (para tener historial)
    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        status: 'refunded',
        payment_status: 'rejected',
        rejection_reason: `Cancelado por el cliente: ${reason}`
      })
      .eq('id', purchaseId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Error al cancelar la compra' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Solicitud de reembolso enviada. El admin ha sido notificado.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
