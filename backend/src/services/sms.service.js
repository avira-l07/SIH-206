/**
 * sms.service.js
 * Emergency Alert SMS Broadcast Service using Twilio
 * 
 * Hackathon & Production Architecture Notes:
 * - Trial Twilio accounts can only send to pre-verified phone numbers (Section 0.3).
 * - Per-number failures (e.g. unverified, invalid format) are isolated and will never block the rest of the batch.
 * - If credentials are not supplied in .env, falls back to a simulated delivery log so local testing works seamlessly.
 */

let twilioClient = null;

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || accountSid.includes('your_') || authToken.includes('your_')) {
    return null;
  }

  if (!twilioClient) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(accountSid, authToken);
    } catch (err) {
      console.warn('[SMS Service] Twilio library not available or failed to initialize:', err.message);
      return null;
    }
  }

  return twilioClient;
}

/**
 * Normalize phone number to E.164 format (+91 for Indian 10-digit numbers)
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // Default to +91 if 10 digits
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

/**
 * Broadcast an emergency SMS message to a list of phone numbers.
 * Isolated per-number try/catch prevents single-number failure from stopping batch.
 * 
 * @param {string[]} phoneNumbers Array of destination phone numbers
 * @param {string} message Concise emergency alert message (max 160 chars recommended)
 * @returns {Promise<{ attempted: number, delivered: number, failed: number, simulated: boolean, results: Array }>}
 */
function maskPhoneNumber(phone) {
  if (!phone) return '***';
  const str = String(phone);
  if (str.length <= 5) return '***';
  return str.slice(0, 3) + '******' + str.slice(-3);
}

async function sendBroadcastSMS(phoneNumbers = [], message) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    return { attempted: 0, delivered: 0, failed: 0, simulated: false, results: [] };
  }

  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // If no Twilio configured, simulate broadcast cleanly
  if (!client || !fromNumber || fromNumber.includes('your_')) {
    console.log(`\n================= [EMERGENCY SMS BROADCAST (SIMULATED)] =================`);
    console.log(`📢 Recipient Count: ${phoneNumbers.length}`);
    console.log(`💬 Alert Message: "${message}"`);
    console.log(`ℹ️ [Twilio Notice] Real SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env`);
    console.log(`========================================================================\n`);

    return {
      attempted: phoneNumbers.length,
      delivered: phoneNumbers.length,
      failed: 0,
      simulated: true,
      results: phoneNumbers.map((phone) => ({
        phone: maskPhoneNumber(phone),
        status: 'simulated_delivered',
      })),
    };
  }

  console.log(`[SMS Service] Dispatching real Twilio SMS broadcast to ${phoneNumbers.length} recipients...`);

  // Batch process with Promise.allSettled for failure isolation
  const sendPromises = phoneNumbers.map(async (rawPhone) => {
    const formattedPhone = normalizePhoneNumber(rawPhone);
    const masked = maskPhoneNumber(formattedPhone);
    try {
      const response = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });

      console.log(`[SMS Service] Sent to ${masked}, Twilio SID: ${response.sid}`);
      return {
        phone: masked,
        status: 'sent',
        sid: response.sid,
      };
    } catch (err) {
      console.warn(`[SMS Service] Failed to send to ${masked}: ${err.message} (Code: ${err.code || 'N/A'})`);
      if (err.code === 21608) {
        console.warn(`[SMS Service] Note: Number ${masked} is unverified on Twilio Trial account.`);
      }
      return {
        phone: masked,
        status: 'failed',
        error: err.message,
        code: err.code,
      };
    }
  });

  const settled = await Promise.allSettled(sendPromises);
  const results = settled.map((s, idx) =>
    s.status === 'fulfilled'
      ? s.value
      : { phone: phoneNumbers[idx], status: 'failed', error: s.reason?.message }
  );

  const delivered = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(`[SMS Service] Broadcast complete: ${delivered}/${phoneNumbers.length} delivered, ${failed} failed.`);

  return {
    attempted: phoneNumbers.length,
    delivered,
    failed,
    simulated: false,
    results,
  };
}

module.exports = {
  sendBroadcastSMS,
  normalizePhoneNumber,
};
