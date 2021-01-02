#!/usr/bin/env node
const doc = `json2gv.js: build graphviz dot diagrams from JSON received via stdin
 json - handle json generically
 neo4j - process neo4j result from cipher query (which may include summary, plan, or profile of EXPLAIN or PROFILE used)
`
// Start with main() function at end

var isTTY = process.stdin.isTTY;
var stdout = process.stdout;

/*
  good docs on graphviz usage for datastructures via cpan - GraphViz::Data::Structure - alternative to GraphViz::Data::Grapher (perl): https://metacpan.org/pod/GraphViz::Data::Structure

  also: https://renenyffenegger.ch/notes/tools/Graphviz/elems/node/main-types/record-based

*/

function GraphMap(overrideParms) {
 const me = {
    mapIdToNode: {},
    mapNodeToId: new WeakMap(),
    nodeNum: 0,
    parms: {
     ...{
      name: 'json',
      maxStringLen: 40,
      nodeIdPrefix: 'n',
      portIdPrefix: 'p',
      graphDefaults: 'graph [rankdir="LR", label="data", fontname="helvetica"]', // dpi=100
      nodeDefaults: 'node [fontsize="16", fontname="helvetica", shape="Mrecord"]', // labeltooltip="node"
      edgeDefaults: 'edge [fontname="helvetica"]', // , labeltooltip="edge"
      newLine: '\n',
      inelineEmptyObjects: false,
     },
     ...overrideParms
    },
    safeForNodeId: (val) => {
      return `${val}`.replace(/([^\w])/g, '')
    },
    addNode: (node, objName) => {
      let id = `${me.parms.nodeIdPrefix}${me.nodeNum++}`
      if (objName != null) {
        id = `${id}_${objName}`
      }
      id = me.safeForNodeId(id)
      me.mapNodeToId.set(node, id)
      me.mapIdToNode[id] = node
      return id
    },
    idForNode: (node) => {
      return me.mapNodeToId.get(node)
    },
    writeHeader: (out) => {
      out.write(`digraph "${me.parms.name}" {${me.parms.newLine}`)
      out.write(`${me.parms.graphDefaults}${me.parms.newLine}`)
      out.write(`${me.parms.nodeDefaults}${me.parms.newLine}`)
      out.write(`${me.parms.edgeDefaults}${me.parms.newLine}`)
      return me
    },
    writeTrailer: (out) => {
      out.write(`}${me.parms.newLine}`)
      return me
    },
    safeForLabel: (val) => {
      return `${val}`.replace(/([{}"|<>])/g, '\\$1')
    },
    safeForLabelLength: (val) => {
      let str = me.safeForLabel(val)
      if (str.length > me.parms.maxStringLen) {
        str = `${str.substring(0,me.parms.maxStringLen-3)}...`
      }
      return str
    },
    traverseObj: (inObj, out, inObjName) => {  // Default traversal
      return traverseObj(me, inObj, out, inObjName)
    },
    safeForTooltip: (val) => {
      return `${val}`.replace(/(["])/g, '\\$1')
    },
    optionalTooltipFor: (val, labelVal) => {
      if (labelVal == null) labelVal = me.safeForLabelLength()
      if (labelVal.endsWith('...')) {
        return ` tooltip="${me.safeForTooltip(val)}"`
      }
      return ''
    },
    inlineLabel: (val) => {  // Answer raw label value for in-lined struct, or return null to keep it separate
      if (me.parms.inlineEmptyObjects) {
        if (Array.isArray(val) && val.length == 0) {
          return '[]'    // Note that shared empty arrays will not be shown correctly
        } else if (typeof val === 'object' && val != null) {
          if (Object.entries(val).length === 0) {
            return '\\{\\}'  // Note that shared empty objects will not be shown correctly
          }
        }
      }
      return null
    },
  }
  return me
}

function traverseArray(idMaps, inObj, out, inObjName) {
  let nodeId = idMaps.idForNode(inObj, inObjName)
  if (nodeId != null) return nodeId // Already been here
  nodeId = idMaps.addNode(inObj, inObjName)
  if (inObjName == null) inObjName = ''
  let labels = []
  let edges = []
  let ports = []
  const entries = Object.entries(inObj)
  if (entries.length === 0) {
    out.write(`${nodeId} [shape="plaintext" label="${inObjName}[]"]${idMaps.parms.newLine}`)
    return nodeId
  }
  let idx = 0
  let tooltip = ''
  for (const [name, val] of entries) {
    let port = null
    if (typeof val === 'object' && val != null) { // includes Array
      const inlineValue = idMaps.inlineLabel(val)
      if (inlineValue == null) {
        port = `${idMaps.parms.portIdPrefix}${idx}`
        labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
      } else {
        labels.push(`{${idMaps.safeForLabel(name)}|${inlineValue}}`)
        if (tooltip.length === 0) {
          tooltip = idMaps.optionalTooltipFor(inlineValue,inlineValue)
        }
      }
    } else {
      const labelVal = idMaps.safeForLabelLength(val)
      labels.push(`{${idMaps.safeForLabel(name)}|${labelVal}}`)
      if (tooltip.length === 0) {
        tooltip = idMaps.optionalTooltipFor(val,labelVal)
      }
    }
    ports.push(port)
    idx++
  }
  out.write(`${nodeId} [shape="record" label="${labels.join('|')}"${tooltip}]${idMaps.parms.newLine}`)
  idx = 0
  for (const [name, val] of entries) {
    if (typeof val === 'object' && val != null) { // includes Array
      const port = ports[idx]
      if (port != null) {
        const id = idMaps.traverseObj(val, out, `${inObjName}[${name}]`)
        edges.push(`${nodeId}:${port} -> ${id} [label="${inObjName}[${idMaps.safeForLabel(name)}]"]`)
      }
    }
    idx++
  }
  for (const e of edges) {
    out.write(`${e}${idMaps.parms.newLine}`)
  }
  return nodeId
}

function traverseStruct(idMaps, inObj, out, inObjName) {
  let nodeId = idMaps.idForNode(inObj)
  if (nodeId != null) return nodeId // Already been here
  nodeId = idMaps.addNode(inObj, inObjName)
  let edgeNamePrefix = ''
  if (inObjName != null) {
    edgeNamePrefix = `${inObjName}.`
  }
  let tooltip = ''
  let labels = []
  let edges = []
  let ports = []
  const entries = Object.entries(inObj)
  if (entries.length === 0) {
    out.write(`${nodeId} [shape="plaintext" label="{}"]${idMaps.parms.newLine}`)
    return nodeId
  }
  let idx = 0
  for (const [name, val] of entries) {
    let port = null
    if (typeof val === 'object' && val != null) { // includes Array
      const inlineValue = idMaps.inlineLabel(val)
      if (inlineValue == null) {
        // port = `${idMaps.parms.portIdPrefix}${idx}`
        port = name
        labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
      } else {
        labels.push(`{${idMaps.safeForLabel(name)}|${inlineValue}}`)
        if (tooltip.length === 0) {
          tooltip = idMaps.optionalTooltipFor(inlineValue,inlineValue)
        }
      }
    } else {
      const labelVal = idMaps.safeForLabelLength(val)
      labels.push(`{${idMaps.safeForLabel(name)}|${labelVal}}`)
      if (tooltip.length === 0) {
        tooltip = idMaps.optionalTooltipFor(val,labelVal)
      }
    }
    ports.push(port)
    idx++
  }
  out.write(`${nodeId} [label="${labels.join('|')}"${tooltip}]${idMaps.parms.newLine}`)
  idx = 0
  for (const [name, val] of entries) {
    if (typeof val === 'object' && val != null) { // includes Array
      const port = ports[idx]
      if (port != null) {
        const id = idMaps.traverseObj(val, out, name)
        edges.push(`${nodeId}:${port} -> ${id} [label="${idMaps.safeForLabel(edgeNamePrefix + name)}"]`)
      }
    }
    idx++
  }
  for (const e of edges) {
    out.write(`${e}${idMaps.parms.newLine}`)
  }
  return nodeId
}

// Default method for traversing an object tree - answer nodeId
function traverseObj(idMaps, inObj, out, inObjName) {
  // Not here: let nodeId = idMaps.idForNode(inObj); if (nodeId != null) return nodeId // Already been here
  let nodeId = null
  if (Array.isArray(inObj)) {
    nodeId = traverseArray(idMaps, inObj, out, inObjName)
  } else if (typeof inObj === 'object' && inObj != null) {
    nodeId = traverseStruct(idMaps, inObj, out, inObjName)
  } else { // Shouldn't really get here for primitives
    const prim = {type: typeof inObj, value: `${inObj}`}
    nodeId = idMaps.addNode(prim, inObjName)
    out.write(`${nodeId} [shape="ellipse" label="${prim.value}"]`)
  }
  return nodeId
}


function gvFromJson(inObj, out) {
  const idMaps = GraphMap()
  idMaps.writeHeader(out)
  idMaps.traverseObj(inObj, out)
  idMaps.writeTrailer(out)
}



function traverseObjNeo4j(idMaps, inObj, out, inObjName) {
  // Not here: let nodeId = idMaps.idForNode(inObj); if (nodeId != null) return nodeId // Already been here
  nodeId = null //TODO handleNeo4jSummary(idMaps, inObj, out, inObjName)
  if (nodeId == null) nodeId = traverseNeo4jProfile(idMaps, inObj, out, inObjName)
  if (nodeId == null) nodeId = traverseObj(idMaps, inObj, out, inObjName)
  return nodeId
}

// Handle neo4j result summary.profile and summary.plan if possible
function traverseNeo4jProfile(idMaps, inObj, out, inObjName) {
  let nodeId = idMaps.idForNode(inObj)
  if (nodeId != null) return nodeId // Already been here
  if (inObj == null || typeof inObj !== 'object') return null
  const entries = Object.entries(inObj)
  // if (!includesAll(entries,['identifiers','arguments','children'])) return null
  if (!Array.isArray(inObj.identifiers) || inObj.arguments == null || !Array.isArray(inObj.children)) return null
  nodeId = idMaps.addNode(inObj, inObjName)
  let edgeNamePrefix = ''
  if (inObjName != null) {
    edgeNamePrefix = `${inObjName}.`
  }
  const operatorType = inObj.operatorType // can use for name
  if (operatorType != null) {
    edgeNamePrefix = `${operatorType}.`
  }
  let labels = []
  let edges = []
  let ports = []
  let followingEntries = []  // corresponds with ports, but not necessarily to labels array
  for (const [name, val] of entries) {
    let port = null
    if (typeof val === 'object' && val != null) { // includes Array
      const inlineValue = idMaps.inlineLabel(val)
      if (inlineValue == null) {
        if (name === 'identifiers') {
          labels.push(`{${idMaps.safeForLabel(name)}|{{${val.map(e => idMaps.safeForLabel(e)).join('|')}}}}`)
        } else if (name === 'children') {
          port = name
          labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
          for (let i=0; i < val.length; i++) {
            let label = name
            if (val.length > 1) label = `${label}[${i}]`
            followingEntries.push([label, val[i]])
            ports.push(port)
          }
        } else {
          port = name
          labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
          followingEntries.push([name, val])
          ports.push(port)
        }
      } else {
        labels.push(`{${idMaps.safeForLabel(name)}|${inlineValue}}`)
      }
    } else {
      labels.push(`{${idMaps.safeForLabel(name)}|${idMaps.safeForLabelLength(val)}}`)
    }
  }
  out.write(`${nodeId} [label="${labels.join('|')}"]${idMaps.parms.newLine}`)
  for (let idx=0; idx < followingEntries.length; idx++) {
    const name = followingEntries[idx][0]
    const val = followingEntries[idx][1]
    const port = ports[idx]
    if (port != null) {
      const id = idMaps.traverseObj(val, out, name)
      edges.push(`${nodeId}:${port} -> ${id} [label="${idMaps.safeForLabel(edgeNamePrefix + name)}"]`)
    }
  }
  for (const e of edges) {
    out.write(`${e}${idMaps.parms.newLine}`)
  }
  return nodeId
}

function includesAll(entries, attrNames) {
  const names = entries.map(e => e[0])
  for (const e of attrNames) {
    if (!names.includes(e)) return false
  }
  return true
}

// Eventually handle {low,high} numbers, heuristics for children, labels, PROFILE and EXPLAIN output
function gvFromNeo4jJson(inObj, out) {
  const idMaps = GraphMap({inlineEmptyObjects: true})
  const original_inlineLabel = idMaps.inlineLabel
  idMaps.inlineLabel = (val) => {
    let label = original_inlineLabel(val)
    if (label == null) {
      if (typeof val === 'object') {
        const entries = Object.entries(val)
        // neo4j represents integers with {low,high} to allow 64-bit integers to work in Javascript (where numbers lose precision after 2^53 - 1 Number.MAX_SAFE_INTEGER=9007199254740991 )
        if (entries.length == 2 && includesAll(entries,['low','high'])) {
          if (val.high === 0) return `${val.low}`
          return `{{low|${val.low}}|{high|${val.high}}}`
        }
      }
    }
    return label
  }
  idMaps.traverseObj = (inObj, out, inObjName) => {
    return traverseObjNeo4j(idMaps, inObj, out, inObjName)
  },
  idMaps.writeHeader(out)
  idMaps.traverseObj(inObj, out)
  idMaps.writeTrailer(out)
}
/*
Use GraphViz to turn DSL (Scala/Java) into diagams: https://github.com/ing-bank/baker
gprof2dot - python code to convert profiler output to GraphViz dot diagrams (linux perf, prof, gprof, dtrace, hprof, xprof - 2020-11-02): https://github.com/jrfonseca/gprof2dot
*/
/*
 neo4j-graphiz to turn cipher query results into GraphViz dot format (gv): https://github.com/jexp/neo4j-graphviz
// colors from: http://flatuicolors.com/
var colors = {all:["#2ecc71","#1abc9c","#3498db","#9b59b6","#34495e","#16a085","#f1c40f","#e67e22",
                   "#e74c3c","#95a5a6","#f39c12","#2980b9","#8e44ad","#27ae60","#2c3e50","#bdc3c7",
                   "#c0392b","#d35400"],
              used:{}};

function merge(o1,o2) {
    for(var k in o2) {
        if (o2.hasOwnProperty(k)) {
            o1[k]=o2[k];
        }
    }
    return o1;
}

function getId(field) {
    return field.constructor.name == "Integer" ? field.toString() : (field.identity) ? field.identity.toString() : null;
}
function labels(node) {
    return ":"+node.labels.join(":");
}
function name(node) {
    var x = ["^name$","^title$","^label$","value","name$","title$","label$",""];
    var props = node.properties;
    for (var i=0;i<x.length;i++) {
        for (k in props) {
            if (props.hasOwnProperty(k) && k.toLowerCase().match(x[i])) return props[k];
        }
    }
    return node.identity.toString();
}
function addGraphData(digraph, data, field) {
        if (!field) return;
        var type = field.constructor.name;
        var id = getId(field);
// console.log(typeof(field),id,field.constructor.name); // ,field)
        if (type == "Integer") return field.toString();
        if (type == "Node") {
                if (!(id in data.nodes)) {
                var nLabels = labels(field);
                var color = colors.used[nLabels] || colors.all.pop() || ["white","black"];
                if (!(nLabels in colors.used)) {
                    colors.used[nLabels] = color;
                }
                data.nodes[id]=field;
                var n = digraph.addNode(id, {label:nLabels + "|" + name(field)}); // merge({lblString:field.labels},field.properties));
                n.set( "style", "filled" );
                n.set( "shape", "Mrecord" );
                n.set( "fillcolor", color );
                n.set( "fontcolor", "white" );
                n.set("fontname","Helvetica");
                return n;
            }
        }
        if (type == "Relationship") {
            if (!(id in data.rels)) {
                data.rels[id]=field;
//              console.log("addEdge",getId(field.start), getId(field.end))
                var e = digraph.addEdge(getId(field.start), getId(field.end),{label:field.type}); // , merge({type:field["type"]}, field.properties));
                e.set( "color", "#00 00 00 40" );
                e.set("fontname","Helvetica");
                return e;
            }
        }
        if (type == "Path") {
            return field.segments.map(function(segment) {
//              console.log(segment);
                return [addGraphData(digraph,data,segment.start), addGraphData(digraph,data,segment.relationship),addGraphData(digraph,data,segment.end)];
            });

        }
        if (type == "Array") {
            return field.map(function(element) { addGraphData(digraph,data, element); });
        }
        if (type == "Object") {
            return Object.keys(field).map(function(key) { addGraphData(digraph,data, field[key]); });
        }
        return null;
}
function addRecord(digraph, data, record) {
    record._fields.forEach(function(field) {
        addGraphData(digraph,data,field)
    });
}
*/

function objectFromStdin() {
  data = require('fs').readFileSync(0, 'utf-8')
  return JSON.parse(data)
}

function main(args) {
  if (args.length === 0 || args[0].length === 0 || args[0][0] === '?' || args[0] === 'help' || args[0][0] === '-' || isTTY) {
      console.error(doc)
      return
  }
  let cmd = args[0].toLowerCase()
  if (cmd === 'json') {
    let obj = objectFromStdin()
    gvFromJson(obj, stdout)
  } else if (cmd === 'neo4j') {
    let obj = objectFromStdin()
    gvFromNeo4jJson(obj, stdout)
  } else {
      console.error(`unknown command ${args[0]}\n${doc}`)
  }
}

if (require.main === module) {  // Run via CLI, not require() or import {}
    main(process.argv.slice(2));
}

/*
 ./json2gv.js json <<<'{"foo":1}'
 ./json2gv.js json <<<'{"foo":"test{}", "bar": {"foo": 1, "blech": {}}, "b": {"name": "This is b"}, "c": ["a1","a2","a3"] }'
 ./json2gv.js neo4j <out-neo4j-profile-06.json | pbcopy
 for f in 01 02 03 04 05 06 ; do (./json2gv.js neo4j <out-neo4j-profile-$f.json >gv-neo4j-profile-$f.gv) ; done

node --inspect-brk ./json2gv.js neo4j <out-neo4j-profile-06.json |pbcopy
*/
