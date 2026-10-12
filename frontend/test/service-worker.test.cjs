const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function worker({offline=false,quota=false,vary=false}={}) {
  const listeners={},responses=new Map([['/index.html',new Response('saved shell')]]),cache={match:async(key,options)=>vary&&typeof key!=='string'&&key.url.includes('/assets/') ? (options?.ignoreVary ? new Response('cached module') : undefined) : responses.get(typeof key==='string'?key:key.url),put:async()=>{if(quota)throw Error('quota');},keys:async()=>[],delete:async()=>true};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../public/sw.js'),'utf8'),{URL,Response,self:{location:{href:'http://localhost/sw.js',origin:'http://localhost'},addEventListener:(type,fn)=>listeners[type]=fn},caches:{open:async()=>cache},fetch:async()=>{if(offline)throw Error('network');return new Response('live response');}});
  const get=async(url,extra={})=>{let response;listeners.fetch({request:{url,method:'GET',headers:new Headers(),mode:'cors',...extra},respondWith:promise=>{response=promise;}});return response?await response:null;};
  return {get};
}
test('service worker returns offline shell and never intercepts private API or authorized requests',async()=>{
  const sw=worker({offline:true});assert.equal(await (await sw.get('http://localhost/console',{mode:'navigate'})).text(),'saved shell');
  assert.equal(await sw.get('http://localhost/api/sos'),null);assert.equal(await sw.get('http://localhost/assets/private',{headers:new Headers({Authorization:'Bearer private'})}),null);
  assert.equal(await sw.get('http://localhost/api/sos',{method:'POST'}),null);
});
test('cache quota failures preserve successfully fetched navigation, assets and map tiles',async()=>{
  const sw=worker({quota:true});for(const [url,mode] of [['http://localhost/console','navigate'],['http://localhost/assets/main.js','cors'],['https://tile.openstreetmap.org/9/1/1.png','cors']])assert.equal(await(await sw.get(url,{mode})).text(),'live response');
});
test('public cached modules remain available offline when the static server varies by Origin',async()=>{
  const sw=worker({offline:true,vary:true});assert.equal(await(await sw.get('http://localhost/assets/main.js')).text(),'cached module');
  assert.equal(await sw.get('http://localhost/assets/main.js',{headers:new Headers({Authorization:'Bearer private'})}),null);
});
