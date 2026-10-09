import { describe, expect, it, vi } from 'vitest';
import { readCsv } from '@ledger/shared';

// The route module opens the database on import; these tests never touch it.
vi.mock('../src/db/index.js', () => ({ db: {}, sqlite: {} }));

import { parseCSV } from '../src/routes/import.js';

const rows = (text: string) => {
  const result = readCsv(text);
  expect(result.unclosedQuoteLine).toBeNull();
  return result.records;
};

describe('readCsv', () => {
  it('reads a quoted field with a comma and a line break as one cell in one row', () => {
    expect(rows('Date,Description,Amount\n01/02/2026,"Hardware, Inc.\nRefund",12.50\n01/03/2026,Cafe,4.00\n')).toEqual([
      ['Date', 'Description', 'Amount'],
      ['01/02/2026', 'Hardware, Inc.\nRefund', '12.50'],
      ['01/03/2026', 'Cafe', '4.00'],
    ]);
  });

  it('turns a doubled quote inside a quoted field into one quote', () => {
    expect(rows('a,"Say ""hi"", then go",b')).toEqual([['a', 'Say "hi", then go', 'b']]);
    expect(rows('"",x')).toEqual([['', 'x']]);
  });

  it('reads Windows and Unix line endings the same way', () => {
    const unix = rows('Date,Amount\n01/02/2026,1.00\n"multi\nline",2.00\n');
    const windows = rows('Date,Amount\r\n01/02/2026,1.00\r\n"multi\r\nline",2.00\r\n');
    expect(windows).toEqual(unix);
    expect(unix[2]).toEqual(['multi\nline', '2.00']);
  });

  it('reads a file that ends without a newline', () => {
    expect(rows('Date,Amount\n01/02/2026,1.00')).toEqual([['Date', 'Amount'], ['01/02/2026', '1.00']]);
    expect(rows('a,"quoted, last"')).toEqual([['a', 'quoted, last']]);
  });

  it('keeps a quote in the middle of a field as a literal character', () => {
    expect(rows('Date,Description,Amount\n01/02/2026,12" PIZZA,9.99\n01/03/2026,Cafe,4.00\n')).toEqual([
      ['Date', 'Description', 'Amount'],
      ['01/02/2026', '12" PIZZA', '9.99'],
      ['01/03/2026', 'Cafe', '4.00'],
    ]);
    // After a quoted section ends, a later quote is literal too.
    expect(rows('"a"b"c,d')).toEqual([['ab"c', 'd']]);
  });

  it('opens a quoted field after leading spaces', () => {
    expect(rows('a, "b, c" ,d')).toEqual([['a', 'b, c', 'd']]);
  });

  it('reports an unclosed quote with the line it starts on', () => {
    const result = readCsv('Date,Description,Amount\n01/02/2026,Cafe,4.00\n01/03/2026,"Never closed,5.00\n01/04/2026,Shop,6.00\n');
    expect(result.unclosedQuoteLine).toBe(3);
    expect(readCsv('"').unclosedQuoteLine).toBe(1);
    expect(readCsv('a\r\n\r\nb,"x\r\ny\r\n').unclosedQuoteLine).toBe(3);
  });

  it('counts lines inside earlier quoted fields when reporting an unclosed quote', () => {
    expect(readCsv('"one\ntwo",x\n"open').unclosedQuoteLine).toBe(3);
  });

  it('drops records whose cells are all blank', () => {
    expect(rows('\nDate,Amount\n\n  \n,,\n , "" \n01/02/2026,1.00\n\n')).toEqual([['Date', 'Amount'], ['01/02/2026', '1.00']]);
  });

  it('trims every field, outside and inside quotes', () => {
    expect(rows('  Date , Amount \n" 01/02/2026 ",  1.00  \n')).toEqual([['Date', 'Amount'], ['01/02/2026', '1.00']]);
  });

  it('returns no records for an empty file', () => {
    expect(readCsv('')).toEqual({ records: [], unclosedQuoteLine: null });
    expect(readCsv('\n\r\n  \n')).toEqual({ records: [], unclosedQuoteLine: null });
  });
});

describe('parseCSV (POST /import/parse)', () => {
  it('counts headerRowIndex over non-blank records, so the browser slice gives the same rows', () => {
    const text = '\nExported 10/2026\n,,\n\nDate,Description,Amount\n10/01/2026,"Sample Shop\nRefund",-4.00\n\n10/02/2026,Sample Cafe,6.50\n';
    const { headers, rows, headerRowIndex, unclosedQuoteLine } = parseCSV(text);
    expect(unclosedQuoteLine).toBeNull();
    expect(headerRowIndex).toBe(1);
    expect(headers).toEqual(['Date', 'Description', 'Amount']);
    expect(rows).toEqual([['10/01/2026', 'Sample Shop\nRefund', '-4.00'], ['10/02/2026', 'Sample Cafe', '6.50']]);
    // ImportPage re-reads the file and slices from the server's index.
    expect(readCsv(text).records.slice(headerRowIndex + 1)).toEqual(rows);
  });

  it('passes an unclosed quote through for the route to reject', () => {
    expect(parseCSV('Date,Amount\n"10/01/2026,1.00\n').unclosedQuoteLine).toBe(2);
  });

  it('returns no headers for an empty file', () => {
    expect(parseCSV('').headers).toEqual([]);
  });
});
