const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
const { validPhoto } = require('../middleware/request.middleware');
const { calculateConfidenceTier, isWithinRadius } = require('../services/verification.service');
const {
  broadcastHazardCreated,
  broadcastHazardConfirmed,
  broadcastHazardTierChanged,
} = require('../sockets/socketHandler');

/**
 * Submit a crowdsourced hazard report (starts at GREY tier)
 */
async function createHazardReport(req, res) {
  try {
    const { lat, lng, hazardNote, severityBenchmark, photoUrl, userName } = req.body;

    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      return res.status(400).json({ error: 'Valid coordinates (lat −90–90, lng −180–180) are required' });
    }
    if (!hazardNote || typeof hazardNote !== 'string' || hazardNote.trim().length === 0) {
      return res.status(400).json({ error: 'hazardNote is required' });
    }
    if (hazardNote.length > 1000) {
      return res.status(400).json({ error: 'hazardNote must be 1000 characters or fewer' });
    }

    const validBenchmarks = ['ANKLE', 'KNEE', 'WAIST', 'SUBMERGED'];
    if (!severityBenchmark || !validBenchmarks.includes(severityBenchmark.toUpperCase())) {
      return res.status(400).json({
        error: `severityBenchmark is required. Allowed values: ${validBenchmarks.join(', ')}`,
      });
    }

    // Validate photoUrl to prevent SSRF / open redirect — only http/https, max 500 chars
    let sanitizedPhotoUrl = null;
    if (photoUrl) {
      const urlStr = String(photoUrl).trim();
      if (!validPhoto(urlStr)) {
        return res.status(400).json({ error: 'Invalid evidence image' });
      }
      sanitizedPhotoUrl = urlStr;
    }

    const userId = req.user ? req.user.id : null;
    const authorName = String(userName || (req.user ? req.user.name : 'Anonymous Citizen')).slice(0, 100);

    const report = await (req.database || prisma).hazardReport.create({
      data: {
        userId,
        userName: authorName,
        lat,
        lng,
        hazardNote: hazardNote.trim(),
        severityBenchmark: severityBenchmark.toUpperCase(),
        photoUrl: sanitizedPhotoUrl,
        confidenceTier: 'GREY',
        region: require('../services/field.service').regionKey(req.body.region || req.user?.region),
        confirmationsCount: 0,
      },
      include: {
        confirmations: true,
      },
    });

    if (!req.deferBroadcast) broadcastHazardCreated(report);
    res.status(201).json({ message: 'Hazard report registered under review', report });
  } catch (error) {
    console.error('Error creating hazard report:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to submit hazard report' });
  }
}

/**
 * Retrieve all hazard reports, optionally filtered by tier
 */
async function getHazardReports(req, res) {
  try {
    const { tier } = req.query;
    const where = tier ? { confidenceTier: tier.toUpperCase() } : {};

    const reports = await prisma.hazardReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, role: true, trusted: true } },
        confirmations: {
          include: {
            confirmingUser: { select: { id: true, name: true, trusted: true, role: true } },
          },
        },
      },
    });

    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error fetching hazard reports:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch hazard reports' });
  }
}

/**
 * Confirm / dispute / resolve a hazard report (peer verification & correction upsert per Decision 0.4)
 */
async function confirmHazardReport(req, res) {
  try {
    const reportId = Number(req.params.id), userId = req.user.id;
    const voteType = req.body.voteType ? req.body.voteType.toUpperCase() : 'CONFIRM';
    if (!['CONFIRM', 'FALSE', 'RESOLVED'].includes(voteType)) return res.status(400).json({ error: 'Invalid voteType' });
    const { updatedReport, tierChanged } = await transaction(async tx => {
      const report = await tx.hazardReport.findUnique({ where: { id: reportId } });
      if (!report) throw Object.assign(new Error('Hazard report not found'), { status: 404 });
      if (report.userId === userId) throw Object.assign(new Error('You cannot confirm your own hazard report'), { status: 400 });
      const responder = req.user.role === 'ADMIN' || (req.user.role === 'VOLUNTEER' && req.user.trusted);
      if (!responder && (req.user.lat == null || req.user.lng == null || !isWithinRadius(req.user.lat, req.user.lng, report.lat, report.lng, 300))) throw Object.assign(new Error('Citizen verification requires a saved location within 300 metres; update your location first'), { status: 403 });
      const where = { hazardReportId_confirmingUserId: { hazardReportId: reportId, confirmingUserId: userId } };
      const existing = await tx.hazardConfirmation.findUnique({ where });
      if (existing?.voteType === voteType && Date.now() - existing.updatedAt.getTime() < 2000) throw Object.assign(new Error('Identical vote already registered recently'), { status: 409 });
      await tx.hazardConfirmation.upsert({ where, create: { hazardReportId: reportId, confirmingUserId: userId, voteType }, update: { voteType, updatedAt: new Date() } });
      const confirmations = await tx.hazardConfirmation.findMany({ where: { hazardReportId: reportId }, include: { confirmingUser: { select: { id: true, name: true, trusted: true, role: true } } } });
      const count = type => confirmations.filter(c => c.voteType === type).length;
      const trusted = type => confirmations.some(c => c.voteType === type && c.confirmingUser.trusted && ['ADMIN', 'VOLUNTEER'].includes(c.confirmingUser.role));
      const newTier = calculateConfidenceTier({ confirmVotes: count('CONFIRM'), falseVotes: count('FALSE'), resolvedVotes: count('RESOLVED'), hasTrustedConfirm: trusted('CONFIRM'), hasTrustedFalse: trusted('FALSE'), hasTrustedResolved: trusted('RESOLVED') });
      const updatedReport = await tx.hazardReport.update({ where: { id: reportId }, data: { confirmationsCount: count('CONFIRM'), confidenceTier: newTier }, include: { confirmations: { include: { confirmingUser: { select: { id: true, name: true, trusted: true, role: true } } } } } });
      return { updatedReport, tierChanged: report.confidenceTier !== newTier };
    });
    broadcastHazardConfirmed(updatedReport);
    if (tierChanged) broadcastHazardTierChanged(updatedReport);
    res.json({ message: 'Vote registered. Current tier: ' + updatedReport.confidenceTier, report: updatedReport, tierChanged });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to confirm hazard report' });
  }
}

module.exports = {
  createHazardReport,
  getHazardReports,
  confirmHazardReport,
};
