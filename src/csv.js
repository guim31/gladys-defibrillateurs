// -----------------------------------------------------------------------------
// A streaming parser for the Géo'DAE CSV export (semicolon-separated, UTF-8,
// double quotes around a field that holds a separator, a quote or a line
// break). Chunks go in, complete rows come out: the 80 MB file is never held
// in memory, only the current row.
// -----------------------------------------------------------------------------

export class CsvParser {
  constructor(separator = ';') {
    this.separator = separator;
    this.field = '';
    this.row = [];
    this.quoted = false; // inside a quoted field
    this.quotePending = false; // a quote seen inside a quoted field: end or "" escape
    this.started = false; // the current row has content
  }

  endField() {
    this.row.push(this.field);
    this.field = '';
  }

  /** Feeds a chunk of text; returns the rows it completed (arrays of strings). */
  push(text) {
    const rows = [];
    const sep = this.separator;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (this.quotePending) {
        this.quotePending = false;
        if (char === '"') {
          this.field += '"';
          continue;
        }
        this.quoted = false;
      }
      if (this.quoted) {
        if (char === '"') {
          this.quotePending = true;
        } else {
          this.field += char;
        }
        continue;
      }
      if (char === '"' && this.field === '') {
        this.quoted = true;
        this.started = true;
      } else if (char === sep) {
        this.endField();
        this.started = true;
      } else if (char === '\n') {
        if (this.started || this.field !== '' || this.row.length > 0) {
          this.endField();
          rows.push(this.row);
        }
        this.row = [];
        this.started = false;
      } else if (char !== '\r') {
        this.field += char;
        this.started = true;
      }
    }
    return rows;
  }

  /** The last row when the text does not end with a line break. */
  end() {
    this.quotePending = false;
    this.quoted = false;
    if (this.started || this.field !== '' || this.row.length > 0) {
      this.endField();
      const row = this.row;
      this.row = [];
      this.started = false;
      return [row];
    }
    return [];
  }
}
