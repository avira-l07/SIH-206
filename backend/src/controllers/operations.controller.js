const { transaction } = require('../services/transaction.service');

// The same database snapshot supplies every console's aggregate metrics.
async function getSummary(req, res) {
  const responder = req.user.role === 'ADMIN' || (req.user.role === 'VOLUNTEER' && req.user.trusted);
  try {
    const scope = req.user.serviceRegion ? {region:req.user.serviceRegion} : {};
    const summary = await require('../services/concurrent-read.service').concurrentRead(JSON.stringify([req.user.id,req.user.role,req.user.trusted,req.user.serviceRegion]),()=>transaction(async tx => {
      const [alerts, tickets, mine, hazards, shelters, supplyItems, assets, missing, assignments] = await Promise.all([
        tx.alert.findMany({ where: { active: true, deletedAt: null }, select: { severity: true } }),
        tx.sOSRequest.groupBy({ by: ['status', 'citizenConfirmedResolved'], where: responder ? scope : { userId: req.user.id }, _count: { _all: true } }),
        tx.sOSRequest.count({ where: { assignedVolunteerId: req.user.id, status: { in: ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'] } } }),
        tx.hazardReport.groupBy({ by: ['confidenceTier'], where:scope, _count: { _all: true } }),
        tx.shelter.findMany({ where: { active: true,...scope }, select: { capacity: true, currentOccupancy: true, status: true, waterLitersRemaining: true, rationsUnitsRemaining: true, medicalKitsRemaining: true, blanketsRemaining: true } }),
        tx.supplyRequest.findMany({ where: { shelter: { active: true,...scope } }, select: { quantityNeeded: true, quantityFulfilled: true } }),
        tx.civilianAsset.count({ where: { available: true, ...(responder ? scope : { userId: req.user.id }) } }),
        tx.missingPerson.count({ where: { status: 'MISSING',...scope } }),
        tx.sOSRequest.findMany({ where: { status: { in: ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'] }, ...(responder ? scope : { userId: req.user.id }) }, select: { assignmentAcknowledgedAt: true, acknowledgmentDueAt: true, handoffRequestedAt: true } }),
      ]);
      const count = (rows, field, value) => rows.filter(row => row[field] === value).reduce((sum, row) => sum + row._count._all, 0);
      const pending = count(tickets, 'status', 'PENDING'), verified = count(tickets, 'status', 'VERIFIED');
      const resolved = tickets.filter(row => row.status === 'RESOLVED');
      return {
        asOf: new Date().toISOString(),
        sos: { replacementRequested: assignments.filter(s => s.handoffRequestedAt).length, acknowledgmentOverdue: assignments.filter(s => !s.assignmentAcknowledgedAt && s.acknowledgmentDueAt && s.acknowledgmentDueAt.getTime() <= Date.now()).length, scope: responder ? 'RESPONSE_NETWORK' : 'MY_ACCOUNT', pending, verified, awaitingDispatch: pending + verified, dispatched: ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'].reduce((sum, status) => sum + count(tickets, 'status', status), 0), myAssigned: mine, resolvedAwaitingConfirmation: resolved.filter(row => row.citizenConfirmedResolved !== true).reduce((sum, row) => sum + row._count._all, 0), resolvedConfirmed: resolved.filter(row => row.citizenConfirmedResolved === true).reduce((sum, row) => sum + row._count._all, 0), cancelled: count(tickets, 'status', 'CANCELLED') },
        alerts: { active: alerts.length, critical: alerts.filter(alert => alert.severity === 'CRITICAL').length },
        hazards: { total: hazards.reduce((sum, row) => sum + row._count._all, 0), verified: count(hazards, 'confidenceTier', 'RED'), underReview: count(hazards, 'confidenceTier', 'GREY') + count(hazards, 'confidenceTier', 'AMBER'), resolved: count(hazards, 'confidenceTier', 'RESOLVED'), disputed: count(hazards, 'confidenceTier', 'DISPUTED') },
        shelters: { active: shelters.length, capacity: shelters.reduce((sum, shelter) => sum + shelter.capacity, 0), occupied: shelters.reduce((sum, shelter) => sum + shelter.currentOccupancy, 0), freeBeds: shelters.reduce((sum, shelter) => sum + Math.max(0, shelter.capacity - shelter.currentOccupancy), 0), critical: shelters.filter(shelter => shelter.status === 'RED').length, unauditedResourceFields: shelters.reduce((sum, shelter) => sum + ['waterLitersRemaining', 'rationsUnitsRemaining', 'medicalKitsRemaining', 'blanketsRemaining'].filter(field => shelter[field] == null).length, 0) },
        resources: { supplyItems: supplyItems.length, deficitItems: supplyItems.filter(item => item.quantityFulfilled < item.quantityNeeded).length, availableAssets: assets, assetsScope: responder ? 'RESPONSE_NETWORK' : 'MY_ACCOUNT', missingPersons: missing },
      };
    }));
    res.json({ summary });
  } catch { res.status(503).json({ error: 'Operational statistics are temporarily unavailable' }); }
}
module.exports = { getSummary };
