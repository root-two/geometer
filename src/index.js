/**
@TODO
performance test
add geotrie search
support secondary indexes, possibily with automatic switchover
migration tools
**/

import invariant from 'invariant'
import through from 'through'
import shutup from 'shutup'
import es from 'event-stream'
import {encode, decode} from './hash'

export function createGeometer(db, options){
  return new geometer(db, options)
}

function geometer(db, options){
  invariant(Number.isInteger(options.precision), 'options.precision must be an integer')

  this._precision = options.precision

  this._normalizeTuple = options.geo ? geoNormalize : (tuple) => tuple
  this._denormalizeTuple = options.geo ? geoDenormalize : (tuple) => tuple

  db.get('config', (err, config) => {
    invariant( (err && err.notFound) || config.precision === options.precision, 'Cannot change precisions without first migrating')
    invariant( (err && err.notFound) || config.geo === options.geo, 'Cannot change geo without first migrating')
    db.put('config', {
      precision: options.precision,
      geo: options.geo,
    }, (err) => { })
  })

  this.db = db
}

geometer.prototype.addPoint = function(ref, tuple, z, data, cb){
  data = data || ' '
  let pointKey = createPointKey(ref, this._normalizeTuple(tuple), z, this._precision)
  let refKey = createRefKey(ref)

  this.db.put(refKey, pointKey, () => {
    //@TODO handle error ?
  })
  this.db.put(pointKey, data, () => {
    cb()
  })
}

geometer.prototype.removePointByRef = function(ref, cb){
  this.db.del(createRefKey(ref), cb)
}

geometer.prototype.getPointByRef = function(ref, cb){
  this.db.get(createRefKey(ref), (err, pointKey) => {
    if(err){ cb(err); return; }
    this.db.get(pointKey, (err, data) => {
      cb(err, this.kvToPoint(pointKey, data, this._denormalizeTuple))
    })
  })
}

geometer.prototype.kvToPoint = function(key, value, denormalizeTuple){
  let keyParts = key.split('~')
  return {
    tuple: denormalizeTuple(decode(keyParts[1])),
    z: keyParts[2],
    ref: keyParts[3],
    data: value,
  }
}

//@TODO implement trie search
geometer.prototype.createSearchStream = function (pos, options) {
  var self = this
  if (!options) options = {}

  var centerHash = encode(this._normalizeTuple(pos), this._precision)

  var db = this.db
  var found = []
  var outer = shutup(through())

  var hardLimit = options.hardResultLimit || Infinity
  var softLimit = options.softResultLimit || Infinity
  var maxRing = options.maxRing || 3
  var initialRing = options.initialRing || 1

  function read (innermostRing, outermostRing) {
    var streams = []
    var innerEndCount = 0

    var hashes = self.getRingHashes(pos, innermostRing, outermostRing)

    //stream each hash into the outer stream
    hashes.forEach(function(hash){
      var key = hashToPartialPointKey(hash)
      var _opts = { gte: key, lte: key+'~~'}
      var dbStream = db.createReadStream(_opts)
      streams.push(dbStream)
      var inner = through(write, end)

      function write (data) {
        found.push(data)
        inner.queue(data)
        if (found.length === hardLimit){
          end()
        }
      }

      function end () {
        innerEndCount++

        //if we have hit hard limit, destroy active streams and return
        if(found.length >= hardLimit){
          streams.forEach(function(stream){ stream.destroy() })
          outer.end()
          return
        }

        //otherwise do nothing until all resolution peer streams have finished
        if(innerEndCount === hashes.length){
          if(outermostRing === maxRing || found.length >= softLimit){
            outer.end()
          }
          else {
            read(outermostRing+1, outermostRing+1)
          }
        }
      }
      dbStream.pipe(inner).pipe(outer, { end: false })
      outer.on('end', dbStream.destroy.bind(dbStream))
    })
  }

  process.nextTick(function () {
    read(0, initialRing)
  })

  return outer
}

geometer.prototype.getRingHashes = function(tuple, innermostRing, outermostRing){
  var hashes = []

  var aPrecision = Math.ceil(this._precision/2)
  var bPrecision = Math.floor(this._precision/2)
  var aUnit = 200/Math.pow(2, aPrecision)
  var bUnit = 200/Math.pow(2, bPrecision)

  for(var ring = innermostRing; ring <= outermostRing; ring++){
    if(ring === 0){
      hashes.push(encode(tuple, this._precision)) //@TODO fix
    }
    for(var j = 0; j < ring*2; j++){
      //start at four corners and travel across each direction (NESW)
      var tupleNE = [tuple[0]+aUnit*ring, tuple[1]+bUnit*(ring - j)]
      var tupleSE = [tuple[0]+aUnit*(ring - j), tuple[1]-bUnit*ring]
      var tupleSW = [tuple[0]-aUnit*ring, tuple[1]-bUnit*(ring - j)]
      var tupleNW = [tuple[0]-aUnit*(ring - j), tuple[1]+bUnit*ring]
      //@TODO there should be a deterministic way to do this without recalculating hashes?
      hashes = hashes.concat([encode(tupleNE, this._precision), encode(tupleSE, this._precision), encode(tupleSW, this._precision), encode(tupleNW, this._precision)])
    }
  }
  return hashes
}

geometer.prototype.stream = function(tuple, opts){
  var normalTuple = this._normalizeTuple(tuple)
  var kvToPoint = this.kvToPoint
  var denormalizeTuple = this._denormalizeTuple
  var kvToPointStream = through(function({key, value}){
    this.queue(kvToPoint(key, value, denormalizeTuple))
  })
  var resultStream = this.createSearchStream(normalTuple, opts).pipe(kvToPointStream)

  resultStream.toArray = function(cb){
    resultStream.pipe(es.writeArray(function(err, results){
      //@TODO sorting
      // var sorted = results.sort(function(a, b){
      //   if(a.distance < b.distance) return -1
      //   if(a.distance > b.distance) return 1
      //   return 0
      // })
      cb(null, results)
    }))
  }

  return resultStream
}

function createPointKey(ref, normalAbTuple, z, precision){
  return ['p', encode(normalAbTuple, precision), z, ref].join('~')
}

function hashToPartialPointKey(hash){
  return ['p', hash].join('~')
}

function createRefKey(ref){
  return ['r', ref].join('~')
}

function geoNormalize(tuple){
  return [100*tuple[0]/90, 100*tuple[1]/180]
}

function geoDenormalize(tuple){
  return [90*tuple[0]/100, 180*tuple[1]/100]
}
