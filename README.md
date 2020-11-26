# neo-graphviz

Utilities to handle GraphViz (dot format) alongside Neo4j (cypher)

Try to remain in generic javascript (avoid neo4j APOC idiosyncrasies)

## Usage
Start an http-server via:
```
yarn start
```
And `open http://localhost:8888`

## Dev issues

* mime `type  application/wasm  wasm` not defined by default `/etc/mime`

### Neo4j specific frameworks
* neo4j-graphviz - Convert neo4j cipher query results into graphviz dot: https://github.com/jexp/neo4j-graphviz
* dot2cypher: Old script takes dot into cypher: https://github.com/jexp/dot2cypher
* arrows: simple drawing tool - online at http://www.apcjones.com/arrows/  via http://guides.neo4j.com/arrows : https://github.com/apcj/arrows
* neo4j-browser: Maybe integrate into neo4j-browser - but it is a lrge GPL-3 licensed artifact @neo4j/neo4j-browser-canary :  https://github.com/neo4j/neo4j-browser
* el-dorado-ui: Some tricks may also be in el-dorado-ui (uses vis/4.21.0):  https://github.com/wardcunningham/el-dorado-ui

### GraphViz specific frameworks
* d3-graphviz: https://github.com/magjac/d3-graphviz
* viz.js:  https://github.com/mdaines/viz.js
* node-graphviz - requires platform binary: https://github.com/glejeune/node-graphviz
* node-graphviz using WASM instead of platform binary (uses slimmed-down version of https://github.com/hpcc-systems/hpcc-js-wasm ): https://github.com/JosephusPaye/node-graphviz#readme

### Other interesting frameworks
* neo4j-3d-force-graph: Maybe look at 3D: https://github.com/jexp/neo4j-3d-force-graph
