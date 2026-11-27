const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {Jimp}=require('jimp');
const {createApp,LocalStore,AzureStore}=require('../app');

test('Windows board: create, search, escaping, persistence, image, validation',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lab-win-'));
  const app=await createApp({mode:'local',folder,secret:'test-only'});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const page=await fetch(base+'/new');
    const html=await page.text();
    assert.equal(page.status,200);assert.match(html,/今日の/);
    const csrf=html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
    const cookie=page.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
    const form=(changes={},image)=>{
      const f=new FormData();
      const values={title:'数学の発見',body:'本文 <script>alert(1)</script>',author:'テスト',category:'study',minutes:'10',agreement:'yes',csrf,...changes};
      for(const [k,v] of Object.entries(values)) f.append(k,v);
      if(image) f.append('image',new Blob([image]),'pic.png');
      return f;
    };
    const post=await fetch(base+'/new',{method:'POST',headers:{cookie},body:form(),redirect:'manual'});
    assert.equal(post.status,303);
    const detail=await (await fetch(base+post.headers.get('location'))).text();
    assert.match(detail,/数学の発見/);assert.match(detail,/&lt;script&gt;/);assert.doesNotMatch(detail,/<script>alert/);
    const top=await fetch(base+'/?category=study&minutes=10&q=数学');assert.match(await top.text(),/数学の発見/);
    assert.doesNotMatch(await (await fetch(base+'/?category=club')).text(),/数学の発見/);
    assert.doesNotMatch(await (await fetch(base+'/?minutes=60')).text(),/数学の発見/);
    const restored=new LocalStore(folder);await restored.init();assert.equal((await restored.list()).length,1);
    const image=await new Jimp({width:5,height:5,color:0xff0000ff}).getBuffer('image/png');
    const withImage=await fetch(base+'/new',{method:'POST',headers:{cookie},body:form({title:'画像投稿'},image),redirect:'manual'});
    assert.equal(withImage.status,303);
    const saved=(await restored.list()).find(p=>p.image);
    const download=await fetch(base+'/images/'+saved.image);
    assert.equal(download.status,200);assert.match(download.headers.get('content-type'),/image\/jpeg/);
    const imageBytes=Buffer.from(await download.arrayBuffer());
    assert.equal(imageBytes[0],255);assert.equal(imageBytes[1],216);
    for(const changes of [{csrf:'wrong'},{title:''},{category:'bad'},{minutes:'5'},{agreement:''},{body:'x'.repeat(1201)}]) {
      const bad=await fetch(base+'/new',{method:'POST',headers:{cookie},body:form(changes)});assert.equal(bad.status,400);
    }
    const fake=await fetch(base+'/new',{method:'POST',headers:{cookie},body:form({},Buffer.from('fake'))});assert.equal(fake.status,400);
    const large=await fetch(base+'/new',{method:'POST',headers:{cookie},body:form({},Buffer.alloc(5*1024*1024+1))});assert.equal(large.status,413);
    assert.equal((await fetch(base+'/posts/missing')).status,404);
    assert.equal((await fetch(base+'/images/invalid.jpg')).status,404);
    assert.equal(top.headers.get('x-content-type-options'),'nosniff');
    assert.match(top.headers.get('content-security-policy'),/default-src 'self'/);
    assert.equal((await restored.list()).length,2);
    assert.equal((await (await fetch(base+'/health')).json()).runtime,'node-windows');
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.rm(folder,{recursive:true,force:true});
  }
});

test('Azure adapter invokes Table/Blob contracts (mock only)',async()=>{
  const store=Object.create(AzureStore.prototype);let entity,blobName,deleted;
  store.table={createTable:async()=>{},createEntity:async e=>{entity=e},listEntities:async function*(){yield {partitionKey:'posts',rowKey:'a',id:'a',title:'test'}}};
  store.container={createIfNotExists:async()=>{},getBlockBlobClient:name=>({uploadData:async(data,options)=>{blobName=name;assert.equal(options.blobHTTPHeaders.blobContentType,'image/jpeg')}}),getBlobClient:()=>({downloadToBuffer:async()=>Buffer.from('test')}),deleteBlob:async name=>{deleted=name}};
  await store.init();await store.add({id:'a',title:'test'});assert.equal(entity.partitionKey,'posts');assert.equal(entity.rowKey,'a');
  assert.deepEqual(await store.list(),[{id:'a',title:'test'}]);
  await store.upload('a.jpg',Buffer.from('test'));assert.equal(blobName,'a.jpg');
  assert.equal((await store.image('a.jpg')).toString(),'test');await store.removeImage('a.jpg');assert.equal(deleted,'a.jpg');
});

test('App Service built-in storage and session key persist outside deployment folder',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'lab-home-'));
  try {
    const first=await createApp({mode:'appservice',home});
    const keyPath=path.join(home,'data','houkago-lab','session-key.txt');
    const firstKey=await fs.readFile(keyPath,'utf8');
    assert.match(firstKey,/^[a-f0-9]{64}$/);
    await first.locals.store.add({id:'a'.repeat(32),title:'persisted',image:''});
    const second=await createApp({mode:'appservice',home});
    assert.equal(await fs.readFile(keyPath,'utf8'),firstKey);
    assert.equal((await second.locals.store.list())[0].title,'persisted');
    await assert.rejects(createApp({mode:'appservice',home,folder:'ignored',store:{init:async()=>{throw new Error('storage failure')}}}),/storage failure/);
  } finally {await fs.rm(home,{recursive:true,force:true});}
});
