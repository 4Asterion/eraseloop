import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,assertTargetSafety} from '../src/config.js';
const cfg=()=>({schemaVersion:1,baseUrl:'http://127.0.0.1:8791',create:{method:'POST',path:'/test-users',body:{subject:'{{subject}}'}},delete:{method:'DELETE',path:'/test-users/{{subject}}'},probes:[{type:'http',name:'app',path:'/test-users/{{subject}}',expect:'jsonZero',jsonPath:['count']}],observation:{intervalMs:100,durationMs:300}});
test('valid config and local target',()=>{assert.equal(validateConfig(cfg()).probes.length,1);assert.doesNotThrow(()=>assertTargetSafety(cfg()));});
test('reject remote without explicit acknowledgment',()=>{const c=cfg();c.baseUrl='https://api.example.com';assert.throws(()=>assertTargetSafety(c),/remote/i);assert.doesNotThrow(()=>assertTargetSafety(c,true));});
test('reject remote HTTP even when acknowledged',()=>{const c=cfg();c.baseUrl='http://api.example.com';assert.throws(()=>assertTargetSafety(c,true),/HTTPS/);});
test('reject embedded URL credentials',()=>{const c=cfg();c.baseUrl='http://u:pass@127.0.0.1:8000';assert.throws(()=>validateConfig(c),/baseUrl/);});
test('reject duplicate probe names',()=>{const c=cfg();c.probes.push({...c.probes[0]});assert.throws(()=>validateConfig(c),/unique/);});
test('reject SQL identifier injection',()=>{const c=cfg();c.probes=[{name:'sql',type:'postgres',schema:'public',table:'users;DROP',column:'id'}];assert.throws(()=>validateConfig(c),/identifiers/);});
test('reject unscoped redis and s3 keys',()=>{const c=cfg();c.probes=[{name:'cache',type:'redis',key:'everything'}];assert.throws(()=>validateConfig(c),/subject-scoped/);c.probes=[{name:'files',type:'s3',bucket:'demo-bucket',key:'all-files'}];assert.throws(()=>validateConfig(c),/subject-scoped/);});
test('reject cross-origin endpoint path',()=>{const c=cfg();c.delete.path='//evil.com/path';assert.throws(()=>validateConfig(c),/delete/);});
test('reject invalid observation and missing probes',()=>{const c=cfg();c.observation.intervalMs=0;assert.throws(()=>validateConfig(c),/interval/);c.observation.intervalMs=100;c.probes=[];assert.throws(()=>validateConfig(c),/probe/);});

test('graceMs must leave room for a sample after it',()=>{const c=cfg();c.observation.graceMs=200;assert.doesNotThrow(()=>validateConfig(c));c.observation.graceMs=250;assert.throws(()=>validateConfig(c),/graceMs/);c.observation.graceMs=-1;assert.throws(()=>validateConfig(c),/graceMs/);c.observation.graceMs=1.5;assert.throws(()=>validateConfig(c),/graceMs/);});
test('reject unsafe Redis connection parameters',()=>{const c=cfg();c.probes=[{name:'redis',type:'redis',key:'test:{{subject}}',host:'--help',port:6379}];assert.throws(()=>validateConfig(c),/host/);c.probes[0].host='localhost';c.probes[0].port=99999;assert.throws(()=>validateConfig(c),/port/);});
test('reject insecure S3 remote endpoint',()=>{const c=cfg();c.probes=[{name:'blob',type:'s3',bucket:'example-bucket',key:'test/{{subject}}',endpointUrl:'http://remote.example.com:9000'}];assert.throws(()=>validateConfig(c),/Insecure/);c.probes[0].endpointUrl='http://127.0.0.1:59000';assert.doesNotThrow(()=>validateConfig(c));});
