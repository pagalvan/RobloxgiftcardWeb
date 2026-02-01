
export async function sendTelegramNotification({
  botToken,
  chatId,
  message,
  imageUrl,
  confirmUrl,
  rejectUrl
}: {
  botToken: string;
  chatId: string;
  message: string;
  imageUrl?: string;
  confirmUrl?: string;
  rejectUrl?: string;
}) {
  if (!botToken || !chatId) {
    console.error('Telegram configuration missing');
    return false;
  }

  try {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;
    
    // Check if URLs are localhost (development) - Telegram doesn't accept localhost for buttons
    const isLocalhost = confirmUrl?.includes('localhost') || confirmUrl?.includes('127.0.0.1');
    
    // Build the full message with action links as text
    let fullMessage = message;
    if (confirmUrl && rejectUrl) {
      fullMessage += `\n\n━━━━━━━━━━━━━━━\n✅ *CONFIRMAR PAGO:*\n${confirmUrl}\n\n❌ *RECHAZAR PAGO:*\n${rejectUrl}`;
    }
    
    // Prepare inline keyboard with buttons (only for production URLs)
    const inlineKeyboard = !isLocalhost && confirmUrl && rejectUrl ? {
      inline_keyboard: [
        [
          { text: "✅ CONFIRMAR", url: confirmUrl },
          { text: "❌ RECHAZAR", url: rejectUrl }
        ]
      ]
    } : undefined;

    // If there's an image, use sendPhoto, otherwise use sendMessage
    const method = imageUrl ? 'sendPhoto' : 'sendMessage';
    const body: any = {
      chat_id: chatId,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard ? JSON.stringify(inlineKeyboard) : undefined
    };

    if (imageUrl) {
      body.photo = imageUrl;
      body.caption = fullMessage;
    } else {
      body.text = fullMessage;
    }

    const response = await fetch(`${baseUrl}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API Error:', JSON.stringify(data, null, 2));
      
      // Retry with text only if photo failed (maybe URL is not accessible yet)
      if (imageUrl) {
        console.log('Retrying without photo...');
        delete body.photo;
        delete body.caption;
        delete body.reply_markup;
        body.text = fullMessage + `\n\n📸 *Ver comprobante:*\n${imageUrl}`;
        
        const retryResponse = await fetch(`${baseUrl}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const retryData = await retryResponse.json();
        if (!retryData.ok) {
           console.error('Telegram Retry Error:', JSON.stringify(retryData, null, 2));
           return false;
        }
        return true;
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return false;
  }
}
