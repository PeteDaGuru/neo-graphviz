// Record and Replay requests - to mock databases or APIs with more fidelity
// Keeps files on disk in order by filename - loads all *-key.js ones together into memory
// loads values as-needed (if default useValueFiles=true setting is used)
//
// Files are all javascript (js) so can perform calculations as needed (e.g. substitute timestamps)
// although .json format inside the .js will work fine
//
// Generated files are like `e2e-0001-000001-key.js` and `e2e-00001-00001-value.js`
//   the first number is the ReplayDataEntry representing the key
//   the second number is the ReplayDataParmValue representing the parm/value pair
// Note that generated files start at 1,  so any files that have zeros are not overridden during recording.
// Files can provide ReplayDataParmValue functions for parm and value to match and and return programmatically-generated values
// Also ReplayDataEntry.getValue can be overridden to change logic entirely if desired


// npm install -g @types/node   or npm install --save-dev @types/node  - also have tsconfig.json compilerOptions.target="es6"
// "strictNullChecks": false
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import * as path from 'path'   // es5: import path = require('path')
import { isDeepStrictEqual } from 'util'

function isTrueValue(val:any) {
  return val === true || ('1tTyY+'.includes('n' + val))
}

type ReplayKeyParmValue = {
  filename?:string
  key:string
  parm:any
  value?:any
}

// parm, value, and getValue functions receive this to get a complete set of parameters
type ReplayFunctionParms = {
  replay: ReplayData
  entry: ReplayDataEntry
  keyParmValue: ReplayKeyParmValue
}

// Internal - Holds values for a given parm (allows sequence of values for the same parameter to be stored)
class ReplayDataParmValue {
  public parm:any = {}
  public values:any = []
  public keynum = 0
  public readIndex = 0
  public pushRawValue(val:any) {
    this.values.push(val)
  }
  public nextRawValue() {
    if (this.readIndex >= this.values.length) {
      this.readIndex = 0
    }
    let val = null
    if (this.readIndex < this.values.length) {
      val = this.values[this.readIndex]
      this.readIndex++
    }
    return val
  }
}

// Internal - maintains key -> parm/value correspondence
class ReplayDataEntry {
  filename:string
  key:string
  num:number
  valueCount = 0 // Number of values (across all parms) - for filename generation
  parmValues:ReplayDataParmValue[] = [] // default is to compare all parms via isDeepStrictEqual
  public getValue(args:ReplayFunctionParms):any {  // args = {replay, entry, keyParmValue}
    const valEntry = args.entry.findParmEntryFor(args)
    if (valEntry != null) {
      return args.replay.resolveValue(valEntry.nextRawValue(), args) // rawValue = {func, data, file}
    }
    return null
  }
  public findParmEntryFor(args:ReplayFunctionParms) {
    let val = null
    for (const parmValue of this.parmValues) {
      if (typeof parmValue.parm === 'function') {  // function returns desired rawValue {func, data, file} or null
        if (parmValue.parm(args)) {
          val = parmValue
        }
      } else if (args.replay.isDeepStrictEqual(parmValue.parm, args.keyParmValue.parm)) {
        val = parmValue
      }
    }
    return val
  }
  public nextValueCount() {
    return ++this.valueCount
  }
  public putParmEntry(keyParmValue:ReplayKeyParmValue, replay:ReplayData):ReplayDataParmValue {
    let entry = this.findParmEntryFor({replay: replay, entry: null, keyParmValue: keyParmValue})
    if (entry == null) {
      entry = new ReplayDataParmValue()
      entry.keynum  = this.num
      entry.parm = keyParmValue.parm
      this.parmValues.push(entry)
    }
    // let caller wrap or unwrap data and perform: pushRaw(keyParmValue)
    return entry
  }
}

// Top-level class for playback/recording of data
export class ReplayData {
  static singleton:ReplayData = null
  static one(parms:any) {
    if (ReplayData.singleton == null) {
      ReplayData.singleton = new ReplayData().init(parms)
    }
    return ReplayData.singleton
  }

  keyParmData:{[key:string]:ReplayDataEntry} = {}
  parms:any = {}
  keyCount = 0
  keyFileCount = 0

  public init(parms={}) {
    this.parms = {...{
      dir: process.env.REPLAY_DIR || 'replay',
      prefix: process.env.REPLAY_PREFIX || 'e2e',
      keySuffix: process.env.REPLAY_KEYSUFFIX || '-key',
      valSuffix: process.env.REPLAY_VALSUFFIX || '-val',
      useValueFiles: true,   // false to embed values in key files
      writeFilesLive: true,  // false to only keep in memory
      writeKeyPad: '00000',
      writeValuePad: '000000'
    },
    ...parms
    }
    this.keyParmData = {}
    // Let user load when ready: this.loadKeyParmValueData()
    return this
  }

  public isDeepStrictEqual(arg1:any, arg2:any) {
    return isDeepStrictEqual(arg1, arg2)
  }

  public nextKeyCount() {
    return ++this.keyCount
  }

  public dataFromString(str:string) {
    return eval('const v = ' + str + ' ; v')
  }

  public stringFromFile(fullPathSpec:any) {
    return readFileSync(fullPathSpec, {encoding:'utf8', flag:'r'})
  }

  public dataFromFile(fullPathSpec:any) {
    const str = this.stringFromFile(fullPathSpec)
    if (str !=  null) {
      return this.dataFromString(str)
    }
    return null
  }

  public stringFromData(obj:any, ndeep=0):string {  // set ndeep to -1 to avoid any indentation, null or undefined results in default 2 space
    if (obj == null) { return String(obj)} // null and undefined
    const me = this
    switch(typeof obj) {
      case "string": return "'"+obj.replace("'","\'")+"'";
      case "function": return obj.toString(); // obj.name || obj.toString()
      case "object":
        ndeep = ndeep||1
        let indent = ''
        let newline = ''
        if (ndeep > 0) {
          indent = Array(ndeep).join('  ')
          newline = '\n'
          ndeep++
        }
        const isArray = Array.isArray(obj)
        return '{['[+isArray] + Object.keys(obj).map(function(key){
             return newline + indent + key + ': ' + me.stringFromData(obj[key], ndeep);
           }).join(',') + newline + indent + '}]'[+isArray];
      default: return obj.toString();
    }
  }

  public writeDataToFile(filespec:any, data:any) {
    const str = this.stringFromData(data)
    writeFileSync(filespec, str)
  }

  public loadFilename(fn:string) {
    return this.dataFromFile(path.join(this.parms.dir, fn))
  }

  public saveFilename(fn:string, data:any) {
    return this.writeDataToFile(path.join(this.parms.dir,fn), data)
  }

  public putEntry(keyParmValue:ReplayKeyParmValue) { // Raw method .. value not set
    const key = keyParmValue.key
    const parm = keyParmValue.parm
    const value = keyParmValue.value
    const filename = keyParmValue.filename
    let entry = this.keyParmData[key]
    if (entry == null) {
      entry = new ReplayDataEntry()
      this.keyParmData[key] = entry
      entry.key = key
      entry.num = this.nextKeyCount()
      if (filename != null) {
        entry.filename = filename
      }
    }
    return {entry: entry, parmValueEntry: entry.putParmEntry(keyParmValue, this)}
  }

  public getEntry(keyParm:ReplayKeyParmValue) {
    return this.keyParmData[keyParm.key]
  }

  // Add entry
  public loadEntry(keyParmValue:ReplayKeyParmValue, fn:any=null) {  // Answer string error message or null if incorrect data,or throw exception
    if (keyParmValue == null || typeof keyParmValue !== 'object') {
      return `incorrect data ${keyParmValue}`
    }
    if (fn != null) keyParmValue.filename = fn
    const key = keyParmValue.key
    const parm = keyParmValue.parm
    const value = keyParmValue.value
    let error = ''
    if (key == null) error = `${error} missing key`
    if (typeof key !== 'string') {
      error = `${error} key not a string`
    }
    if (parm == null) error = `${error} missing parm`
    if (value == null) error = `${error} missing value`
    if (error.length > 0) {
      return `incorrect data${error}`
    }
    const { entry, parmValueEntry } = this.putEntry(keyParmValue)
    parmValueEntry.pushRawValue(keyParmValue.value)
    return entry
  }

  // Load keyParm data from files to ready for playback
  public loadKeyParmValueData() {
    const p = this.parms
    const files = readdirSync(p.dir).sort()
    for (const fn of files) {
      if (fn.startsWith(p.prefix) && fn.endsWith(`${p.keySuffix}.js`)) {
        try {
          const keyParmEntry = this.loadEntry(this.loadFilename(fn), fn)
          if (keyParmEntry == null || typeof keyParmEntry !== 'object') {
            console.error(`error invalid ${fn} ${keyParmEntry}`)
          } else {
            this.keyFileCount++
            keyParmEntry.nextValueCount()
          }
        } catch (ex) {
          console.error(`error reading ${fn}: ${ex}`)
        }
      }
    }
    return this
  }

  // rawValue has one of func, data, file
  public resolveValue(value:any, args:ReplayFunctionParms) {
    if (value != null && typeof value === 'object') {
      let val = value.func
      if (typeof val === 'function') {
        return val(args)
      }
      val = value.data
      if (val != null) return val
      val = value.file
      if (typeof val === 'string' && this.parms.useValueFiles) {
        try {
          val = this.loadFilename(val)
        } catch (ex) {
          console.error(`error reading ${val} for ${args?.keyParmValue}: ${ex}`)
        }
        if (val != null) return val
      }
    }
    return value
  }

  // API: load values from directory to get ready for playback
  public load() {
    return this.loadKeyParmValueData()
  }

  // Playback value (lookup key/parm from memory, load value from file)
  public playbackValueFor(keyParm:ReplayKeyParmValue) {
    const entry = this.getEntry(keyParm)
    if (entry != null) {
      return entry.getValue({replay: this, entry: entry, keyParmValue: keyParm})
    }
    return null
  }

  // Write files for values
  public record(keyParmValue:ReplayKeyParmValue) {
    const { entry, parmValueEntry } = this.putEntry(keyParmValue)
    const p = this.parms
    if (isTrueValue(p.writeFilesLive)) {
      const parmValueNum = entry.nextValueCount()
      const baseName = `${p.prefix}-${(p.writeKeyPad + entry.num).slice(0 - p.writeKeyPad.length)}-${(p.writeValuePad + parmValueNum).slice(0 - p.writeValuePad.length)}`
      const keyName = `${baseName}${p.keySuffix}.js`
      let valName = null
      let writeKeyParmValue = {...keyParmValue}
      writeKeyParmValue.filename = keyName
      if (isTrueValue(p.useValueFiles)) {
        valName = `${baseName}${p.valSuffix}.js`
        writeKeyParmValue.value = {file: valName}
      } else {
        writeKeyParmValue.value = {data: keyParmValue.value}
      }
      parmValueEntry.pushRawValue(writeKeyParmValue.value)
      this.saveFilename(keyName, writeKeyParmValue)
      this.keyFileCount++
      if (valName != null) {
        this.saveFilename(valName, keyParmValue.value)
      }
    } else {
      parmValueEntry.pushRawValue(keyParmValue.value)
    }
  }

}
