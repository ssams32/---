const test=require('node:test');
const assert=require('node:assert/strict');
const {createDownloadSession,verifyDownloadSession}=require('../server/crypto');
test('download session is bound to exactly one photo',()=>{const secret='z'.repeat(40),id='123e4567-e89b-42d3-a456-426614174000',other='223e4567-e89b-42d3-a456-426614174000';const s=createDownloadSession(secret,id,new Date(Date.now()+60000));assert.equal(verifyDownloadSession(secret,s.cookie,id),true);assert.equal(verifyDownloadSession(secret,s.cookie,other),false);assert.equal(verifyDownloadSession(secret,s.cookie+'x',id),false);});
