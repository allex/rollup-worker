import chalk from 'chalk'

export function printTimings(timings) {
  Object.keys(timings).forEach(function (label) {
    var color = chalk_1["default"];
    if (label[0] === '#') {
      color = color.bold;
      if (label[1] !== '#') {
        color = color.underline;
      }
    }
    console.info(color(label + ": " + timings[label].toFixed(0) + "ms"));
  });
}
