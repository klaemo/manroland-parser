'use strict'

const isNumber = require('is-number')
const pump = require('pump')
const csv = require('csv-streamify')
const iconv = require('iconv-lite')
const freeze = require('deep-freeze-strict')
const assert = require('assert')
const path = require('path')
const memoize = require('lodash.memoize')
const log = require('debug')('manroland-parser')

memoize.Cache = Map
const getKeys = memoize((obj) => Object.keys(obj))

const DICTIONARY = freeze(require('./import-dictionary.json'))

// export our main module
module.exports = parser

// export all of our functions, mainly for unit tests
Object.assign(module.exports, {
  normalizeMeta, normalizeDataRow, normalizeSecondaryColorRow, correctOldTonval,
  getMachineName, skip, isHeaderRow, isSecondaryColorRow, mapToHeaders
})

/**
 * Normalizes the metadata according to a dictionary
 * @private
 * @param  {object} input Input metadata object
 * @param  {string} maker The maker of the machine, needed to look up the keys in the dictionary
 * @param  {object} dict  The dictionary
 * @return {object}       Normalized metadata object
 */
function normalizeMeta (input, dict) {
  assert(typeof input === 'object', `"input" should be an object, but is ${typeof input}`)
  assert(typeof dict === 'object', `"dict" should be an object, but is ${typeof dict}`)

  const output = {}
  getKeys(dict).forEach((key) => output[key] = input[dict[key].manroland])

  // parse and normalize paper type
  if (typeof output.paperType === 'string') {
    output.paperType = output.paperType.match(/\d[F]?/i)[0]
  }

  // parse and normalize sheet number
  if (typeof output.sheet === 'string') {
    output.sheet = output.sheet.replace('-', '').trim()
  }

  log('normalized metadata for %s', output.jobNo)
  return output
}

/**
 * Normalizes a data row according to a dictionary, parses numbers
 * and makes color names lowercase
 * @private
 * @param  {object}   row   Input data object
 * @param  {object}   dict  The dictionary
 * @return {object}         Normalized data object
 */
function normalizeDataRow (row, dict) {
  return getKeys(dict).reduce((obj, key) => {
    const value = row[dict[key].manroland]
    if (isNumber(value)) {
      obj[key] = +value
    } else if (key === 'color') {
      obj[key] = value.toLowerCase()
    } else {
      obj[key] = value
    }
    return obj
  }, Object.create(null))
}

/**
 * Corrects old strips where the mid tone field == 40%
 * @param  {object} row Row
 * @return {object}     Corrected row
 */
function correctOldTonval (row) {
  if (row.tonVal40 !== undefined) return row

  const newRow = Object.assign({}, row, { tonVal40: row.tonVal50 })
  delete newRow.tonVal50
  delete newRow.tonVal20
  if (newRow.tonVal40) log('old tonval row corrected')
  return newRow
}

function tryNumber (value) {
  return isNumber(value) ? +value : value
}

/**
 * Normalizes a secondary color row according to a dictionary, parses numbers
 * and makes color names lowercase.
 * Splits the single row, into multiple secondary color rows.
 * @private
 * @param  {object}   row   Input data object
 * @param  {object}   dict  The dictionary
 * @return {object}         Normalized data object
 */
function normalizeSecondaryColorRow (row, dict) {
  return getKeys(dict).map((color) => {
    const output = {
      colorName: color,
      color: color.toLowerCase(),
      act_L: tryNumber(row[dict[color].act_L.manroland]),
      act_a: tryNumber(row[dict[color].act_a.manroland]),
      act_b: tryNumber(row[dict[color].act_b.manroland])
    }
    return output
  }).filter((row) => row.act_L && row.act_a && row.act_b)
}

/**
 * Copies over useful fields from normalized row
 * @private
 * @param  {object} secondaryColorRow Normalized secondary color row
 * @param  {object} normalizedRow     Normalized row
 * @return {object}                   Finished secondary color row
 */
function enhanceSecondaryColorRow (secondaryColorRow, normalizedRow) {
  return Object.assign({}, secondaryColorRow, {
    pUnitNo: normalizedRow.pUnitNo,
    measuringNo: normalizedRow.measuringNo,
    zoneNo: normalizedRow.zoneNo
  })
}

/**
 * Parses machine name from file name
 * @private
 * @param  {string} filename Filename of raw data
 * @return {string}          Machine name
 */
function getMachineName (filename) {
  if (!filename) return ''
  const match = filename.match(/R\d{3}/gi)
  return match ? match[0] : ''
}

/**
 * Classifies which rows to skip while parsing
 * @private
 * @param  {Array}    row Raw input row
 * @return {Boolean}      Skip status
 */
function skip (row) {
  assert(Array.isArray(row), `row should be an array, but is ${typeof row}`)
  return row[0] === 'Raster-Percent :' || row[1] === 'GB'
}

/**
 * Recognizes secondary color rows
 * @private
 * @param  {Object}  row Mapped input Row
 * @return {Boolean}     Secondary color row status
 */
function isSecondaryColorRow (row) {
  assert(Array.isArray(row), `row should be an array, but is ${typeof row}`)
  return row[1] === 'T'
}

/**
 * Recognizes which row includes the headers
 * @private
 * @param  {Array}   row Current row
 * @return {Boolean}     Status
 */
function isHeaderRow (row) {
  assert(Array.isArray(row), `row should be an array, but is ${typeof row}`)
  return row[0] === 'Protocolled Measuring No'
}

/**
 * Map data fields to corresponding header
 * @private
 * @param  {Array}  row     Current row
 * @param  {Array}  headers Header names
 * @return {object}         Mapped row
 * @private
 */
function mapToHeaders (row, headers) {
  assert(Array.isArray(row), `row should be an array, but is ${typeof row}`)
  assert(Array.isArray(headers), `headers should be an array, but is ${typeof headers}`)
  return row.reduce((obj, value, i) => {
    obj[headers[i]] = value
    return obj
  }, Object.create(null))
}

/**
 * Parses manroland csv files to JSON representation
 * @param  {ReadableStream} file  Readable Stream of a csv file
 * @param  {Function}       cb    Callback function
 */
function parser (file, cb) {
  log(path.basename(file.filename || file.path))

  const maker = 'manroland'
  const machine = getMachineName(file.filename || file.path)
  const meta = {}
  const values = []

  let headers = []
  let isData = false

  function onData (row) {
    if (skip(row)) return

    if (isData) {
      const mapped = mapToHeaders(row, headers)
      const normalized = correctOldTonval(normalizeDataRow(mapped, DICTIONARY.data))
      if (isSecondaryColorRow(row)) {
        normalizeSecondaryColorRow(mapped, DICTIONARY.secondary).forEach((secondaryColorRow) => {
          values.push(enhanceSecondaryColorRow(secondaryColorRow, normalized))
        })
      } else {
        values.push(normalized)
      }
      return
    }

    if (isHeaderRow(row)) {
      log('found headers')
      headers = headers.concat(row)
      isData = true
      return
    }

    if (!isData) {
      meta[row[0]] = row[1]
    }
  }

  const parser = csv({ objectMode: true, empty: null }).on('data', onData)
  pump(file, iconv.decodeStream('binary'), iconv.encodeStream('utf8'), parser, (err) => {
    if (err) return cb(err)

    if (!values.length) return cb(new Error('InvalidInput'))

    const normalizedMetadata = Object.assign({ maker, machine }, normalizeMeta(meta, DICTIONARY.meta))
    log('parsed %s with %s rows', normalizedMetadata.jobNo, values.length)

    cb(null, { meta: normalizedMetadata, values })
  })
}
