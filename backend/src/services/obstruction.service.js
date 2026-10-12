// Report-based routing exclusion; this does not forecast landslides or prove road safety.
function blocksRoute(report) { return ['WAIST','SUBMERGED'].includes(report.severityBenchmark) || /landslide|rockfall|road\s+blocked/i.test(report.hazardNote||''); }
async function currentObstructions(db,now=Date.now()) {
  const reports=await db.hazardReport.findMany({where:{confidenceTier:{in:['AMBER','RED']},createdAt:{gte:new Date(now-24*3600000)}},select:{lat:true,lng:true,severityBenchmark:true,hazardNote:true}});
  return reports.filter(blocksRoute).map(({lat,lng})=>({lat,lng}));
}
module.exports={blocksRoute,currentObstructions};
