import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ignore from 'ignore';
import { processPath } from '../src/walker';

function collectWriter() {
  const lines: string[] = [];
  const writer = (line: string) => lines.push(line);
  return { lines, writer };
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'p2f-test-'));
}

describe('walker/processPath', () => {
  test('respects extension filter', () => {
    const tmp = makeTempDir();
    const a = path.join(tmp, 'a.ts');
    const b = path.join(tmp, 'b.md');
    fs.writeFileSync(a, 'export {}\n');
    fs.writeFileSync(b, '# md\n');

    const { lines, writer } = collectWriter();
    processPath(
      tmp,
      ['.ts'], // only .ts
      true,
      false,
      false,
      [],
      [],
      null as unknown as ReturnType<typeof ignore>,
      writer,
      false,
      false,
      false
    );

    const output = lines.join('\n');
    expect(output).toContain(a);
    expect(output).not.toContain(b);
  });

  test('honors includeHidden=false by default', () => {
    const tmp = makeTempDir();
    const hidden = path.join(tmp, '.hidden.txt');
    const visible = path.join(tmp, 'visible.txt');
    fs.writeFileSync(hidden, 'h');
    fs.writeFileSync(visible, 'v');

    const { lines, writer } = collectWriter();
    processPath(
      tmp,
      [],
      false, // includeHidden=false
      false,
      false,
      [],
      [],
      null as unknown as ReturnType<typeof ignore>,
      writer,
      false,
      false,
      false
    );
    const output = lines.join('\n');
    expect(output).toContain(visible);
    expect(output).not.toContain(hidden);
  });

  test('applies ignore patterns', () => {
    const tmp = makeTempDir();
    const keep = path.join(tmp, 'keep.txt');
    const skip = path.join(tmp, 'skip.log');
    fs.writeFileSync(keep, 'k');
    fs.writeFileSync(skip, 's');

    const { lines, writer } = collectWriter();
    processPath(
      tmp,
      [],
      true,
      false,
      true, // ignoreGitignore=true so only custom ignores apply here
      [],
      ['*.log'], // ignore logs
      null as unknown as ReturnType<typeof ignore>,
      writer,
      false,
      false,
      false
    );
    const output = lines.join('\n');
    expect(output).toContain(keep);
    expect(output).not.toContain(skip);
  });

  test('skips binary files (e.g., images)', () => {
    const tmp = makeTempDir();
    const img = path.join(tmp, 'image.png');
    const txt = path.join(tmp, 'note.txt');
    // Write a tiny PNG-like file (extension-based detection will skip regardless of content)
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(img, pngSig);
    fs.writeFileSync(txt, 'hello world');

    const { lines, writer } = collectWriter();
    processPath(
      tmp,
      [],
      true,
      false,
      true,
      [],
      [],
      null as unknown as ReturnType<typeof ignore>,
      writer,
      false,
      false,
      false
    );
    const output = lines.join('\n');
    expect(output).toContain(txt);
    expect(output).not.toContain(img);
  });
});
