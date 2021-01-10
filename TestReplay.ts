#!/usr/bin/env ts-node-script
// setup replay directory:  mkdir -p replay; rm replay/e2e-0*.js ; cp e2e--echo-key.js replay/
// Ensure tsc and ts-node are installed, and tsconfig.json has "target": "es6", "outDir": "./dist", "strictNullChecks": false, "sourceMap": true,
// To run: ./TestReplay.ts
// To debug:  node --inspect-brk --require ts-node/register TestReplay.ts ; # open chrome://inspect/#devices

import { ReplayData } from './ReplayData'

function main(args:string[]) {
   let v = new ReplayData()
   v.init({writeFilesLive: true, useValueFiles: true})
   v.load()
   console.log(`loaded ${v.keyCount} unique keys from ${v.keyFileCount} files`)
   const loaded_keyCount = v.keyCount
   const loaded_keyFileCount = v.keyFileCount
   const lookupParm1 = { echo: true, msg: 'test of dynamic value creation by value function' }
   let retVal = v.playbackValueFor({key:'echo', parm: lookupParm1})
   console.log(`lookupParm1 success=${v.isDeepStrictEqual(lookupParm1, retVal)} ${v.stringFromData(retVal, -1)}`)

   const k1 = {key:'a', parm: 'p1', value: 'value for k1'}
   v.record(k1)
   const k2 = {key:'a', parm: {a1: 1, b: { b1: 2 }}, value: {ret: 'retval for k2'}}
   v.record(k2)
   const k1a = {key:'a', parm: 'p1', value: 'value for k1a'}
   v.record(k1a)
   const v1 = v.playbackValueFor(k1)
   const v1a = v.playbackValueFor(k1a)
   const v2 = v.playbackValueFor(k2)
   console.log(`k1 success=${v1 === k1.value} ${v.stringFromData(v1, -1)}`)
   console.log(`k1a success=${v1a === k1a.value} ${v.stringFromData(v1a, -1)}`)
   console.log(`k2 success=${v.isDeepStrictEqual(v2, k2.value)} ${v.stringFromData(v2, -1)}`)

   console.log(`added ${v.keyCount - loaded_keyCount} keys and recorded ${v.keyFileCount - loaded_keyFileCount} files`)
}

if (require.main === module) {  // Run via CLI, not require() or import {}
   main(process.argv.slice(2));
}
