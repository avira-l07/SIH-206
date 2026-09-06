const prisma = require('../db');
const { parseSMSPayload, applyParsedPayload } = require('../services/smsParser.service');

/**
 * Ingests a simulated raw SMS telemetry packet
 */
async function ingestSMS(req, res) {
  try {
    const { payload, sourceNode = 'SMS Gateway Demo' } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Payload string is required' });
    }

    const parsed = parseSMSPayload(payload);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }

    const result = await applyParsedPayload(parsed, sourceNode);
    res.status(200).json({
      message: 'Simulated SMS payload parsed and synchronized to platform',
      result,
    });
  } catch (error) {
    console.error('Error ingesting simulated SMS:', error);
    res.status(500).json({ error: error.message || 'Failed to process SMS payload' });
  }
}

/**
 * Fetch simulated mesh & offline sync logs
 */
async function getSyncLogs(req, res) {
  try {
    const logs = await prisma.offlineSyncLog.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    res.status(200).json({ logs });
  } catch (error) {
    console.error('Error fetching offline logs:', error);
    res.status(500).json({ error: 'Failed to fetch offline sync logs' });
  }
}

/**
 * Ingest a batch of offline-queued items when connection is restored
 */
async function syncOfflineBatch(req, res) {
  try {
    const { items = [], sourceNode = 'Browser Offline Queue' } = req.body;
    const results = [];

    for (const item of items) {
      if (item.type === 'SMS') {
        const parsed = parseSMSPayload(item.payload);
        if (parsed.success) {
          const applied = await applyParsedPayload(parsed, sourceNode);
          results.push({ item, status: 'SYNCED', applied });
        } else {
          results.push({ item, status: 'FAILED', error: parsed.error });
        }
      }
    }

    res.status(200).json({ message: `Processed ${results.length} offline queued items`, results });
  } catch (error) {
    console.error('Error syncing offline batch:', error);
    res.status(500).json({ error: 'Failed to sync batch' });
  }
}

module.exports = {
  ingestSMS,
  getSyncLogs,
  syncOfflineBatch,
};
