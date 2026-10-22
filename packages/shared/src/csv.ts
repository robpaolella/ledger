export interface CsvReadResult {
  /** Non-blank records, every field trimmed. */
  records: string[][];
  /** 1-based line where a quoted field opened and never closed, or null. */
  unclosedQuoteLine: number | null;
}

// Reads the whole text at once, so quoted fields may hold commas, doubled quotes ("")
// and line breaks. A quote opens a quoted field only at the start of a field (after
// any spaces); anywhere else it is a literal character, so a stray quote can't swallow
// the rest of the file. Records whose cells are all blank are dropped.
export function readCsv(text: string): CsvReadResult {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let quoteLine = 0;
  let wasQuoted = false;

  const endField = () => { record.push(field.trim()); field = ''; wasQuoted = false; };
  const endRecord = () => {
    endField();
    if (record.some((c) => c !== '')) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        // Keep the line break, normalised to \n; the \n is added next iteration.
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && !wasQuoted && field.trim() === '') {
      inQuotes = true;
      wasQuoted = true;
      quoteLine = line;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRecord();
      line++;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      // Windows line ending: the \n ends the record.
    } else {
      field += ch;
    }
  }
  if (inQuotes) return { records, unclosedQuoteLine: quoteLine };
  endRecord();
  return { records, unclosedQuoteLine: null };
}
