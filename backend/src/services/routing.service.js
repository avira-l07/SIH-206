// Routes use operator-reviewed corridor geometry, never an invented street network.
const rad = n => n * Math.PI / 180;
function distance(a,b) { const dlat=rad(b[0]-a[0]), dlng=rad(b[1]-a[1]); const v=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlng/2)**2; return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v))); }
function pointSegmentDistance(p,a,b) {
  const lat0=rad((a[0]+b[0]+p[0])/3), scale=6371000*Math.PI/180;
  const ax=(a[1]-p[1])*Math.cos(lat0)*scale, ay=(a[0]-p[0])*scale, bx=(b[1]-p[1])*Math.cos(lat0)*scale, by=(b[0]-p[0])*scale;
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(ax+t*dx,ay+t*dy);
}
function validPoints(points,min=2) { return Array.isArray(points) && points.length>=min && points.length<=50 && points.every(p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite) && Math.abs(p[0])<=90 && Math.abs(p[1])<=180); }
const key=p=>p.map(v=>v.toFixed(6)).join(',');
function obstructed(a,b,hazards) { return hazards.some(h=>pointSegmentDistance([h.lat,h.lng],a,b)<=100); }
function route(start,end,corridors,hazards,mode,now=Date.now()) {
  const graph=new Map(), coordinates=new Map();
  let excludedSegments=0;
  for (const corridor of corridors) {
    if (!corridor.active || new Date(corridor.expiresAt).getTime()<=now || ![mode,'BOTH'].includes(corridor.mode)) continue;
    let points; try {points=JSON.parse(corridor.points);} catch {continue;} if (!validPoints(points)) continue;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      if (obstructed(a,b,hazards)) {excludedSegments++;continue;}
      const ka=key(a),kb=key(b),weight=distance(a,b);
      for(const [from,to,p] of [[ka,kb,a],[kb,ka,b]]) {coordinates.set(from,p);if(!graph.has(from))graph.set(from,[]);graph.get(from).push({to,weight,corridorId:corridor.id});}
    }
  }
  // Unreviewed connectors are limited to 500m and checked against known obstructions.
  const eligible=(origin)=>[...coordinates].filter(([,p])=>distance(origin,p)<=500 && !obstructed(origin,p,hazards)).map(([k,p])=>({key:k,cost:distance(origin,p)}));
  const starts=eligible(start), ends=eligible(end);
  const costs=new Map(starts.map(x=>[x.key,x.cost])), previous=new Map(), visited=new Set();
  while(visited.size<graph.size) {
    const candidate=[...costs].filter(([k])=>!visited.has(k)).sort((a,b)=>a[1]-b[1])[0]; if(!candidate)break;
    const [current,cost]=candidate;visited.add(current);
    for(const edge of graph.get(current)||[]) {const nextCost=cost+edge.weight;if(nextCost<(costs.get(edge.to)??Infinity)){costs.set(edge.to,nextCost);previous.set(edge.to,{key:current,corridorId:edge.corridorId});}}
  }
  const target=ends.filter(x=>costs.has(x.key)).sort((a,b)=>(costs.get(a.key)+a.cost)-(costs.get(b.key)+b.cost))[0];
  if(!target)return {available:false,excludedSegments,reason:'No connected, current reviewed corridor reaches both locations. Ask the operator for route guidance.'};
  const path=[target.key],used=new Set(); let cursor=target.key;
  while(previous.has(cursor)){const edge=previous.get(cursor);used.add(edge.corridorId);cursor=edge.key;path.unshift(cursor);}
  if(!used.size)return {available:false,excludedSegments,reason:'No reviewed corridor segment connects these locations. Ask the operator for guidance.'};
  const points=[start,...path.map(k=>coordinates.get(k)),end];
  return {available:true,points,distanceMeters:Math.round(costs.get(target.key)+target.cost),excludedSegments,corridors:corridors.filter(c=>used.has(c.id)).map(c=>({id:c.id,name:c.name,reviewedAt:c.reviewedAt,expiresAt:c.expiresAt})),warning:'Suggested reviewed corridor, not a guarantee of safety. Endpoint connectors are unreviewed. Conditions may change; confirm with field staff before travel.'};
}
module.exports={distance,pointSegmentDistance,validPoints,obstructed,route};
