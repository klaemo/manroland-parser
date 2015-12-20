/* global describe, it */
'use strict'

const assert = require('assert')
const createReadStream = require('fs').createReadStream
const importer = require('..')
const dictionary = require('../import-dictionary.json')

const getMachineName = importer.getMachineName
const normalizeMeta = importer.normalizeMeta
const normalizeDataRow = importer.normalizeDataRow
const normalizeSecondaryColorRow = importer.normalizeSecondaryColorRow
const mapToHeaders = importer.mapToHeaders
const skip = importer.skip
const isSecondaryColorRow = importer.isSecondaryColorRow
const isHeaderRow = importer.isHeaderRow

const getColor = (color, values) => values.filter((row) => row.color === color)

describe('manroland-parser', function () {
  describe('getMachineName()', function () {
    it('should parse machine name', function () {
      assert.equal(getMachineName('fooR508bar.csv'), 'R508')
      assert.equal(getMachineName('r20-R508-r301-bar.csv'), 'R508')
      assert.equal(getMachineName('foo-bar.csv'), '')
    })
  })

  describe('normalizeMeta()', function () {
    const input = { Foo: 'bar', baz: true }
    const dict = { foo: { manroland: 'Foo' } }

    it('should normalize metadata', function () {
      const output = normalizeMeta(input, dict)
      assert.notEqual(input, output, 'should be immutable')
      assert.deepEqual(input, { Foo: 'bar', baz: true }, 'input should stay the same')
      assert.deepEqual(output, { foo: 'bar' }, 'should only have fields from dictionary')
    })

    it('should throw on missing or wrong params', function () {
      assert.throws(() => normalizeMeta(), Error)
      assert.throws(() => normalizeMeta(''), Error)
      assert.throws(() => normalizeMeta({}), Error)
      assert.throws(() => normalizeMeta({}, true), Error)
      assert.throws(() => normalizeMeta({}, ''), Error)
      assert.throws(() => normalizeMeta({}, '', true), Error)
    })

    it('should normalize paper type', function () {
      const dict = { paperType: { manroland: 'paperType' } }
      const output = normalizeMeta({ paperType: '4 (bar)' }, dict)
      assert.strictEqual(output.paperType, '4')
    })

    it('should normalize sheet', function () {
      const dict = { sheet: { manroland: 'sheet' } }
      const output = normalizeMeta({ sheet: '1 - ' }, dict)
      assert.strictEqual(output.sheet, '1')
    })
  })

  describe('skip()', function () {
    it('should specify which rows to skip', function () {
      assert.throws(() => skip(), Error)
      assert.strictEqual(skip(['foo', 'bar']), false)
      assert.strictEqual(skip(['Raster-Percent :', 'bar']), true, 'should skip raster row')
      assert.strictEqual(skip(['foo', 'GB']), true, 'should skip GB row')
    })
  })

  describe('isSecondaryColorRow()', function () {
    it('should recognize secondary color row', function () {
      assert.throws(() => isSecondaryColorRow(), Error)
      assert.strictEqual(isSecondaryColorRow([ 42, 'T' ]), true)
      assert.strictEqual(isSecondaryColorRow([ 42, 't' ]), false)
    })
  })

  describe('isHeaderRow()', function () {
    it('should determin header row', function () {
      assert.throws(() => isHeaderRow(), Error)
      assert.strictEqual(isHeaderRow(['Measuring No', 'foo']), false)
      assert.strictEqual(isHeaderRow(['Protocolled Measuring No', 'foo']), true)
    })
  })

  describe('mapToHeaders()', function () {
    it('should map fields in a row to corresponding header', function () {
      assert.throws(() => mapToHeaders(), Error)
      const row = [1, 2]
      const headers = ['foo', 'bar']
      assert.deepEqual(mapToHeaders(row, headers), { foo: 1, bar: 2 })
      assert.deepEqual(row, [1, 2], 'row should be unchanged')
      assert.deepEqual(headers, ['foo', 'bar'], 'headers should be unchanged')
    })
  })

  describe('normalizeDataRow()', function () {
    it('should normalize data row', function () {
      const row = {
        ColorName: 'BLK', 'Measuring Unit': '1', 'Foo': 'Bar', baz: true
      }
      const dict = {
        color: { manroland: 'ColorName' },
        measuringUnit: { manroland: 'Measuring Unit' },
        foo: { manroland: 'Foo' }
      }
      const res = normalizeDataRow(row, dict)
      assert.strictEqual(res.color, 'blk', 'should lowercase color')
      assert.strictEqual(res.measuringUnit, 1, 'should try to convert numbers')
      assert.strictEqual(res.foo, 'Bar', 'should not touch other fields')
      assert.deepEqual(res, { color: 'blk', measuringUnit: 1, foo: 'Bar' }, 'should only output fields from dictionary')
    })
  })

  describe('normalizeSecondaryColorRow()', function () {
    it('should normalize secondary color row', function () {
      const row = {
        'L-Value T(C+M) - Solid Tone': 1, 'a-Value T(C+M) - Solid Tone': '1.5', 'b-Value T(C+M) - Solid Tone': '1.7',
        'L-Value T(M+Y) - Solid Tone': 2, 'a-Value T(M+Y) - Solid Tone': 2, 'b-Value T(M+Y) - Solid Tone': 2,
        'L-Value T(C+Y) - Solid Tone': 3
      }
      const parsed = normalizeSecondaryColorRow(row, dictionary.secondary)
      assert(Array.isArray(parsed))
      assert.strictEqual(parsed.length, 2, 'should only parse complete rows')
      assert.strictEqual(parsed[0].color, 'cm')
      assert.strictEqual(parsed[0].colorName, 'CM')
      assert.strictEqual(parsed[0].act_L, 1)
      assert.strictEqual(parsed[0].act_a, 1.5)
      assert.strictEqual(parsed[0].act_b, 1.7)
    })
  })

  describe('integration', function () {
    this.slow(200)

    it('should import', function (done) {
      const file = createReadStream(__dirname + '/fixtures/R508_15-12-10_15-1923(Nass)__4_- Blätter T2(R505).csv')

      importer(file, (err, res) => {
        if (err) return done(err)

        assert(res.meta, 'should have meta object')
        assert.equal(Object.keys(res.meta).length, 23, 'should have all supported metadata fields')
        assert.equal(res.meta.maker, 'manroland', 'should have maker name')
        assert.equal(res.meta.machine, 'R508', 'should have machine name')
        assert.strictEqual(res.meta.paperType, '4')
        assert.strictEqual(res.meta.sheet, '1')
        assert(Array.isArray(res.values), 'should have values array')

        assert.strictEqual(getColor('cyn', res.values).length, 240)
        assert.strictEqual(getColor('mgt', res.values).length, 240)
        assert.strictEqual(getColor('ylo', res.values).length, 240)
        assert.strictEqual(getColor('blk', res.values).length, 240)
        assert.strictEqual(getColor('paperwhite', res.values).length, 10)

        assert.strictEqual(getColor('cm', res.values).length, 20)
        assert.strictEqual(getColor('cy', res.values).length, 20)
        assert.strictEqual(getColor('my', res.values).length, 20)

        assert.equal(res.values.length, 1030, 'should have all values rows')
        assert.notEqual(res.values[0].measuringNo, 'Raster-Percent :', 'should skip raster row')
        done()
      })
    })
  })
})
