import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { purchaseId, action, adminId, rejectionReason } = body;

    // Validaciones básicas
    if (!purchaseId || !action || !adminId) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!['confirm', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Acción no válida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el usuario es admin
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !adminProfile || adminProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'No tienes permisos de administrador' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener la compra
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*, giftcard:giftcards(name)')
      .eq('id', purchaseId)
      .single();

    if (purchaseError || !purchase) {
      return new Response(JSON.stringify({ error: 'Compra no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que la compra está pendiente de confirmación
    if (purchase.payment_status !== 'awaiting_confirmation') {
      return new Response(JSON.stringify({ 
        error: 'Esta compra ya fue procesada',
        currentStatus: purchase.payment_status 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
        return new Response(JSON.stringify({ 
          error: 'No hay códigos disponibles para este producto. El pago fue recibido pero no hay stock.',
          needsRefund: true
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
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
        .eq('is_sold', false); // Doble verificación para evitar race conditions

      if (codeUpdateError) {
        return new Response(JSON.stringify({ 
          error: 'Error al asignar el código',
          details: codeUpdateError.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 3. Actualizar la compra con el código asignado
      const { error: purchaseUpdateError } = await supabase
        .from('purchases')
        .update({
          giftcard_code_id: code.id,
          status: 'completed',
          payment_status: 'confirmed',
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: adminId
        })
        .eq('id', purchaseId);

      if (purchaseUpdateError) {
        // Revertir el código si falla la actualización de compra
        await supabase
          .from('giftcard_codes')
          .update({ is_sold: false, buyer_id: null, sold_at: null })
          .eq('id', code.id);

        return new Response(JSON.stringify({ 
          error: 'Error al actualizar la compra',
          details: purchaseUpdateError.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 4. Decrementar stock del producto
      await supabase.rpc('decrement_stock', { product_id: purchase.giftcard_id });

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Pago confirmado y código asignado',
        codeId: code.id
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (action === 'reject') {
      // ===== RECHAZAR PAGO =====
      
      const { error: rejectError } = await supabase
        .from('purchases')
        .update({
          status: 'rejected',
          payment_status: 'rejected',
          rejection_reason: rejectionReason || 'Pago no verificado',
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: adminId
        })
        .eq('id', purchaseId);

      if (rejectError) {
        return new Response(JSON.stringify({ 
          error: 'Error al rechazar el pago',
          details: rejectError.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Pago rechazado'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Acción no válida' }), {
      status: 400,
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
