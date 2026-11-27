'use strict';
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const nunjucks = require('nunjucks');
const multer = require('multer');
const {Jimp}=require('jimp');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const categories = {study:'勉強・進路', create:'つくる・表現', club:'部活・スポーツ', daily:'放課後・日常'};
const symbols = {study:'Aa', create:'✳', club:'◎', daily:'☀'};
const imagePattern = /^[0-9a-f]{32}\.jpg$/;

class LocalStore {
  constructor(folder) { this.folder=folder; }
  async init() { await fs.mkdir(this.folder,{recursive:true}); }
  async list() {
    const names=await fs.readdir(this.folder);
    return Promise.all(names.filter(n=>/^[0-9a-f]{32}\.json$/.test(n)).map(async n=>JSON.parse(await fs.readFile(path.join(this.folder,n),'utf8'))));
  }
  async add(post) {
    const target=path.join(this.folder,post.id+'.json');
    const temp=target+'.tmp';
    await fs.writeFile(temp,JSON.stringify(post),{flag:'wx'});
    await fs.rename(temp,target);
  }
  async upload(name,data) { await fs.writeFile(path.join(this.folder,name),data,{flag:'wx'}); }
  async removeImage(name) { await fs.rm(path.join(this.folder,name),{force:true}); }
  async image(name) { return fs.readFile(path.join(this.folder,name)); }
}

class AzureStore {
  constructor(connection) {
    if (!connection) throw new Error('Azure storage connection is required');
    const {TableClient}=require('@azure/data-tables');
    const {BlobServiceClient}=require('@azure/storage-blob');
    this.table=TableClient.fromConnectionString(connection,process.env.AZURE_TABLE_NAME||'HoukagoPosts');
    this.container=BlobServiceClient.fromConnectionString(connection).getContainerClient(process.env.AZURE_BLOB_CONTAINER||'post-images');
  }
  async init() {
    try { await this.table.createTable(); } catch(e) { if(e.statusCode!==409) throw e; }
    await this.container.createIfNotExists();
  }
  async list() {
    const posts=[];
    for await (const e of this.table.listEntities({queryOptions:{filter:"PartitionKey eq 'posts'"}})) {
      const {partitionKey,rowKey,timestamp,etag,...post}=e;
      posts.push(post);
    }
    return posts;
  }
  async add(post) { await this.table.createEntity({partitionKey:'posts',rowKey:post.id,...post}); }
  async upload(name,data) { await this.container.getBlockBlobClient(name).uploadData(data,{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'image/jpeg'}}); }
  async removeImage(name) { await this.container.deleteBlob(name); }
  async image(name) { return this.container.getBlobClient(name).downloadToBuffer(); }
}

function urlFor(endpoint,args={}) {
  if(endpoint==='static') return '/static/'+args.filename;
  if(endpoint==='images') return '/images/'+encodeURIComponent(args.name);
  if(endpoint==='detail') return '/posts/'+encodeURIComponent(args.post_id);
  if(endpoint==='new') return '/new';
  const qs=new URLSearchParams(Object.entries(args).filter(([k,v])=>k!=='__keywords'&&v!==undefined&&v!==''));
  return '/'+(qs.size?'?'+qs:'');
}

async function createApp(options={}) {
  const hosted=Boolean(process.env.WEBSITE_SITE_NAME);
  const mode=options.mode||process.env.STORAGE_MODE||(hosted?'appservice':'local');
  if(!['local','azure','appservice'].includes(mode)) throw new Error('Invalid STORAGE_MODE');
  let secret=options.secret||process.env.SECRET_KEY;
  if(hosted && mode==='local') throw new Error('Use persistent App Service storage or Azure storage when hosted');
  if(hosted && mode==='azure'&&!secret) throw new Error('Azure storage mode requires SECRET_KEY');
  let folder=options.folder||path.join(__dirname,'instance');
  if(mode==='appservice') {
    const home=options.home||process.env.HOME;
    if(!home) throw new Error('App Service HOME is required for persistent storage');
    if(process.env.WEBSITE_LOCAL_CACHE_OPTION==='Always') throw new Error('Local cache must be disabled for persistent App Service data');
    folder=path.join(home,'data','houkago-lab');
    await fs.mkdir(folder,{recursive:true});
    if(!secret) {
      const keyPath=path.join(folder,'session-key.txt');
      try {await fs.writeFile(keyPath,crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
      catch(e) {if(e.code!=='EEXIST') throw e;}
      secret=await fs.readFile(keyPath,'utf8');
      if(!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid persisted session key');
    }
  }
  const store=options.store||(mode==='azure'?new AzureStore(process.env.AZURE_STORAGE_CONNECTION_STRING):new LocalStore(folder));
  await store.init();
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  const env=nunjucks.configure(path.join(__dirname,'views'),{autoescape:true,express:app});
  env.addFilter('string',String);
  env.addFilter('jpdate',v=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)));
  env.addGlobal('url_for',urlFor);
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});
    next();
  });
  app.use('/static',express.static(path.join(__dirname,'static')));
  app.use(cookieSession({name:'lab',keys:[secret||crypto.randomBytes(32).toString('hex')],httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='1'||hosted,maxAge:86400000}));
  app.use((req,res,next)=>{
    req.session.csrf ||= crypto.randomBytes(32).toString('hex');
    res.locals={...res.locals,categories,category_entries:Object.entries(categories),symbols,minutes_options:[10,30,60],csrf:req.session.csrf,messages:[]};
    next();
  });
  app.get('/',async(req,res)=>{
    const category=String(req.query.category||'');
    const q=String(req.query.q||'').trim().slice(0,100);
    const minutes=String(req.query.minutes||'');
    const all=await store.list();
    const posts=all.filter(p=>(!category||p.category===category)&&(!minutes||String(p.minutes)===minutes)&&(!q||(p.title+p.body).toLocaleLowerCase().includes(q.toLocaleLowerCase()))).sort((a,b)=>b.created.localeCompare(a.created));
    res.render('index.html',{posts,total:all.length,category,q,selected_minutes:minutes});
  });
  app.get('/new',(req,res)=>res.render('new.html',{values:{},errors:[]}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:8,fieldSize:10000,parts:10}}).single('image');
  app.post('/new',upload,async(req,res)=>{
    const supplied=String(req.body.csrf||'');
    if(!/^[a-f0-9]{64}$/.test(supplied)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(req.session.csrf))) return res.status(400).render('error.html',{message:'画面を再読み込みして投稿してください。'});
    const values=Object.fromEntries(['title','body','author','category','minutes'].map(k=>[k,String(req.body[k]||'').trim()]));
    const errors=[];
    for(const [key,label,max] of [['title','タイトル',60],['body','本文',1200],['author','ニックネーム',20]]) {
      if(!values[key]||[...values[key]].length>max) errors.push(`${label}は1〜${max}文字で入力してください。`);
    }
    if(!Object.hasOwn(categories,values.category)||!['10','30','60'].includes(values.minutes)) errors.push('カテゴリと所要時間を選んでください。');
    if(req.body.agreement!=='yes') errors.push('投稿ルールへの同意が必要です。');
    let imageData;
    if(req.file) {
      try {
        const raw=req.file.buffer;
        const isPng=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const isJpeg=raw[0]===255&&raw[1]===216&&raw[2]===255;
        if(!isPng&&!isJpeg) throw new Error('format');
        if(isPng&&(raw.length<24||raw.readUInt32BE(16)*raw.readUInt32BE(20)>20000000)) throw new Error('pixels');
        const image=await Jimp.fromBuffer(raw,{'image/jpeg':{maxResolutionInMP:20,maxMemoryUsageInMB:128}});
        if(image.bitmap.width*image.bitmap.height>20000000) throw new Error('pixels');
        if(image.bitmap.width>1600||image.bitmap.height>1600) image.scaleToFit({w:1600,h:1600});
        imageData=await image.getBuffer('image/jpeg',{quality:85});
      } catch {errors.push('JPEG・PNGの画像を選んでください（最大2000万画素）。');}
    }
    if(errors.length) return res.status(400).render('new.html',{values,errors});
    const id=crypto.randomUUID().replaceAll('-','');
    const image=imageData?id+'.jpg':'';
    if(imageData) await store.upload(image,imageData);
    try { await store.add({...values,minutes:Number(values.minutes),id,created:new Date().toISOString(),image}); }
    catch(e) {if(image) await store.removeImage(image); throw e;}
    res.redirect(303,'/posts/'+id);
  });
  app.get('/posts/:id',async(req,res)=>{
    const post=(await store.list()).find(p=>p.id===req.params.id);
    if(!post) return res.status(404).render('error.html',{message:'ページが見つかりませんでした。'});
    res.render('detail.html',{post});
  });
  app.get('/images/:name',async(req,res,next)=>{
    if(!imagePattern.test(req.params.name)) return res.sendStatus(404);
    try { res.type('jpeg').set('Cache-Control','public, max-age=3600').send(await store.image(req.params.name)); }
    catch(e) {if(e.code==='ENOENT'||e.statusCode===404) return res.sendStatus(404);next(e);}
  });
  app.get('/health',(req,res)=>res.json({status:'ok',storage:mode,runtime:'node-windows'}));
  app.use((req,res)=>res.status(404).render('error.html',{message:'ページが見つかりませんでした。'}));
  app.use((err,req,res,next)=>{
    const bad=err instanceof multer.MulterError;
    if(!bad) console.error('Request failed:',err.code||err.name); // no credentials or connection strings
    res.status(bad?413:500).render('error.html',{message:bad?'画像は5MB以下、1枚までにしてください。':'保存先に接続できませんでした。時間をおいてお試しください。'});
  });
  app.locals.store=store;
  return app;
}
if(require.main===module) createApp().then(app=>app.listen(process.env.PORT||3000,()=>console.log('Houkago Lab started'))).catch(e=>{console.error('Startup failed:',e.code||e.name);process.exit(1);});
module.exports={createApp,LocalStore,AzureStore};
