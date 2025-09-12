import { printAsMarkdown, printAsXml, resetDocumentIndex } from '../src/printing';

function collectWriter() {
  const lines: string[] = [];
  const writer = (line: string) => lines.push(line);
  return { lines, writer };
}

describe('printing', () => {
  test('printAsMarkdown uses language and fences', () => {
    const { lines, writer } = collectWriter();
    printAsMarkdown(writer, '/tmp/example.ts', 'const x = 1;\n', false);
    expect(lines[0]).toBe('/tmp/example.ts');
    expect(lines[1]).toBe('```typescript');
    expect(lines[2]).toBe('const x = 1;');
    expect(lines[3]).toBe('');
    expect(lines[4]).toBe('```');
  });

  test('printAsXml increments index and resetDocumentIndex resets it', () => {
    resetDocumentIndex();
    const a = collectWriter();
    const b = collectWriter();
    printAsXml(a.writer, 'a.txt', 'A', false);
    printAsXml(b.writer, 'b.txt', 'B', false);
    // First document should have index=1
    expect(a.lines[0]).toBe('<document index="1">');
    // Second document should have index=2
    expect(b.lines[0]).toBe('<document index="2">');
    // After reset, next starts back at 1
    resetDocumentIndex();
    const c = collectWriter();
    printAsXml(c.writer, 'c.txt', 'C', false);
    expect(c.lines[0]).toBe('<document index="1">');
  });
});
