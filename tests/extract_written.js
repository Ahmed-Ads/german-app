import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

export function extractFunction(source, fnName) {
  const startIdx = source.indexOf(`function ${fnName}(`);
  if (startIdx === -1) throw new Error(`Function ${fnName} not found in index.html`);
  const openBrace = source.indexOf('{', startIdx);
  let depth = 1;
  let i = openBrace + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i);
      if (i === -1) break;
      i++;
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') i += 2;
        else if (source[i] === q) break;
        else i++;
      }
    }
    i++;
  }
  return source.slice(startIdx, i);
}

const normCode = extractFunction(html, 'normalizeDe');
const evalCode = extractFunction(html, 'evaluateWrittenAnswer');

export const normalizeDe = new Function(`${normCode}\nreturn normalizeDe;`)();
export const evaluateWrittenAnswer = new Function(`${normCode}\n${evalCode}\nreturn evaluateWrittenAnswer;`)();
