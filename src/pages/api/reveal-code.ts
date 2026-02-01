import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { purchaseId, userId } = body;

    if (!purchaseId || !userId) {
      return new Response(JSON.stringify({ error: 'ID de compra y usuario requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que la compra pertenece al usuario
    const { data: purchase, error: fetchError } = await supabase
      .from('purchases')
      .select('*, code:giftcard_codes(code)')
      .eq('id', purchaseId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !purchase) {
      return new Response(JSON.stringify({ error: 'Compra no encontrada', details: fetchError }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Si ya fue revelado, solo devolver el código
    if (purchase.is_code_revealed) {
      return new Response(JSON.stringify({ 
        success: true, 
        code: purchase.code?.code,
        alreadyRevealed: true 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Marcar como revelado
    const { error: updateError } = await supabase
      .from('purchases')
      .update({ 
        is_code_revealed: true,
        code_revealed_at: new Date().toISOString()
      })
      .eq('id', purchaseId)
      .eq('user_id', userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Error al revelar código', details: updateError }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      code: purchase.code?.code,
      alreadyRevealed: false 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
