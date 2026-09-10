const prisma = require('../db');
const { broadcastAlert } = require('../sockets/socketHandler');
const { processTelemetryAndAlert, evaluateRisk } = require('../services/riskEngine.service');
const { getWeatherData } = require('../services/weather.service');
const { sendBroadcastSMS } = require('../services/sms.service');
const { sendPushBroadcast } = require('../services/push.service');

/**
 * Asynchronous, non-blocking fan-out to public reach channels (SMS & Web Push)
 * Matches subscribers by region (or subscribers registered for 'All' / null).
 */
async function fanOutPublicAlerts(alert) {
  try {
    const alertRegion = alert.region ? alert.region.trim() : null;

    // Filter registrations matching alert's region or subscribed to all regions
    const regionFilter = alertRegion
      ? {
          OR: [
            { region: alertRegion },
            { region: null },
            { region: '' },
            { region: 'All' },
            { region: 'ALL' },
            { region: 'All Regions' },
          ],
        }
      : {};

    const [phoneRecords, pushRecords] = await Promise.all([
      prisma.phoneRegistration.findMany({ where: regionFilter }),
      prisma.pushSubscription.findMany({ where: regionFilter }),
    ]);

    const phoneNumbers = phoneRecords.map((r) => r.phoneNumber);
    const smsMessage = `[SIH EMERGENCY ALERT] ${alert.severity}: ${alert.hazardType} in ${alert.region}. ${alert.message}. Seek safe shelter.`;

    const pushPayload = {
      title: `EMERGENCY ALERT: ${alert.severity} ${alert.hazardType}`,
      body: `${alert.region}: ${alert.message}`,
      alertId: alert.id,
      severity: alert.severity,
      hazardType: alert.hazardType,
      region: alert.region,
      lat: alert.lat,
      lng: alert.lng,
      url: '/',
      timestamp: Date.now(),
    };

    console.log(
      `[Alert Fanout] Alert #${alert.id} (${alert.severity} in ${alert.region}) triggering public fan-out: ${phoneNumbers.length} SMS recipients, ${pushRecords.length} Web Push devices.`
    );

    // Concurrently fan out without blocking HTTP caller
    const [smsResult, pushResult] = await Promise.allSettled([
      sendBroadcastSMS(phoneNumbers, smsMessage),
      sendPushBroadcast(pushRecords, pushPayload),
    ]);

    return {
      phoneCount: phoneNumbers.length,
      pushCount: pushRecords.length,
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
    const { hazardType, severity, region, lat, lng, message } = req.body;

    const alert = await prisma.alert.create({
      data: {
        hazardType,
        severity,
        region,
        lat,
        lng,
        message,
        active: true,
      },
    });

    // 1. Instant WebSocket broadcast to active app clients
    broadcastAlert(alert);

    // 2. Non-blocking fan-out to public SMS registry & Web Push subscribers
    fanOutPublicAlerts(alert).catch((err) =>
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
