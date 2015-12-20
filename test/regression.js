/*global describe, it */

const assert = require('assert')
const createReadStream = require('fs').createReadStream
const importer = require('..')

const isPrimaryColor = (row) => {
  return ['cyn', 'mgt', 'ylo', 'blk'].indexOf(row.color) >= 0
}

describe('manroland-parser regression tests', function () {
  it('should handle handle advanced metadata', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R505_13-11-04_13-1648__4_T Faltblatt(R505).csv`)

    importer(file, function (err, result) {
      if (err) return done(err)
      const meta = result.meta
      assert.equal(meta.screening, 'screening')
      assert.equal(meta.ink, 'ink')
      assert.equal(meta.grammage, '300')
      assert.equal(meta.paperName, 'FSC BVS matt')
      assert.equal(meta.paperID, '30010070bvsm')
      assert.equal(meta.customerID, '5048035')

      done()
    })
  })

  it('should handle handle secondary colors', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_15-12-10_15-1923(Nass)__4_- Blätter T2(R505).csv`)

    importer(file, function (err, res) {
      if (err) return done(err)
      assert.strictEqual(res.values.filter((row) => row.color === 'cm').length, 20, 'should have CM')
      assert.strictEqual(res.values.filter((row) => row.color === 'cy').length, 20, 'should have CY')
      assert.strictEqual(res.values.filter((row) => row.color === 'my').length, 20, 'should have MY')
      done()
    })
  })

  it('should handle handle new Lab Tonval fields', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R505_14-08-18_14-1141__4_T Faltblatt(R505).csv`)

    importer(file, function (err, result) {
      if (err) return done(err)

      assert(Array.isArray(result.values))
      assert.strictEqual(result.values.length, 412)

      const colors = result.values.filter(isPrimaryColor)
      assert.strictEqual(colors.length, 384)

      colors.forEach((row) => {
        [20, 40, 50, 80].forEach(function (val) {
          assert('act_L_' + val in row)
          assert('act_a_' + val in row)
          assert('act_b_' + val in row)
        })
      })

      done()
    })
  })

  it('should handle corrupt files', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_13-02-06_13-0155__4_T Blätter(R505).csv`)

    importer(file, function (err, result) {
      assert(err)
      assert.equal(err.message, 'InvalidInput')
      done()
    })
  })

  it('should detect machine name correctly', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_12-07-19_12-1119__4_- Blätter(R505) nass.csv`)

    importer(file, function (err, result) {
      if (err) return done(err)

      assert.equal(result.meta.printer, 'Gröger')
      assert.equal(result.meta.machine, 'R508')
      done()
    })
  })

  it('should handle 13-0537', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R505_13-04-16_13-0537__4_T Blätter(R505).csv`)

    importer(file, function (err, result) {
      if (err) return done(err)

      assert.equal(result.meta.machine, 'R505')
      assert.equal(result.meta.customer, 'marung+bähr Werbeagentur')

      assert.strictEqual(result.values.filter(isPrimaryColor).length, 1824)

      done()
    })
  })

  it('should handle newer files', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_12-07-19_12-1119__4_- Blätter(R505) nass.csv`)

    importer(file, function (err, result) {
      if (err) return done(err)

      assert.deepEqual(result.meta.jobNo, '12-1119')
      // only test primary colors
      assert.strictEqual(result.values.filter(isPrimaryColor).length, 960)

      done()
    })
  })

  it('should handle old files', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R710DD_12-08-21_22404_1.1 AGCO 4_4_4_4 1 AGCO 4_4_top.csv`)

    importer(file, function (err, result) {
      if (err) return done(err)
      // we have to fake the date
      assert.equal(result.meta.machine, 'R710')

      assert(Array.isArray(result.values))
      assert(result.values.length)

      const filtered = result.values.filter(isPrimaryColor).filter((row) => row.tonVal40)
      assert.strictEqual(filtered.length, 110)
      filtered.forEach((row) => {
        assert(!row.tonVal20)
        assert(row.tonVal40)
        assert(!row.tonVal50)
        assert(row.tonVal80)
      })

      done()
    })
  })

  it('should handle random filenames', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_12-07-19_12-1119__4_- Blätter(R505) nass.csv`)
    file.path = 'foo.csv'

    importer(file, function (err, result) {
      if (err) return done(err)
      assert.equal(result.meta.machine, '')
      assert.equal(result.meta.jobNo, '12-1119')

      done()
    })
  })

  it('should handle random filenames', function (done) {
    const file = createReadStream(`${__dirname}/fixtures/R508_12-07-19_12-1119__4_- Blätter(R505) nass.csv`)
    file.filename = 'foo.csv'

    importer(file, function (err, result) {
      if (err) return done(err)
      assert.equal(result.meta.machine, '')
      assert.equal(result.meta.jobNo, '12-1119')

      done()
    })
  })
})
