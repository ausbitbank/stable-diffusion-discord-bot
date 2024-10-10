const fs = require('fs');

function removeDuplicates(inputFile, outputFile) {
  const uniqueLines = new Set();
  const lines = fs.readFileSync(inputFile, 'utf8').split('\n');

  lines.forEach((line) => {
    line = line.trim();
    if (line && !uniqueLines.has(line)) {
      uniqueLines.add(line);
    }
  });

  const totalLinesBefore = lines.length;
  const totalLinesAfter = uniqueLines.size;

  fs.writeFileSync(outputFile, Array.from(uniqueLines).join('\n'));
  console.log('Duplicates removed.');
  console.log('Total lines before:', totalLinesBefore);
  console.log('Total lines after:', totalLinesAfter);
  console.log('Unique lines saved to:', outputFile);
}

removeDuplicates('prompt.txt', 'prompt2.txt');