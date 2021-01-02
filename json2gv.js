#!/usr/bin/env node
const doc = `json2gv.js: build graphviz dot diagrams from JSON received via stdin
 json - handle json generically
 neo4j - process neo4j result from cipher query (which may include summary, plan, or profile of EXPLAIN or PROFILE used)
`
// Start with main() function at end

var isTTY = process.stdin.isTTY;
var stdout = process.stdout;


/*
// if field was inlined (id == 0) then print summary, else just the name and a link to the actual
		if fieldID == 0 {
			fields += fmt.Sprintf("|{<f%d> %s | %s} ", index, uType.Field(index).Name, summary)
		} else {
			fields += fmt.Sprintf("|<f%d> %s", index, uType.Field(index).Name)
			links = append(links, fmt.Sprintf("  %d:f%d -> %d:name;\n", id, index, fieldID))
		}
	}

	node := fmt.Sprintf("  %d [label=\"<name> %s %s \"];\n", id, structVal.Type().Name(), fields)
*/
/*  good docs on graphviz usage for datastructures via cpan - GraphViz::Data::Structure - alternative to GraphViz::Data::Grapher (perl): https://metacpan.org/pod/GraphViz::Data::Structure

# Object is an hash blessed into class "Foo".
   # Hash assumed to contain (A=>1,B=>\$x,C=>"s").
   # Horizontal, name on top:
   $hports =
   "{<port0>Foo|{{<port1>A|<port2>1}|{<port3>B|<port4>}|{<port5>C|<port6>s}}}";
   # Vertical, name on left:
   $vports =
   "<port0>Foo|{<port1>A|<port3>B|<port5>C}|{<port2>1|<port4>|<port6>s}";

   # Hash assumed to contain (A=>1,B=>\$x,C=>"s").
      # Horizontal:
      $hports = "{<port1>A|<port2>1}|{<port3>B|<port4>}|{<port5>C|<port6>s}";
      # Vertical:
      $vports = "{<port1>A|<port3>B|<port5>C}|{<port2>1|<port4>|<port6>s}";
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
      graphDefaults: 'graph [rankdir="LR", label="gv-sample-00.gv", fontname="helvetica"]', // dpi=100
      nodeDefaults: 'node [fontsize="16", fontname="helvetica", shape="Mrecord"]', // labeltooltip="node"
      edgeDefaults: 'edge [fontname="helvetica"]', // , labeltooltip="edge"
      newLine: '\n',
     },
     ...overrideParms
    },
    addNode: (node, id) => {
      if (id == null) id = `${me.parms.nodeIdPrefix}${me.nodeNum++}`
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
      let str = `${val}`.replace(/([{}"|<>])/g, '\\$1')
      if (str.length > me.parms.maxStringLen) {
        str = `${str.substring(0,me.parms.maxStringLen-3)}...`
      }
      return str
    },
  }
  return me
}

function traverseArray(idMaps, inObj, out, inObjName) {
  let nodeId = idMaps.idForNode(inObj)
  if (nodeId != null) return nodeId // Already been here
  nodeId = idMaps.addNode(inObj)
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
  for (const [name, val] of entries) {
    let port = null
    if (typeof val === 'object' && val != null) { // includes Array
      port = `${idMaps.parms.portIdPrefix}${idx}`
      labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
    } else {
      labels.push(`{${idMaps.safeForLabel(name)}|${idMaps.safeForLabel(val)}}`)
    }
    ports.push(port)
    idx++
  }
  out.write(`${nodeId} [label="{${inObjName}|{${labels.join('|')}}}"]${idMaps.parms.newLine}`)
  idx = 0
  for (const [name, val] of entries) {
    if (typeof val === 'object' && val != null) { // includes Array
      const id = traverseObj(idMaps, val, out, `${inObjName}[${name}]`)
      let port = ports[idx]
      if (port == null) {
        port = ''
      } else {
        port = `:${port}`
      }
      edges.push(`${nodeId}${port} -> ${id} [label="${inObjName}[${idMaps.safeForLabel(name)}]"]`)
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
  nodeId = idMaps.addNode(inObj)
  let edgeNamePrefix = ''
  if (inObjName != null) {
    edgeNamePrefix = `${inObjName}.`
  }
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
      port = `${idMaps.parms.portIdPrefix}${idx}`
      labels.push(`{<${idMaps.safeForLabel(port)}>${idMaps.safeForLabel(name)}}`)
    } else {
      labels.push(`{${idMaps.safeForLabel(name)}|${idMaps.safeForLabel(val)}}`)
    }
    ports.push(port)
    idx++
  }
  out.write(`${nodeId} [label="${labels.join('|')}"]${idMaps.parms.newLine}`)
  idx = 0
  for (const [name, val] of entries) {
    if (typeof val === 'object' && val != null) { // includes Array
      const id = traverseObj(idMaps, val, out, name)
      let port = ports[idx]
      if (port == null) {
        port = ''
      } else {
        port = `:${port}`
      }
      edges.push(`${nodeId}${port} -> ${id} [label="${idMaps.safeForLabel(edgeNamePrefix + name)}"]`)
    }
    idx++
  }
  for (const e of edges) {
    out.write(`${e}${idMaps.parms.newLine}`)
  }
  return nodeId
}

// Main method for traversing an object tree - answer nodeId
function traverseObj(idMaps, inObj, out, inObjName) {
  let nodeId = null
  if (Array.isArray(inObj)) {
    nodeId = traverseArray(idMaps, inObj, out, inObjName)
  } else if (typeof inObj === 'object' && inObj != null) {
    nodeId = traverseStruct(idMaps, inObj, out, inObjName)
  } else { // Shouldn't really get here for primitives
    const prim = {type: typeof inObj, value: `${inObj}`}
    nodeId = idMaps.addNode(prim)
    out.write(`${nodeId} [shape="ellipse" label="${prim.value}"]`)
  }
  return nodeId
}


function gvFromJson(idMaps, inObj, out) {
  idMaps.writeHeader(out)
  traverseObj(idMaps, inObj, out)
  idMaps.writeTrailer(out)
}

// Eventually handle {low,high} numbers, heuristics for children, labels, PROFILE and EXPLAIN output
function gvFromNeo4jJson(idMaps, inObj, out) {
  idMaps.writeHeader(out)
  traverseObj(idMaps, inObj, out)
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
    gvFromJson(GraphMap(), obj, stdout)
  } else if (cmd === 'neo4j') {
    let obj = objectFromStdin()
    gvFromNeo4jJson(GraphMap(), obj, stdout)
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
*/
