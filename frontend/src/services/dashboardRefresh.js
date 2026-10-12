// Each section can refresh independently; a stale response never replaces newer data.
export async function refreshSections(sections, shouldApply = () => true) {
  const results = await Promise.allSettled(sections.map(section => section.load()));
  if (!shouldApply()) return { applied: false, failed: [] };
  const failed = [];
  results.forEach((result, i) => { if (result.status === 'fulfilled') sections[i].apply(result.value); else failed.push(sections[i].label); });
  return { applied: true, failed };
}
