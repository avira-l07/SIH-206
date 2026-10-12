const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
const { recordNotice } = require('../services/activity.service');
const { broadcastAlert, broadcastAlertDeactivated, broadcastAlertDeleted } = require('../sockets/socketHandler');
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
  if (['all', 'all regions', 'all regions (national/statewide)', 'national', 'statewide'].includes(alertRegion.trim().toLowerCase())) return true;
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

  // Uttarakhand regional sub-zones mapped to state region
  const uttarakhandSubAreas = [
    'dehradun', 'rishikesh', 'haridwar', 'chamoli', 'rudraprayag', 'joshimath',
    'nainital', 'kedarnath', 'badrinath', 'tehri', 'uttarkashi', 'pauri', 'garhwal', 'kumaon', 'doon'
  ];
  if (sub.includes('uttarakhand') && uttarakhandSubAreas.some((area) => alertStr.includes(area))) {
    return true;
  }
  if (alertStr.includes('uttarakhand') && uttarakhandSubAreas.some((area) => sub.includes(area))) {
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
  await transaction(tx => require('../services/delivery.service').enqueue(tx, alert, explicitPhones));
  return {alertId:alert.id,queued:true};
}

async function getAlerts(req, res) {
  try {
    const { activeOnly } = req.query;
    // Always exclude soft-deleted records from all views
    const where =
      activeOnly === 'false'
        ? { deletedAt: null }
        : { active: true, deletedAt: null };
    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const advisories=await prisma.evacuationAdvisory.findMany({where:{alertId:{in:alerts.map(a=>a.id)}},select:{alertId:true,active:true,expiresAt:true}});
    const guidance=new Map(advisories.map(a=>[a.alertId,{active:a.active,expiresAt:a.expiresAt}]));
    res.status(200).json({ alerts:alerts.filter(a=>activeOnly==='false'||!guidance.has(a.id)||(guidance.get(a.id).active&&guidance.get(a.id).expiresAt>new Date())).map(a=>({...a,...(guidance.has(a.id)?{evacuation:guidance.get(a.id)}:{})})) });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch alerts' });
  }
}

async function createAlert(req, res) {
  try {
    const { hazardType, severity, region, lat, lng, radiusKm, message, targetPhone, targetPhones } = req.body;

    const parsedRadius = radiusKm !== undefined && radiusKm !== null ? parseFloat(radiusKm) : 15.0;

    // Resolve sensible default coordinates based on region name if lat/lng are omitted
    let finalLat = parseFloat(lat);
    let finalLng = parseFloat(lng);
    if (isNaN(finalLat) || isNaN(finalLng)) {
      const regLower = (region || '').toLowerCase();
      if (regLower.includes('chamoli')) {
        finalLat = 30.4074; finalLng = 79.3248;
      } else if (regLower.includes('rishikesh')) {
        finalLat = 30.0869; finalLng = 78.2676;
      } else if (regLower.includes('haridwar')) {
        finalLat = 29.9457; finalLng = 78.1642;
      } else if (regLower.includes('joshimath')) {
        finalLat = 30.5562; finalLng = 79.5676;
      } else if (regLower.includes('rudraprayag')) {
        finalLat = 30.2844; finalLng = 78.9811;
      } else {
        // Default to Dehradun / Central Uttarakhand operations center
        finalLat = 30.3165; finalLng = 78.0322;
      }
    }

    const alert = await transaction(async tx => {
    const created = await tx.alert.create({
      data: {
        hazardType: hazardType || 'ADVISORY',
        severity: severity || 'WATCH',
        region: region || 'All Regions (National/Statewide)',
        lat: finalLat,
        lng: finalLng,
        radiusKm: isNaN(parsedRadius) ? 15.0 : parsedRadius,
        message: message || 'Urgent public safety notice. Follow civil defense instructions.',
        active: true,
        sourceKind:'MANUAL', observedAt:new Date(),
      },
    });

    await require('../services/delivery.service').enqueue(tx, created, [...(targetPhone ? [targetPhone] : []), ...(Array.isArray(targetPhones) ? targetPhones : [])]);
    await recordNotice(tx, 'ALERT', `${created.region}: ${created.message}`);
    return created;
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
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to create alert' });
  }
}

async function simulateWeatherAlert(req, res) {
  try {
    const { region = 'Mumbai', customTelemetry, telemetry: submittedTelemetry, lat, lng } = req.body;

    // Fetch either real weather or simulated scenario
    let liveProvider=false;
    let telemetry = customTelemetry || submittedTelemetry;
    if (telemetry && (typeof telemetry !== 'object' || Array.isArray(telemetry))) return res.status(400).json({ error: 'Telemetry must be an object' });
    if (telemetry) {
      for (const key of ['rain1h', 'windSpeed', 'temp', 'humidity', 'seismic', 'smokeIndex', 'soilMoisture']) {
        if (telemetry[key] !== undefined && (typeof telemetry[key] !== 'number' || !Number.isFinite(telemetry[key]))) return res.status(400).json({ error: 'Telemetry readings must be finite numbers' });
      }
      if (telemetry.condition != null && typeof telemetry.condition !== 'string') return res.status(400).json({ error: 'Telemetry condition must be text' });
      if (telemetry.landslideRisk != null && typeof telemetry.landslideRisk !== 'boolean') return res.status(400).json({ error: 'landslideRisk must be a boolean' });
      telemetry = { ...telemetry, lat: lat ?? telemetry.lat, lng: lng ?? telemetry.lng };
      for (const [key, max] of [['lat', 90], ['lng', 180]]) if (telemetry[key] != null && (typeof telemetry[key] !== 'number' || !Number.isFinite(telemetry[key]) || Math.abs(telemetry[key]) > max)) return res.status(400).json({ error: 'Invalid telemetry coordinates' });
    }
    if (!telemetry) {
      telemetry = await getWeatherData(region); liveProvider=telemetry.isLive===true;
    }

    telemetry={...telemetry,isLive:liveProvider};
    const { assessment, alert } = await processTelemetryAndAlert(
      telemetry,
      region,
      telemetry.lat,
      telemetry.lng, {sourceKind:liveProvider ? 'LIVE_WEATHER' : 'DEMO'}
    );

    if (alert) {
      broadcastAlert(alert);
      fanOutPublicAlerts(alert).catch((err) =>
        console.error('[Alert Fanout] Weather alert fan-out error:', err)
      );
    }

    res.status(200).json({
      message: alert ? 'Risk threshold triggered an automatic alert' : 'Telemetry analyzed; conditions normal',
      assessment: {...assessment,interpretation:'Rule severity score; not a probability'},
      alert,
      telemetry,
    });
  } catch (error) {
    console.error('Error simulating risk alert:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to process risk simulation' });
  }
}

async function deactivateAlert(req, res) {
  try {
    const { id } = req.params;
    const alert = await prisma.alert.update({
      where: { id: parseInt(id) },
      data: { active: false },
    });
    broadcastAlertDeactivated(alert);
    res.status(200).json({ message: 'Alert deactivated', alert });
  } catch (error) {
    console.error('Error deactivating alert:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to deactivate alert' });
  }
}

async function deleteAlert(req, res) {
  try {
    const { id } = req.params;
    const alertId = parseInt(id);

    // Verify exists and is not already deleted
    const existing = await prisma.alert.findFirst({
      where: { id: alertId, deletedAt: null },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Block deletion of still-active broadcasts — must deactivate first
    if (existing.active) {
      return res.status(409).json({
        error:
          'Cannot delete an active broadcast. Deactivate the alert first, then delete it.',
      });
    }

    // Soft-delete: stamp deletedAt, preserve row for audit trail
    const deleted = await prisma.alert.update({
      where: { id: alertId },
      data: { deletedAt: new Date() },
    });

    broadcastAlertDeleted({ id: alertId });
    res.status(200).json({ message: 'Alert deleted (soft)', alertId });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to delete alert' });
  }
}

async function bulkDeleteResolved(req, res) {
  try {
    // Soft-delete all deactivated (active=false), not yet deleted rows
    const result = await prisma.alert.updateMany({
      where: { active: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    broadcastAlertDeleted({ bulk: true, count: result.count });
    res.status(200).json({
      message: `${result.count} resolved alert(s) cleared from log`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error bulk-deleting resolved alerts:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to bulk-delete resolved alerts' });
  }
}

module.exports = {
  getAlerts,
  createAlert,
  simulateWeatherAlert,
  deactivateAlert,
  deleteAlert,
  bulkDeleteResolved,
  fanOutPublicAlerts, // exported for testing
};
