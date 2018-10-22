import tc from 'chalk'
import prettyBytes from 'pretty-bytes'

export function printTimings(timings) {
  Object.keys(timings).forEach(label => {
    const color =
      label[0] === '#' ? (label[1] !== '#' ? tc.underline : tc.bold) : (text) => text
    const [time, memory, total] = timings[label]
    const row = `${label}: ${time.toFixed(0)}ms, ${prettyBytes(memory)} / ${prettyBytes(total)}`
    console.info(color(row))
  })
}
