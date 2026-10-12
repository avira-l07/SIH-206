import { DISPATCHED_STATUSES } from './sosWorkflow.js';
const count = (value, singular, plural = singular + 's') => `${value} ${value === 1 ? singular : plural}`;

export function recommendedAction(user, tickets, now = Date.now(), guidance = null) {
  const active = tickets.filter(t => DISPATCHED_STATUSES.includes(t.status));
  if (user.role === 'ADMIN') {
    const replacements = active.filter(t => t.handoffRequestedAt).length;
    const overdue = active.filter(t => !t.assignmentAcknowledgedAt && Date.parse(t.acknowledgmentDueAt) <= now).length;
    if (replacements || overdue) return { title: 'Check assignments needing attention', detail: `${count(replacements,'replacement request')} · ${count(overdue,'overdue acknowledgment')}`, label: 'Review assignments', section: 'KANBAN', queue: 'WAITING' };
    const waiting = tickets.filter(t => ['PENDING', 'VERIFIED'].includes(t.status)).length;
    return waiting ? { title: `${count(waiting,'help request')} ${waiting===1?'needs':'need'} a response`, detail: 'Verify new reports, then choose an available volunteer.', label: 'Review requests', section: 'KANBAN', queue: 'WAITING' }
      : { title: 'No requests are waiting for dispatch', detail: 'Check active rescues and keep shelter information current.', label: 'View active rescues', section: 'KANBAN', queue: 'ACTIVE' };
  }
  if (user.role === 'VOLUNTEER') {
    const mine = active.filter(t => t.assignedVolunteerId === user.id);
    const awaiting = mine.filter(t => !t.assignmentAcknowledgedAt).length;
    if (awaiting) return { title: `${count(awaiting,'assignment')} ${awaiting===1?'needs':'need'} your acknowledgment`, detail: 'Confirm that you have seen the assignment before heading out.', label: 'Open my assignments', section: 'KANBAN', queue: 'MINE' };
    if (mine.length) return { title: `${count(mine.length,'rescue')} assigned to you`, detail: 'Open a request, contact the citizen and record your next step.', label: 'Continue my rescue work', section: 'KANBAN', queue: 'MINE' };
    if (user.onDuty !== true) return { title: 'Set your availability before taking a call', detail: 'Start your shift when you are ready to receive rescue assignments.', label: 'Set my availability', focus: 'volunteer-availability' };
    return { title: 'Ready to help', detail: 'Accept a verified call when you can safely respond.', label: 'See available calls', section: 'KANBAN', queue: 'AVAILABLE' };
  }
  const waiting = tickets.filter(t => !['RESOLVED', 'CANCELLED'].includes(t.status)).length;
  if(waiting) return { title: `${count(waiting,'help request')} ${waiting===1?'is':'are'} being handled`, detail: 'Check who is responding and what happens next.', label: 'Track my requests', section: 'REQUESTS' };
  if(guidance?.active && Date.parse(guidance.expiresAt)>now) return {title:guidance.action==='EVACUATE'?'Review your local evacuation guidance':'Prepare your shelter route',detail:'Read the local instructions, check a reachable shelter and save the reviewed route.',label:'Open my shelter plan',tool:'evacuation',context:{advisoryId:guidance.id}};
  const confirmation = tickets.filter(t => t.status === 'RESOLVED' && t.citizenConfirmedResolved !== true).length;
  if (confirmation) return { title: 'Did help reach you?', detail: `${count(confirmation,'completed request')} ${confirmation===1?'needs':'need'} your confirmation. You can reopen a request if you still need help.`, label: 'Confirm my safety', section: 'REQUESTS' };
  return { title: 'Know where to go before an emergency', detail: 'Check nearby shelters and keep a household emergency plan ready.', label: 'Find a shelter', section: 'SHELTERS' };
}

export function rescueProgress(ticket) {
  if (ticket.status === 'CANCELLED') return { index: -1, next: 'This request is closed. Send a new request if you need help again.' };
  if (ticket.status === 'PENDING') return { index: 0, next: 'Next: an operator reviews your request.' };
  if (ticket.status === 'VERIFIED') return { index: 1, next: 'Next: an operator assigns a responder, or an approved volunteer accepts the call.' };
  if (DISPATCHED_STATUSES.includes(ticket.status)) return { index: 2, next: ticket.handoffRequestedAt ? 'Next: the operator reviews the replacement request. The current responder remains assigned.' : !ticket.assignmentAcknowledgedAt ? 'Next: the assigned responder acknowledges the assignment.' : 'Next: the responder records rescue progress. Check the timeline for updates.' };
  if (ticket.status === 'RESOLVED') return ticket.citizenConfirmedResolved === true ? { index: 4, next: 'You confirmed that help arrived and you are safe.' } : { index: 3, next: 'Next: the citizen confirms that help arrived, or reopens the request.' };
  return { index: -1, next: 'Open the timeline for the latest recorded update.' };
}
