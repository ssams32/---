require('dotenv/config');
const express=require('express');const path=require('path');const api=require('./api/index');
const host=express();host.use(express.static(path.join(__dirname,'public')));host.use(api);const port=process.env.PORT||3000;host.listen(port,()=>console.log(`http://localhost:${port}`));
