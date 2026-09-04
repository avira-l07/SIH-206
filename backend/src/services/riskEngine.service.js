const prisma = require('../db');

/**
 * Evaluates weather and simulated environmental sensor telemetry against hazard thresholds.
 * Capped strictly at 3 hazard types per SIH26206 PRD: FLOOD, EARTHQUAKE, FIRE.
 */
function evaluateRisk(telemetry = {}) {
  const { rain1h = 0, windSpeed = 0, temp = 30, humidity = 80, seismic = 0, smokeIndex = 0 } = telemetry;

  // 1. Flood Risk Rules
  if (rain1h >= 60 || (rain1h >= 45 && windSpeed >= 40)) {
    return {
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      score: 92,
      reason: `Torrential rainfall detected (${rain1h} mm/h) exceeding danger threshold. High inundation risk.`,
    };
  }
  if (rain1h >= 25) {
    return {
      hazardType: 'FLOOD',
      severity: 'WATCH',
      score: 65,
      reason: `Continuous moderate-to-heavy rainfall (${rain1h} mm/h). Low-lying water accumulation advisory.`,
    };
  }

  // 2. Fire Risk Rules
  if (smokeIndex >= 70 || (temp >= 42 && humidity <= 20)) {
    return {
      hazardType: 'FIRE',
      severity: 'CRITICAL',
      score: 88,
      reason: `Extreme heat (${temp}°C) and low humidity (${humidity}%) or rapid smoke sensor spike detected.`,
    };
  }
  if (smokeIndex >= 40 || (temp >= 38 && humidity <= 30)) {
    return {
      hazardType: 'FIRE',
      severity: 'WATCH',
      score: 55,
      reason: `Elevated ambient heat (${temp}°C) with dry atmospheric conditions. Heightened fire hazard.`,
    };
  }

  // 3. Earthquake Risk Rules
  if (seismic >= 5.5) {
    return {
      hazardType: 'EARTHQUAKE',
      severity: 'CRITICAL',
      score: 95,
      reason: `Seismic sensor reading ${seismic} magnitude detected. Structural hazard alert.`,
    };
  }
  if (seismic >= 4.0) {
    return {
      hazardType: 'EARTHQUAKE',
      severity: 'WATCH',
      score: 60,
      reason: `Minor seismic activity (${seismic} magnitude) recorded in seismic telemetry station.`,
    };
  }

  return {
    hazardType: null,
    severity: 'SAFE',
    score: 15,
    reason: 'Environmental parameters within normal baseline limits.',
  };
}

/**
 * Automates hazard detection and alert generation into the database.
 */
async function processTelemetryAndAlert(telemetry, region, lat, lng) {
  const assessment = evaluateRisk(telemetry);

  if (assessment.severity === 'SAFE' || !assessment.hazardType) {
    return { assessment, alert: null };
  }

  // Auto-generate official hazard alert
  const alert = await prisma.alert.create({
    data: {
      hazardType: assessment.hazardType,
      severity: assessment.severity,
      region: region || 'Active Region',
      lat: lat || 19.0760,
      lng: lng || 72.8777,
      message: assessment.reason,
      active: true,
    },
  });

  return { assessment, alert };
}

module.exports = {
  evaluateRisk,
  processTelemetryAndAlert,
};
