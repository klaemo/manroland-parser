#!/usr/bin/env node

const parser = require('.')
const arg = process.argv[2]

if (!process.stdin.isTTY || arg === '-') {
  parser(process.stdin, (err, res) => {
    if (err) throw err
    console.log(res)
  })
} else {
  parser(require('fs').createReadStream(arg), (err, res) => {
    if (err) throw err
    console.log(res)
  })
}
