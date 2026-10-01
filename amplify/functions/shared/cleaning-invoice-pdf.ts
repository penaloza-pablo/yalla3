import zlib from 'node:zlib';

type TextRun = { x: number; y: number; text: string };

const MAC_ROMAN: Record<number, string> = {
  0x80: 'Ä',
  0x81: 'Å',
  0x82: 'Ç',
  0x83: 'É',
  0x84: 'Ñ',
  0x85: 'Ö',
  0x86: 'Ü',
  0x87: 'á',
  0x88: 'à',
  0x89: 'â',
  0x8a: 'ä',
  0x8b: 'ã',
  0x8c: 'å',
  0x8d: 'ç',
  0x8e: 'é',
  0x8f: 'è',
  0x90: 'ê',
  0x91: 'ë',
  0x92: 'í',
  0x93: 'ì',
  0x94: 'î',
  0x95: 'ï',
  0x96: 'ñ',
  0x97: 'ó',
  0x98: 'ò',
  0x99: 'ô',
  0x9a: 'ö',
  0x9b: 'õ',
  0x9c: 'ú',
  0x9d: 'ù',
  0x9e: 'û',
  0x9f: 'ü',
  0xdb: '€',
};

const decodePdfLiteral = (raw: string) => {
  let output = '';
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== '\\') {
      const code = char.charCodeAt(0);
      output += MAC_ROMAN[code] ?? char;
      continue;
    }
    const next = raw[index + 1] ?? '';
    if (next === '\n' || next === '\r') {
      index += next === '\r' && raw[index + 2] === '\n' ? 2 : 1;
      continue;
    }
    const octal = raw.slice(index + 1, index + 4).match(/^([0-7]{1,3})/);
    if (octal) {
      const code = parseInt(octal[1], 8);
      output += MAC_ROMAN[code] ?? String.fromCharCode(code);
      index += octal[1].length;
      continue;
    }
    const escaped: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '(': '(',
      ')': ')',
      '\\': '\\',
    };
    output += escaped[next] ?? next;
    index += 1;
  }
  return output.replace(/["']#/g, '€').replace(/€+/g, '€');
};

const collectLiterals = (block: string) => {
  const parts: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(block))) {
    parts.push(decodePdfLiteral(match[0].slice(1, -1)));
  }
  return parts.join('');
};

const inflatePdfStreams = (bytes: Buffer) => {
  const latin = bytes.toString('latin1');
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const streams: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin))) {
    const raw = Buffer.from(match[1], 'latin1');
    for (const inflate of [zlib.inflateSync, zlib.inflateRawSync] as const) {
      try {
        streams.push(inflate(raw).toString('latin1'));
        break;
      } catch {
        // try the next inflater
      }
    }
  }
  return streams;
};

const readBalanced = (content: string, start: number, open: string, close: string) => {
  let depth = 1;
  let cursor = start + 1;
  let text = content[start] ?? '';
  while (cursor < content.length && depth > 0) {
    const current = content[cursor];
    text += current;
    if (current === '\\') {
      text += content[cursor + 1] ?? '';
      cursor += 2;
      continue;
    }
    if (current === open) {
      depth += 1;
    } else if (current === close) {
      depth -= 1;
    }
    cursor += 1;
  }
  return { text, next: cursor };
};

const tokenizePdfContent = (content: string) => {
  const tokens: string[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (/\s/.test(char)) {
      continue;
    }
    if (char === '(') {
      const read = readBalanced(content, index, '(', ')');
      tokens.push(read.text);
      index = read.next - 1;
      continue;
    }
    if (char === '[') {
      const read = readBalanced(content, index, '[', ']');
      tokens.push(read.text);
      index = read.next - 1;
      continue;
    }
    if (char === '/') {
      const rest = content.slice(index).match(/^\/[A-Za-z0-9]+/);
      if (rest) {
        tokens.push(rest[0]);
        index += rest[0].length - 1;
        continue;
      }
    }
    const word = content.slice(index).match(/^-?\d+(?:\.\d+)?|[A-Za-z']+/);
    if (word) {
      tokens.push(word[0]);
      index += word[0].length - 1;
    }
  }
  return tokens;
};

const isReadablePdfText = (value: string) => {
  const text = value.trim();
  if (!text) {
    return false;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
    return false;
  }
  const letters = (text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9€]/g) ?? []).length;
  return letters / text.length >= 0.4;
};

const parseContentRuns = (content: string) => {
  const runs: TextRun[] = [];
  const cmStack: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let cm = cmStack[0];
  let tmX = 0;
  let tmY = 0;
  const tokens = tokenizePdfContent(content);
  const numbers: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'q') {
      cmStack.push({ ...cm });
      numbers.length = 0;
      continue;
    }
    if (token === 'Q') {
      cmStack.pop();
      cm = cmStack[cmStack.length - 1] ?? { x: 0, y: 0 };
      numbers.length = 0;
      continue;
    }
    if (token === 'cm' && numbers.length >= 6) {
      const e = numbers[numbers.length - 2];
      const f = numbers[numbers.length - 1];
      cm = { x: cm.x + e, y: cm.y + f };
      cmStack[cmStack.length - 1] = cm;
      numbers.length = 0;
      continue;
    }
    if (token === 'Tm' && numbers.length >= 6) {
      tmX = numbers[numbers.length - 2];
      tmY = numbers[numbers.length - 1];
      numbers.length = 0;
      continue;
    }
    if (token === 'Td' && numbers.length >= 2) {
      tmX += numbers[numbers.length - 2];
      tmY += numbers[numbers.length - 1];
      numbers.length = 0;
      continue;
    }
    if (token === 'TJ' || token === 'Tj' || token === "'") {
      const source = tokens[index - 1] ?? '';
      const text =
        token === 'TJ'
          ? collectLiterals(source.startsWith('[') ? source : '')
          : source.startsWith('(')
            ? decodePdfLiteral(source.slice(1, -1))
            : '';
      if (isReadablePdfText(text)) {
        runs.push({ x: cm.x + tmX, y: cm.y + tmY, text });
      }
      numbers.length = 0;
      continue;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(token)) {
      numbers.push(Number(token));
      if (numbers.length > 8) {
        numbers.shift();
      }
      continue;
    }
    numbers.length = 0;
  }
  return runs;
};

const joinRows = (runs: TextRun[]) => {
  const sorted = [...runs].sort((left, right) => {
    if (Math.abs(right.y - left.y) > 3) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });
  const rows: string[] = [];
  let currentY = Number.NaN;
  let current: string[] = [];
  for (const run of sorted) {
    if (!Number.isFinite(currentY) || Math.abs(currentY - run.y) > 3) {
      if (current.length) {
        rows.push(current.join(' ').replace(/\s+/g, ' ').trim());
      }
      current = [run.text];
      currentY = run.y;
      continue;
    }
    current.push(run.text);
  }
  if (current.length) {
    rows.push(current.join(' ').replace(/\s+/g, ' ').trim());
  }
  return rows.filter(Boolean);
};

export const extractPdfText = (bytes: Uint8Array | Buffer) => {
  const streams = inflatePdfStreams(Buffer.from(bytes));
  const runs = streams.flatMap((stream) => parseContentRuns(stream));
  if (runs.length === 0) {
    return '';
  }
  return joinRows(runs).join('\n');
};
