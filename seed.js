const {createApp}=require('./app');
const crypto=require('node:crypto');
(async()=>{
  if((process.env.STORAGE_MODE||'local')!=='local') throw new Error('Local mode only');
  const app=await createApp();const store=app.locals.store;
  if((await store.list()).length) return console.log('Posts already exist. Skipped.');
  const samples=[['study',10,'英単語、絵にしたら覚えられた。','青いノート','今日の10単語を小さな絵でメモ。意味が自分に伝わればOK！'],['create',30,'帰り道の色を、3色だけで描いてみた','ミント','空と夕焼けと木の色。いつもの道の新しい発見。'],['club',10,'練習前の10分、ストレッチ記録はじめた','はる','無理のない範囲で体をほぐし、一言ずつノートに記録。'],['daily',30,'スマホを置いて、放課後の音を集める','そら','通知をオフにして散歩。気になった音を言葉にしてみました。'],['create',60,'余った紙で、ちいさなZINEづくり','こはく','A4を折って8ページの本に。好きなものだけで一冊作れます。'],['study',30,'友達に説明したら、数学のつまずき発見','ルート','例題の解き方を声に出すと、理解があやふやな場所がわかりました。']];
  for(const [i,[category,minutes,title,author,body]] of samples.entries()) await store.add({id:crypto.randomUUID().replaceAll('-',''),title,body,author:author+'（見本）',category,minutes,created:new Date(Date.now()-i*3600000).toISOString(),image:''});
  console.log('Added 6 demo posts.');
})().catch(()=>{console.error('Seed failed');process.exit(1)});
