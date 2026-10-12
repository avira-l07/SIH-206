export default function DashboardTabs({ label = 'Dashboard sections', tabs, value, onChange }) {
  const keyboard = (event, index) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.currentTarget.parentElement.querySelectorAll('button')[next]?.focus(); onChange(tabs[next].id);
  };
  return <nav aria-label={label} className="flex flex-wrap gap-2 border-b border-[#D8D3C7] pb-3">{tabs.map((tab,index) => <button type="button" key={tab.id} aria-current={value === tab.id ? 'page' : undefined} onKeyDown={event=>keyboard(event,index)} onClick={() => onChange(tab.id)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${value === tab.id ? 'bg-[#14231F] text-white' : 'bg-white text-[#14231F]/75 hover:bg-[#EFECE4]'}`}>{tab.label}</button>)}</nav>;
}
