'use strict';
const {createApp}=require('./app');
createApp().then(app=>app.listen(process.env.PORT||3000,()=>console.log('Houkago Lab started'))).catch(e=>{console.error('Startup failed:',e.code||e.name);process.exit(1);});
