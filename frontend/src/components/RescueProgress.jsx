import { rescueProgress } from '../services/nextAction';
const steps = ['Received', 'Reviewed', 'Responder assigned', 'Rescue completed', 'Safety confirmed'];

export default function RescueProgress({ ticket }) {
  const progress = rescueProgress(ticket);
  return <div className="space-y-2">
    {progress.index >= 0 && <ol aria-label="Rescue progress" className="flex gap-1">{steps.map((step, index) => <li key={step} className="flex-1 min-w-0" aria-current={index === progress.index ? 'step' : undefined}>
      <div title={`${step}: ${index < progress.index ? 'completed' : index === progress.index ? 'current' : 'waiting'}`} className={`h-1.5 rounded-full ${index <= progress.index ? 'bg-[#2E6E4E]' : 'bg-[#EDE9DE]'}`} />
      <span className="sr-only">{step}: {index < progress.index ? 'completed' : index === progress.index ? 'current' : 'waiting'}</span>
    </li>)}</ol>}
    {progress.index>=0&&<p className="text-xs text-[#14231F]/70">Step {progress.index+1} of {steps.length}: {steps[progress.index]}</p>}
    <p className="text-sm text-[#14231F]/80">{progress.next}</p>
  </div>;
}
