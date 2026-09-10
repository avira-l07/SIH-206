const prisma = require('../db');
const { calculateConfidenceTier } = require('../services/verification.service');
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
      if (urlStr.length > 500 || !/^https?:\/\//i.test(urlStr)) {
        return res.status(400).json({ error: 'photoUrl must be a valid http/https URL (max 500 chars)' });
      }
      sanitizedPhotoUrl = urlStr;
    }

    const userId = req.user ? req.user.id : null;
    const authorName = userName || (req.user ? req.user.name : 'Anonymous Citizen');

    const report = await prisma.hazardReport.create({
      data: {
        userId,
        userName: authorName,
        lat,
        lng,
        hazardNote: hazardNote.trim(),
        severityBenchmark: severityBenchmark.toUpperCase(),
        photoUrl: sanitizedPhotoUrl,
        confidenceTier: 'GREY',
        confirmationsCount: 0,
      },
      include: {
        confirmations: true,
      },
    });

    broadcastHazardCreated(report);
    res.status(201).json({ message: 'Hazard report registered under review', report });
  } catch (error) {
    console.error('Error creating hazard report:', error);
    res.status(500).json({ error: 'Failed to submit hazard report' });
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
            confirmingUser: { select: { id: true, name: true, trusted: true } },
          },
        },
      },
    });

    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error fetching hazard reports:', error);
    res.status(500).json({ error: 'Failed to fetch hazard reports' });
  }
}

/**
 * Confirm / dispute / resolve a hazard report (peer verification & correction upsert per Decision 0.4)
 */
async function confirmHazardReport(req, res) {
  try {
    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid hazard report ID' });
    }

    const userId = req.user.id;

    const report = await prisma.hazardReport.findUnique({
      where: { id: reportId },
      include: {
        confirmations: {
          include: { confirmingUser: true },
        },
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Hazard report not found' });
    }

    // Check if user is the author
    if (report.userId === userId) {
      return res.status(400).json({ error: 'You cannot confirm your own hazard report' });
    }

    const voteType = req.body.voteType ? req.body.voteType.toUpperCase() : 'CONFIRM';
    const validVoteTypes = ['CONFIRM', 'FALSE', 'RESOLVED'];
    if (!validVoteTypes.includes(voteType)) {
      return res.status(400).json({ error: `Invalid voteType. Allowed: ${validVoteTypes.join(', ')}` });
    }

    // Check existing vote for upsert or duplicate check
    const existingVote = await prisma.hazardConfirmation.findUnique({
      where: {
        hazardReportId_confirmingUserId: {
          hazardReportId: reportId,
          confirmingUserId: userId,
        },
      },
    });

    if (existingVote) {
      // Check for rapid identical repeat vote (< 2 seconds)
      const timeDiffMs = Date.now() - new Date(existingVote.updatedAt).getTime();
      if (existingVote.voteType === voteType && timeDiffMs < 2000) {
        return res.status(409).json({ error: 'Identical vote already registered recently' });
      }

      // Upsert: update voteType
      await prisma.hazardConfirmation.update({
        where: {
          hazardReportId_confirmingUserId: {
            hazardReportId: reportId,
            confirmingUserId: userId,
          },
        },
        data: {
          voteType,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.hazardConfirmation.create({
        data: {
          hazardReportId: reportId,
          confirmingUserId: userId,
          voteType,
        },
      });
    }

    // Fetch updated confirmations
    const allConfirmations = await prisma.hazardConfirmation.findMany({
      where: { hazardReportId: reportId },
      include: { confirmingUser: { select: { id: true, name: true, trusted: true } } },
    });

    const confirmVotes = allConfirmations.filter((c) => c.voteType === 'CONFIRM').length;
    const falseVotes = allConfirmations.filter((c) => c.voteType === 'FALSE').length;
    const resolvedVotes = allConfirmations.filter((c) => c.voteType === 'RESOLVED').length;

    const hasTrustedConfirm = allConfirmations.some((c) => c.voteType === 'CONFIRM' && c.confirmingUser?.trusted);
    const hasTrustedFalse = allConfirmations.some((c) => c.voteType === 'FALSE' && c.confirmingUser?.trusted);
    const hasTrustedResolved = allConfirmations.some((c) => c.voteType === 'RESOLVED' && c.confirmingUser?.trusted);

    const newTier = calculateConfidenceTier({
      confirmVotes,
      falseVotes,
      resolvedVotes,
      hasTrustedConfirm,
      hasTrustedFalse,
      hasTrustedResolved,
    });

    const tierChanged = newTier !== report.confidenceTier;

    const updatedReport = await prisma.hazardReport.update({
      where: { id: reportId },
      data: {
        confirmationsCount: confirmVotes,
        confidenceTier: newTier,
      },
      include: {
        confirmations: {
          include: { confirmingUser: { select: { id: true, name: true, trusted: true } } },
        },
      },
    });

    broadcastHazardConfirmed(updatedReport);
    if (tierChanged) {
      broadcastHazardTierChanged(updatedReport);
    }

    res.status(200).json({
      message: `Vote (${voteType}) registered successfully! Current tier: ${newTier}`,
      report: updatedReport,
      tierChanged,
    });
  } catch (error) {
    console.error('Error confirming hazard report:', error);
    res.status(500).json({ error: 'Failed to confirm hazard report' });
  }
}

module.exports = {
  createHazardReport,
  getHazardReports,
  confirmHazardReport,
};
