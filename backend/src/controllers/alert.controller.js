const prisma = require('../db');
const { broadcastAlert } = require('../sockets/socketHandler');
const { processTelemetryAndAlert, evaluateRisk } = require('../services/riskEngine.service');
const { getWeatherData } = require('../services/weather.service');
const { sendBroadcastSMS, normalizePhoneNumber } = require('../services/sms.service');
const { sendPushBroadcast } = require('../services/push.service');

/**
 * Intelligent regional containment matcher:
 * Handles broad regional subscriptions (e.g. 'Mumbai', 'All Regions')
 * matching specific wards/sectors (e.g. 'Kurla East - Mithi Basin', 'Dharavi Sector 5').
 */
function isRegionMatch(subscriberRegion, alertRegion) {
  if (!subscriberRegion) return true; // Enrolled with no region -> receives all alerts
  const sub = subscriberRegion.trim().toLowerCase();
  if (['all', 'all regions', 'all regions (national/statewide)', 'national', 'statewide', ''].includes(sub)) {
    return true;
  }
  if (!alertRegion) return true;
  const alertStr = alertRegion.trim().toLowerCase();

  // Exact match
  if (sub === alertStr) return true;

  // Substring containment (e.g., alert 'Kurla East - Mumbai' contains sub 'Mumbai')
  if (alertStr.includes(sub) || sub.includes(alertStr)) return true;

  // Known metro sub-zones mapped to metropolitan region
  const mumbaiSubAreas = [
    'kurla', 'dharavi', 'bandra', 'deonar', 'andheri', 'dadar',
    'colaba', 'thane', 'chembur', 'sion', 'mithi', 'worli', 'malad', 'borivali'
  ];
  if (sub.includes('mumbai') && mumbaiSubAreas.some((area) => alertStr.includes(area))) {
    return true;
  }
  if (alertStr.includes('mumbai') && mumbaiSubAreas.some((area) => sub.includes(area))) {
    return true;
  }

  return false;
}

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Asynchronous, non-blocking fan-out to public reach channels (SMS & Web Push)
 * Matches subscribers across BOTH PhoneRegistration and User tables:
 * - For citizens with lat/lng: Haversine distance matching against alert.radiusKm
 * - For citizens without lat/lng: region-string containment matching fallback
 * - For PhoneRegistration: region-string containment matching
 * Normalizes phone numbers to E.164 and deduplicates.
 */
async function fanOutPublicAlerts(alert, explicitPhones = []) {
  try {
    const alertRegion = alert.region ? alert.region.trim() : null;
    const alertRadius = alert.radiusKm !== undefined && alert.radiusKm !== null ? Number(alert.radiusKm) : 5.0;
    const hasAlertCoords = typeof alert.lat === 'number' && typeof alert.lng === 'number';

    // Concurrently fetch:
    // 1. Phone registrations from public no-login registry
    // 2. Registered citizen users with phone numbers from User table (including coordinates and region)
    // 3. Web Push browser subscriptions
    const [allPhoneRecords, allCitizenUsers, allPushSubs] = await Promise.all([
      prisma.phoneRegistration.findMany(),
      prisma.user.findMany({
        where: { role: 'CITIZEN', phone: { not: null } },
        select: { id: true, name: true, phone: true, region: true, lat: true, lng: true },
      }),
      prisma.pushSubscription.findMany(),
    ]);

    const recipientPhoneSet = new Set();

    // 1. Filter and normalize phone numbers from PhoneRegistration (region-string matching)
    for (const record of allPhoneRecords) {
      if (isRegionMatch(record.region, alertRegion)) {
        const normalized = normalizePhoneNumber(record.phoneNumber);
        if (normalized) recipientPhoneSet.add(normalized);
      }
    }

    // 2. Filter registered citizens from User table:
    // - For citizens with lat/lng: match via Haversine distance against alert.radiusKm
    // - For citizens without lat/lng (declined permission/older account): fall back to region matching
    for (const citizen of allCitizenUsers) {
      let isMatch = false;
      const hasCitizenCoords = typeof citizen.lat === 'number' && typeof citizen.lng === 'number';

      if (hasAlertCoords && hasCitizenCoords) {
        const distKm = calculateHaversineKm(alert.lat, alert.lng, citizen.lat, citizen.lng);
        if (distKm <= alertRadius) {
          isMatch = true;
        }
      } else {
        // Fallback to region matching
        if (isRegionMatch(citizen.region, alertRegion)) {
          isMatch = true;
        }
      }

      if (isMatch && citizen.phone) {
        const normalized = normalizePhoneNumber(citizen.phone);
        if (normalized) recipientPhoneSet.add(normalized);
      }
    }

    // 3. Include any explicitly targeted numbers requested by administrator
    if (Array.isArray(explicitPhones)) {
      for (const raw of explicitPhones) {
        const normalized = normalizePhoneNumber(raw);
        if (normalized) recipientPhoneSet.add(normalized);
      }
    }

    const uniquePhoneNumbers = Array.from(recipientPhoneSet);

    // 4. Filter Web Push subscriptions
    const matchingPushSubs = allPushSubs.filter((sub) =>
      isRegionMatch(sub.region, alertRegion)
    );

    const smsMessage = `[SIH EMERGENCY ALERT] ${alert.severity}: ${alert.hazardType} in ${alert.region} (${alertRadius}km radius). ${alert.message}. Seek safe shelter.`;

    const pushPayload = {
      title: `EMERGENCY ALERT: ${alert.severity} ${alert.hazardType}`,
      body: `${alert.region}: ${alert.message}`,
      alertId: alert.id,
      severity: alert.severity,
      hazardType: alert.hazardType,
      region: alert.region,
      lat: alert.lat,
      lng: alert.lng,
      radiusKm: alertRadius,
      url: '/',
      timestamp: Date.now(),
    };

    console.log(
      `[Alert Fanout] Alert #${alert.id} (${alert.severity} in ${alert.region}, r=${alertRadius}km) triggering public fan-out: ${uniquePhoneNumbers.length} SMS recipients (including registered citizens), ${matchingPushSubs.length} Web Push devices.`
    );

    // Concurrently fan out without blocking HTTP caller
    const [smsResult, pushResult] = await Promise.allSettled([
      sendBroadcastSMS(uniquePhoneNumbers, smsMessage),
      sendPushBroadcast(matchingPushSubs, pushPayload),
    ]);

    return {
      phoneCount: uniquePhoneNumbers.length,
      pushCount: matchingPushSubs.length,
      smsResult: smsResult.status === 'fulfilled' ? smsResult.value : null,
      pushResult: pushResult.status === 'fulfilled' ? pushResult.value : null,
    };
  } catch (err) {
    console.error(`[Alert Fanout] Error in public reach fan-out for Alert #${alert?.id}:`, err);
  }
}

async function getAlerts(req, res) {
  try {
    const { activeOnly } = req.query;
    const where = activeOnly === 'false' ? {} : { active: true };
    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

async function createAlert(req, res) {
  try {
    const { hazardType, severity, region, lat, lng, radiusKm, message, targetPhone, targetPhones } = req.body;

    const parsedRadius = radiusKm !== undefined && radiusKm !== null ? parseFloat(radiusKm) : 5.0;

    const alert = await prisma.alert.create({
      data: {
        hazardType,
        severity,
        region,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radiusKm: isNaN(parsedRadius) ? 5.0 : parsedRadius,
        message,
        active: true,
      },
    });

    // 1. Instant WebSocket broadcast to active app clients
    broadcastAlert(alert);

    // 2. Non-blocking fan-out to public SMS registry, registered citizens & Web Push subscribers
    const explicitList = [];
    if (targetPhone) explicitList.push(targetPhone);
    if (Array.isArray(targetPhones)) explicitList.push(...targetPhones);

    fanOutPublicAlerts(alert, explicitList).catch((err) =>
      console.error('[Alert Fanout] Asynchronous delivery error:', err)
    );

    // 3. Respond to admin immediately without waiting for telecom/push latency
    res.status(201).json({ message: 'Alert created & broadcasted', alert });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
}

async function simulateWeatherAlert(req, res) {
  try {
    const { region = 'Mumbai', customTelemetry } = req.body;

    // Fetch either real weather or simulated scenario
    let telemetry = customTelemetry;
    if (!telemetry) {
      telemetry = await getWeatherData(region);
    }

    const { assessment, alert } = await processTelemetryAndAlert(
      telemetry,
      region,
      telemetry.lat,
      telemetry.lng
    );

    if (alert) {
      broadcastAlert(alert);
      fanOutPublicAlerts(alert).catch((err) =>
        console.error('[Alert Fanout] Weather alert fan-out error:', err)
      );
    }

    res.status(200).json({
      message: alert ? 'Risk threshold triggered an automatic alert' : 'Telemetry analyzed; conditions normal',
      assessment,
      alert,
      telemetry,
    });
  } catch (error) {
    console.error('Error simulating risk alert:', error);
    res.status(500).json({ error: 'Failed to process risk simulation' });
  }
}

async function deactivateAlert(req, res) {
  try {
    const { id } = req.params;
    const alert = await prisma.alert.update({
      where: { id: parseInt(id) },
      data: { active: false },
    });
    res.status(200).json({ message: 'Alert deactivated', alert });
  } catch (error) {
    console.error('Error deactivating alert:', error);
    res.status(500).json({ error: 'Failed to deactivate alert' });
  }
}

module.exports = {
  getAlerts,
  createAlert,
  simulateWeatherAlert,
  deactivateAlert,
  fanOutPublicAlerts, // exported for testing
};
