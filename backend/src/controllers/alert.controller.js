const prisma = require('../db');
const { broadcastAlert } = require('../sockets/socketHandler');
const { processTelemetryAndAlert, evaluateRisk } = require('../services/riskEngine.service');
const { getWeatherData } = require('../services/weather.service');

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

    broadcastAlert(alert);
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
};
