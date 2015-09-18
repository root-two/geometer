/**
@TODO
performance test
add geotrie search
support secondary indexes, possibily with automatic switchover
migration tools
**/

'use strict';

exports.__esModule = true;
exports.createGeometer = createGeometer;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _through = require('through');

var _through2 = _interopRequireDefault(_through);

var _shutup = require('shutup');

var _shutup2 = _interopRequireDefault(_shutup);

var _eventStream = require('event-stream');

var _eventStream2 = _interopRequireDefault(_eventStream);

var _hash = require('./hash');

function createGeometer(db, options) {
  return new geometer(db, options);
}

function geometer(db, options) {
  _invariant2['default'](Number.isInteger(options.precision), 'options.precision must be an integer');

  this._precision = options.precision;

  this._normalizeTuple = options.geo ? geoNormalize : function (tuple) {
    return tuple;
  };
  this._denormalizeTuple = options.geo ? geoDenormalize : function (tuple) {
    return tuple;
  };

  db.get('config', function (err, config) {
    _invariant2['default'](err && err.notFound || config.precision === options.precision, 'Cannot change precisions without first migrating');
    _invariant2['default'](err && err.notFound || config.geo === options.geo, 'Cannot change geo without first migrating');
    db.put('config', {
      precision: options.precision,
      geo: options.geo
    }, function (err) {});
  });

  this.db = db;
}

geometer.prototype.addPoint = function (ref, tuple, z, data, cb) {
  data = data || ' ';
  var pointKey = createPointKey(ref, this._normalizeTuple(tuple), z, this._precision);
  var refKey = createRefKey(ref);

  this.db.put(refKey, pointKey, function () {
    //@TODO handle error ?
  });
  this.db.put(pointKey, data, function () {
    cb();
  });
};

geometer.prototype.removePointByRef = function (ref, cb) {
  this.db.del(createRefKey(ref), cb);
};

geometer.prototype.getPointByRef = function (ref, cb) {
  var _this = this;

  this.db.get(createRefKey(ref), function (err, pointKey) {
    if (err) {
      cb(err);return;
    }
    _this.db.get(pointKey, function (err, data) {
      cb(err, _this.kvToPoint(pointKey, data, _this._denormalizeTuple));
    });
  });
};

geometer.prototype.kvToPoint = function (key, value, denormalizeTuple) {
  var keyParts = key.split('~');
  return {
    tuple: denormalizeTuple(_hash.decode(keyParts[1])),
    z: keyParts[2],
    ref: keyParts[3],
    data: value
  };
};

//@TODO implement trie search
geometer.prototype.createSearchStream = function (pos, options) {
  var self = this;
  if (!options) options = {};

  var centerHash = _hash.encode(this._normalizeTuple(pos), this._precision);

  var db = this.db;
  var found = [];
  var outer = _shutup2['default'](_through2['default']());

  var hardLimit = options.hardResultLimit || Infinity;
  var softLimit = options.softResultLimit || Infinity;
  var maxRing = options.maxRing || 3;
  var initialRing = options.initialRing || 1;

  function read(innermostRing, outermostRing) {
    var streams = [];
    var innerEndCount = 0;

    var hashes = self.getRingHashes(pos, innermostRing, outermostRing);

    //stream each hash into the outer stream
    hashes.forEach(function (hash) {
      var key = hashToPartialPointKey(hash);
      var _opts = { gte: key, lte: key + '~~' };
      var dbStream = db.createReadStream(_opts);
      streams.push(dbStream);
      var inner = _through2['default'](write, end);

      function write(data) {
        found.push(data);
        inner.queue(data);
        if (found.length === hardLimit) {
          end();
        }
      }

      function end() {
        innerEndCount++;

        //if we have hit hard limit, destroy active streams and return
        if (found.length >= hardLimit) {
          streams.forEach(function (stream) {
            stream.destroy();
          });
          outer.end();
          return;
        }

        //otherwise do nothing until all resolution peer streams have finished
        if (innerEndCount === hashes.length) {
          if (outermostRing === maxRing || found.length >= softLimit) {
            outer.end();
          } else {
            read(outermostRing + 1, outermostRing + 1);
          }
        }
      }
      dbStream.pipe(inner).pipe(outer, { end: false });
      outer.on('end', dbStream.destroy.bind(dbStream));
    });
  }

  process.nextTick(function () {
    read(0, initialRing);
  });

  return outer;
};

geometer.prototype.getRingHashes = function (tuple, innermostRing, outermostRing) {
  var hashes = [];

  var aPrecision = Math.ceil(this._precision / 2);
  var bPrecision = Math.floor(this._precision / 2);
  var aUnit = 200 / Math.pow(2, aPrecision);
  var bUnit = 200 / Math.pow(2, bPrecision);

  for (var ring = innermostRing; ring <= outermostRing; ring++) {
    if (ring === 0) {
      hashes.push(_hash.encode(tuple, this._precision)); //@TODO fix
    }
    for (var j = 0; j < ring * 2; j++) {
      //start at four corners and travel across each direction (NESW)
      var tupleNE = [tuple[0] + aUnit * ring, tuple[1] + bUnit * (ring - j)];
      var tupleSE = [tuple[0] + aUnit * (ring - j), tuple[1] - bUnit * ring];
      var tupleSW = [tuple[0] - aUnit * ring, tuple[1] - bUnit * (ring - j)];
      var tupleNW = [tuple[0] - aUnit * (ring - j), tuple[1] + bUnit * ring];
      //@TODO there should be a deterministic way to do this without recalculating hashes?
      hashes = hashes.concat([_hash.encode(tupleNE, this._precision), _hash.encode(tupleSE, this._precision), _hash.encode(tupleSW, this._precision), _hash.encode(tupleNW, this._precision)]);
    }
  }
  return hashes;
};

geometer.prototype.stream = function (tuple, opts) {
  var normalTuple = this._normalizeTuple(tuple);
  var kvToPoint = this.kvToPoint;
  var denormalizeTuple = this._denormalizeTuple;
  var kvToPointStream = _through2['default'](function (_ref) {
    var key = _ref.key;
    var value = _ref.value;

    this.queue(kvToPoint(key, value, denormalizeTuple));
  });
  var resultStream = this.createSearchStream(normalTuple, opts).pipe(kvToPointStream);

  resultStream.toArray = function (cb) {
    resultStream.pipe(_eventStream2['default'].writeArray(function (err, results) {
      //@TODO sorting
      // var sorted = results.sort(function(a, b){
      //   if(a.distance < b.distance) return -1
      //   if(a.distance > b.distance) return 1
      //   return 0
      // })
      cb(null, results);
    }));
  };

  return resultStream;
};

function createPointKey(ref, normalAbTuple, z, precision) {
  return ['p', _hash.encode(normalAbTuple, precision), z, ref].join('~');
}

function hashToPartialPointKey(hash) {
  return ['p', hash].join('~');
}

function createRefKey(ref) {
  return ['r', ref].join('~');
}

function geoNormalize(tuple) {
  return [100 * tuple[0] / 90, 100 * tuple[1] / 180];
}

function geoDenormalize(tuple) {
  return [90 * tuple[0] / 100, 180 * tuple[1] / 100];
}