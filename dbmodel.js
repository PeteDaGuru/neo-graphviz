#!/usr/bin/env node
/* Utlity to insert nodes into neo4j model DB and then extract them into a diagram using graphviz
*/
let MODEL_DB = process.env.MODEL_DB || 'neo4j://laea005w.rnd.pncint.net:3000/model'
let MODEL_USER = process.env.MODEL_USER || 'neo4j'
let MODEL_PASS = process.env.MODEL_PASS || 'setRealOneInEnvironment'
let MODEL_GV_FILE = 'dbmodel.gv'

let doc = `dbmodel.js: build dbmodel diagrams
  update-db :  execute API calls (API_URL) to insert into model DB (specified by MODEL_DB)
  gen-gv ${MODEL_GV_FILE}: generate graphviz from MODEL_DB to MODEL_GV_FILE
  gen-svg ${MODEL_GV_FILE}: generate SVG from MODEL_GV_FILE
  http: Bring up http server UI on localhost (can specify parms for http-server, like -p 8888 or -h for help)
`

class Neo4j {
    constructor() {
      this.driver = neo4j.driver(MODEL_DB, neo4j.auth.basic(MODEL_USER, MODEL_PASS))
    }
    session() {
     return this.driver.session();
    }
    readSession() {
      return this.driver.session({ defaultAccessMode: neo4j.session.READ });
    }
    writeSession() {
      return this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
    }
}

function main(args) {
  if (args.length === 0 || args[0].length === 0 || args[0][0] === '?' || args[0] === 'help' || args[0][0] === '-') {
      console.error(doc)
      return
  }
  let cmd = args[0].toLowerCase()
  if (cmd === 'update-db') {
    require('update-db').updateDbViaAPI([API_URL])
  } else if (cmd === 'gen-gv') {
    console.log('tbd')
  } else if (cmd === 'gen-svg') {
    console.log('tbd')
  } else if (cmd === 'http') {
    process.argv = process.argv.slice(1) // Eat the 'http', let http-server pick up it's args via argv=require('minimist')(process.argv.slice(2)
    require('./node_modules/http-server/bin/http-server')
  } else {
      console.error(`unknown command ${args[0]}\n${doc}`)
  }
}

if (require.main === module) {  // Run via CLI, not require() or import {}
    main(process.argv.slice(2));
}
