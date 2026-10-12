export const DISPATCHED_STATUSES = ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'];
export const NEXT_STATUS = { EN_ROUTE: 'ON_SCENE', ON_SCENE: 'EVACUATED', EVACUATED: 'HANDED_OVER_TO_MEDICAL', HANDED_OVER_TO_MEDICAL: 'RESOLVED' };
export const STATUS_LABELS = { PENDING: 'Awaiting operator verification', VERIFIED: 'Verified — awaiting responder', EN_ROUTE: 'Responder en route', ON_SCENE: 'Responder on scene', EVACUATED: 'Evacuated — awaiting handover', HANDED_OVER_TO_MEDICAL: 'Handed over to medical care', RESOLVED: 'Resolved — confirm your safety', CANCELLED: 'Cancelled' };
export const ACTION_LABELS = { EN_ROUTE: 'MARK ON SCENE', ON_SCENE: 'MARK EVACUATED', EVACUATED: 'CONFIRM MEDICAL HANDOVER', HANDED_OVER_TO_MEDICAL: 'MARK RESOLVED' };
export function canAdvanceSOS(sos, user) { return DISPATCHED_STATUSES.includes(sos.status) && (user?.role === 'ADMIN' || sos.assignedVolunteerId === user?.id); }
