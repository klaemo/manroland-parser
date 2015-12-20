# manroland-parser

Parses and normalizes manroland csv data

## Installation

```
npm i -S manroland-parser
```

You can also install it as a CLI tool with `-g`.

## Example

```javascript
const parser = require('manroland-parser')
const path = `${__dirname}/test/fixtures/R508_15-12-10_15-1923(Nass)__4_- Blätter T2(R505).csv`
const file = require('fs').createReadStream(path)

parser(file, (err, res) => {
  if (err) return console.error(err)
  console.log(res)
})
```

## Tests

```
npm test
```

## License

MIT
