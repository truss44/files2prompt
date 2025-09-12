import * as path from 'path';
import { EXT_TO_LANG, addLineNumbers, writeMultiLine } from './utils.js';

let globalIndex = 1;

export function resetDocumentIndex(): void {
  globalIndex = 1;
}

// Print path as JSON object (no surrounding commas/brackets)
export function printAsJson(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  lineNumbers: boolean
): void {
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  const obj = {
    index: globalIndex,
    source: filePath,
    content,
  };
  writer(JSON.stringify(obj));
  globalIndex++;
}

// Print path in default format
export function printDefault(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  lineNumbers: boolean
): void {
  writer(filePath);
  writer('---');
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer('');
  writer('---');
}

// Print path in XML format (optimized for LLM/Claude: simple tags, indexed documents)
export function printAsXml(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  lineNumbers: boolean
): void {
  writer(`<document index="${globalIndex}">`);
  writer(`<source>${filePath}</source>`);
  writer('<document_content>');
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer('</document_content>');
  writer('</document>');
  globalIndex++;
}

// Print path in Markdown format
export function printAsMarkdown(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  lineNumbers: boolean
): void {
  writer(filePath);
  const ext = path.extname(filePath).substring(1).toLowerCase();
  const lang = EXT_TO_LANG[ext] || '';
  let backticks = '```';
  while (content.includes(backticks)) {
    backticks += '`';
  }
  writer(`${backticks}${lang}`);
  if (lineNumbers) {
    content = addLineNumbers(content);
  }
  writeMultiLine(writer, content);
  writer(backticks);
}

// Print path in appropriate format
export function printPath(
  writer: (line: string) => void,
  filePath: string,
  content: string,
  cxml: boolean,
  markdown: boolean,
  lineNumbers: boolean
): void {
  if (cxml) {
    printAsXml(writer, filePath, content, lineNumbers);
  } else if (markdown) {
    printAsMarkdown(writer, filePath, content, lineNumbers);
  } else {
    printDefault(writer, filePath, content, lineNumbers);
  }
}
