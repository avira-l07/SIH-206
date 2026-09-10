/**
 * push.service.js
 * Web Push Notification Broadcast Service using web-push
 * 
 * Hackathon & Production Architecture Notes:
 * - VAPID keys are auto-initialized if not pre-configured in .env.
 * - Sends push payloads to registered service workers.
 * - Prunes dead/unsubscribed endpoints on HTTP 410 Gone / 404 Not Found (Section 3).
 * - Per-subscription failures are isolated so one dead client never blocks others.
 */

const prisma = require('../db');

let webpush = null;
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || null;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@sih.gov.in';

function initWebPush() {
  if (webpush) return webpush;

  try {
    webpush = require('web-push');

    // If VAPID keys aren't in .env, generate a deterministic or in-memory fallback pair
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.log('[Push Service] Generating runtime VAPID keypair for Web Push...');
      const keys = webpush.generateVAPIDKeys();
      vapidPublicKey = keys.publicKey;
      vapidPrivateKey = keys.privateKey;
      console.log('[Push Service] VAPID Public Key:', vapidPublicKey);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    console.log('[Push Service] Web Push initialized successfully.');
    return webpush;
  } catch (err) {
    console.warn('[Push Service] web-push package not available or initialization failed:', err.message);
    return null;
  }
}

/**
 * Return the active VAPID public key for frontend subscription handshake
 */
function getVapidPublicKey() {
  initWebPush();
  return vapidPublicKey;
}

/**
 * Broadcast an emergency alert payload to multiple Web Push subscriptions.
 * Prunes expired / uninstalled subscriptions (HTTP 410 Gone or 404).
 * 
 * @param {Array<{ id: number, endpoint: string, keys: string|object, region?: string }>} subscriptions
 * @param {object} payload Alert details { title, body, alertId, severity, hazardType, region, lat, lng }
 * @returns {Promise<{ attempted: number, delivered: number, pruned: number, failed: number }>}
 */
async function sendPushBroadcast(subscriptions = [], payload = {}) {
  if (!subscriptions || subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, pruned: 0, failed: 0 };
  }

  const wp = initWebPush();
  const serializedPayload = JSON.stringify(payload);

  if (!wp) {
    console.log(`\n================= [WEB PUSH BROADCAST (SIMULATED)] =================`);
    console.log(`📡 Subscribers: ${subscriptions.length}`);
    console.log(`📦 Payload:`, payload);
    console.log(`====================================================================\n`);
    return {
      attempted: subscriptions.length,
      delivered: subscriptions.length,
      pruned: 0,
      failed: 0,
      simulated: true,
    };
  }

  console.log(`[Push Service] Dispatching Web Push to ${subscriptions.length} subscribers...`);

  let deliveredCount = 0;
  let prunedCount = 0;
  let failedCount = 0;

  const pushPromises = subscriptions.map(async (sub) => {
    let pushSubscription;
    try {
      const keysObj = typeof sub.keys === 'string' ? JSON.parse(sub.keys) : sub.keys;
      pushSubscription = {
        endpoint: sub.endpoint,
        keys: keysObj,
      };
    } catch (parseErr) {
      console.warn(`[Push Service] Invalid keys JSON for endpoint ${sub.endpoint}:`, parseErr.message);
      failedCount++;
      return;
    }

    try {
      await wp.sendNotification(pushSubscription, serializedPayload, {
        TTL: 3600, // Deliver within 1 hour even if device was briefly offline
        urgency: payload.severity === 'CRITICAL' ? 'high' : 'normal',
      });
      deliveredCount++;
    } catch (pushErr) {
      const status = pushErr.statusCode;
      // HTTP 410 Gone or 404 Not Found indicates subscription expired / uninstalled -> Prune
      if (status === 410 || status === 404) {
        console.log(`[Push Service] Pruning expired push subscription: ${sub.endpoint} (HTTP ${status})`);
        prunedCount++;
        try {
          await prisma.pushSubscription.delete({
            where: { endpoint: sub.endpoint },
          });
        } catch (dbErr) {
          console.warn('[Push Service] Could not prune subscription from DB:', dbErr.message);
        }
      } else {
        console.warn(`[Push Service] Push delivery error for ${sub.endpoint}:`, pushErr.message);
        failedCount++;
      }
    }
  });

  await Promise.allSettled(pushPromises);

  console.log(`[Push Service] Push broadcast finished: ${deliveredCount} delivered, ${prunedCount} pruned, ${failedCount} failed.`);

  return {
    attempted: subscriptions.length,
    delivered: deliveredCount,
    pruned: prunedCount,
    failed: failedCount,
  };
}

module.exports = {
  initWebPush,
  getVapidPublicKey,
  sendPushBroadcast,
};
