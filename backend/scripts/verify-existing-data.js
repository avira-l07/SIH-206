// Reports table counts and hashes only; no personal records leave the local database.
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const url=process.env.DATABASE_URL||'file:./dev.db';
if(!url.startsWith('file:'))throw Error('This verification is for local SQLite development databases');
const databasePath=path.resolve(__dirname,'../prisma',url.slice(5)),root=path.resolve(__dirname,'..');
if(!databasePath.toLowerCase().startsWith((root+path.sep).toLowerCase()))throw Error('Database must be within the project backend');
const snapshot=path.resolve(__dirname,'../test/evacuation-before.json');
const db=new DatabaseSync(databasePath,{readOnly:true});
try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const current=Object.fromEntries(tables.map(({name})=>{const rows=db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all();return [name,{count:rows.length,hash:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];}));
  if(process.argv.includes('--verify')){
    const before=JSON.parse(fs.readFileSync(snapshot,'utf8'));
    const changed=Object.keys(before).filter(name=>JSON.stringify(before[name])!==JSON.stringify(current[name]));
    if(changed.length)throw Error('Existing data changed in tables: '+changed.join(', '));
    console.log('Verified '+Object.keys(before).length+' existing tables: all row counts and hashes unchanged.');
  }else{fs.writeFileSync(snapshot,JSON.stringify(current,null,2));console.log('Saved count/hash snapshot for '+tables.length+' existing tables.');}
}finally{db.close();}
