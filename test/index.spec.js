import {createGeometer} from '../src/index'
import levelup from 'levelup'
import assert from 'assert'
import rimraf from 'rimraf'

rimraf.sync('./tmpdb')

var db = levelup('./test/tmpdb', {valueEncoding: 'json' })
var geometer = createGeometer(db, {geo: 'true', precision: 41})

describe('points', function() {
  it('Add and retrieve point', function(done) {
    let ref = 'myref'
    let refData = 'random data'
    let z = 5
    let tuple = [1, 2]
    geometer.addPoint(ref, tuple, z, refData, () => {
      geometer.getPointByRef(ref, (err, data) => {
        if(err){ throw err }
        assert.equal(data.ref, ref)
        assert.deepEqual(data.tuple, [0.9999704360961914, 2.0000267028808594])
        assert.deepEqual(data.data, refData)
        assert.equal(data.z, z)
        done()
      })
    })
  })
})
