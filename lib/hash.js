'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _binarySortableHash = require('binary-sortable-hash');

var _binarySortableHash2 = _interopRequireDefault(_binarySortableHash);

var radix64 = require('radix-64')();

exports['default'] = {
  encode: function encode(tuple, precision) {
    var hash = _binarySortableHash2['default'].encode(tuple, { precision: precision });
    var length = Math.ceil(precision / 6);
    //@TODO support generic radix, need to implement left padding
    var r64Hash = radix64.encodeInt(parseInt(hash, 2), length);
    return r64Hash;
    // return parseInt(hash, 2).toString(32)
  },
  decode: function decode(stringHash) {
    var hash = radix64.decodeToInt(stringHash).toString(2);
    // let hash = parseInt(stringHash, 32).toString(2)
    var tuple = _binarySortableHash2['default'].decode(hash, 2);
    return tuple;
  }
};
module.exports = exports['default'];