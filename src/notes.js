// var geometer = createGeometer({
//   precision: 16,
//   indexRef: true,
// })
//
// geometer.addPoint(ref, hashTuple, cScalar, data)
// geometer.addPoint(ref, [1, 2], 1234, data)
// // -> [geohash]~[sortDimension]~ref = data
// // -> ref = key
//
// geometer.streamNear(tuple)
// geometer.streamIn(pos, radius)
// geometer.stream({
//   tuple: tuple,
//   maxSearchRing: 3, //as a mutiplier of the base hash width
//   hardResultsLimit: 50,
//   softResultsLimit: 25,
//   resolution: 16,
// })
//
// ```
// Smart Apps request minimum new information. For example if pos moves 3 blocks,
// but current proximity is defined as 10 block radius, calculate new missing blocks
// and request those explicitly (without auto expand)
//
// max proximity = 1000M
// store read message index, use to prioritize message in second proximity visit
// possibly minimize / shrink already viewed messages, but preserve natural order?
//
// If within 50M of established centroid, only request messages newer than that centroid's sync date
// ```
// x x x x x x x
// x x x x x x x
// x x x x x x x
// x x x x x x x
// x x x x x x x
// x x x x x x x
// x x x x x x x
//
// 0 1
// 1 3
// 2 5
// 3 7
//
// hash current pos
// generate hash map on client
// keep hash map with last query
//
// [0,0]
// [1,1]
// [1,0][1,-1]
// [0, -1][-1, -1]
// [0, -1][1, -1]
// [1,0][1,1]
//
// geometer.resolutionStream(tuple) //stream by resolution (ignore cScalar, use trie structure)
//
// geotrie.removePointByRef(ref)
//
// 1 8 16
//
// // geohash
// // search stream
