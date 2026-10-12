const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
function inboxScope(user) {
  const responder = user.role === 'ADMIN' || (user.role === 'VOLUNTEER' && user.trusted);
  return { userId: user.id, ...(responder ? {} : { kind: { not: 'RESTOCK' }, OR: [{ sosId: null }, { sosId: { in: [] } }] }) };
}
async function scope(user) {
  const where = inboxScope(user);
  if(user.serviceRegion&&(user.role==='ADMIN'||user.role==='VOLUNTEER'&&user.trusted)){where.OR=[{sosId:null},{sosId:{in:(await prisma.sOSRequest.findMany({where:{region:user.serviceRegion},select:{id:true}})).map(s=>s.id)}}];return where;}
  if (where.OR) where.OR[1].sosId.in = (await prisma.sOSRequest.findMany({ where: { userId: user.id }, select: { id: true } })).map(s => s.id);
  return where;
}
async function list(req, res, next) {
  try {
    const before = req.query.before;
    if (before && (!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1)) return res.status(400).json({ error: 'Invalid notification cursor' });
    const where = await scope(req.user);
    const result = await transaction(async tx => ({
      notifications: await tx.notification.findMany({ where: { ...where, ...(before ? { id: { lt: Number(before) } } : {}) }, orderBy: { id: 'desc' }, take: 31 }),
      unreadCount: await tx.notification.count({ where: { ...where, readAt: null } }),
    }));
    const hasMore = result.notifications.length > 30;
    result.notifications = result.notifications.slice(0, 30);
    res.json({ ...result, nextCursor: hasMore ? result.notifications.at(-1).id : null });
  } catch (error) { next(error); }
}
async function markRead(req, res, next) {
  try {
    const changed = await prisma.notification.updateMany({ where: { ...await scope(req.user), id: Number(req.params.id) }, data: { readAt: new Date() } });
    if (!changed.count) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification read' });
  } catch (error) { next(error); }
}
async function markAllRead(req, res, next) {
  try { await prisma.notification.updateMany({ where: { ...await scope(req.user), readAt: null }, data: { readAt: new Date() } }); res.json({ message: 'All notifications read' }); }
  catch (error) { next(error); }
}
module.exports = { list, markRead, markAllRead };
