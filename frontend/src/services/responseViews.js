import { DISPATCHED_STATUSES } from './sosWorkflow.js';
export function responseTabs(user) {
  return user?.role === 'ADMIN' ? [
    { id: 'WAITING', label: 'Needs attention' }, { id: 'ACTIVE', label: 'Active rescues' }, { id: 'CLOSED', label: 'Completed' },
  ] : [{ id: 'MINE', label: 'My assignments' }, { id: 'AVAILABLE', label: 'Available calls' }, { id: 'CLOSED', label: 'Completed' }];
}
export function responsesForView(tickets, view, user, now = Date.now()) {
  const filtered = tickets.filter(ticket => {
    if (view === 'WAITING') return ['PENDING', 'VERIFIED'].includes(ticket.status) || (DISPATCHED_STATUSES.includes(ticket.status) && (ticket.handoffRequestedAt || (!ticket.assignmentAcknowledgedAt && ticket.acknowledgmentDueAt && Date.parse(ticket.acknowledgmentDueAt) <= now)));
    if (view === 'ACTIVE') return DISPATCHED_STATUSES.includes(ticket.status);
    if (view === 'MINE') return DISPATCHED_STATUSES.includes(ticket.status) && ticket.assignedVolunteerId === user?.id;
    if (view === 'AVAILABLE') return ticket.status === 'VERIFIED' && !ticket.assignedVolunteerId;
    return ['RESOLVED', 'CANCELLED'].includes(ticket.status) && (user?.role === 'ADMIN' || ticket.assignedVolunteerId === user?.id);
  });
  return filtered.sort((a, b) => Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT') || new Date(a.createdAt) - new Date(b.createdAt));
}
