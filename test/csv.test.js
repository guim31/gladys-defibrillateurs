import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CsvParser } from '../src/csv.js';

const parseAll = (text, size) => {
  const parser = new CsvParser(';');
  const rows = [];
  for (let i = 0; i < text.length; i += size) {
    rows.push(...parser.push(text.slice(i, i + size)));
  }
  rows.push(...parser.end());
  return rows;
};

test('quoted fields keep their separators, quotes and line breaks, whatever the chunks', () => {
  const text = 'a;b;c\r\n1;"x;y";"say ""hi"""\n2;"line\nbreak";\n3;;last';
  const expected = [
    ['a', 'b', 'c'],
    ['1', 'x;y', 'say "hi"'],
    ['2', 'line\nbreak', ''],
    ['3', '', 'last'],
  ];
  for (const size of [1, 2, 3, 7, 1000]) {
    assert.deepEqual(parseAll(text, size), expected, `chunks of ${size}`);
  }
});

test('blank lines are skipped, a final line break adds no row', () => {
  assert.deepEqual(parseAll('a;b\n\n1;2\n', 5), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('a stray quote cannot swallow the rest of the file', () => {
  const parser = new CsvParser(';');
  assert.throws(() => parser.push(`a;"b\n${'x;'.repeat(60000)}`), /too long/);
});
