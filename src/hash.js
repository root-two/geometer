import sortableHash from 'binary-sortable-hash'
var radix64 = require('radix-64')()

export default {
  encode: (tuple, precision) => {
    let hash = sortableHash.encode(tuple, { precision })
    let length = Math.ceil(precision/6)
    //@TODO support generic radix, need to implement left padding
    let r64Hash = radix64.encodeInt(parseInt(hash, 2), length)
    return r64Hash
    // return parseInt(hash, 2).toString(32)
  },
  decode: (stringHash) => {
    let hash = radix64.decodeToInt(stringHash).toString(2)
    // let hash = parseInt(stringHash, 32).toString(2)
    let tuple = sortableHash.decode(hash, 2)
    return tuple
  }
}
