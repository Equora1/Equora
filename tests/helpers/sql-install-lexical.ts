/** Lexical guard only. It does not parse PL/pgSQL or replace a PostgreSQL run. */
export function scanSqlInstallStatements(sql: string) {
  const statements: string[] = []
  let at = 0, current = ''
  while (at < sql.length) {
    if (sql.startsWith('--', at)) { const end = sql.indexOf('\n', at); at = end < 0 ? sql.length : end + 1; current += ' '; continue }
    if (sql.startsWith('/*', at)) {
      let depth = 1; at += 2
      while (at < sql.length && depth) {
        if (sql.startsWith('/*', at)) { depth++; at += 2 }
        else if (sql.startsWith('*/', at)) { depth--; at += 2 }
        else at++
      }
      if (depth) throw Error('SQL_COMMENT_UNCLOSED')
      current += ' '; continue
    }
    const char = sql[at]
    if (char === "'" || char === '"') {
      const start = at++; let closed = false
      while (at < sql.length) {
        if (sql[at++] === char) { if (sql[at] === char) at++; else { closed = true; break } }
      }
      if (!closed) throw Error('SQL_QUOTE_UNCLOSED')
      current += sql.slice(start, at); continue
    }
    if (char === '$') {
      const delimiter = sql.slice(at).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0]
      if (!delimiter) throw Error('SQL_DOLLAR_DELIMITER_INVALID')
      const end = sql.indexOf(delimiter, at + delimiter.length)
      if (end < 0) throw Error('SQL_DOLLAR_BODY_UNCLOSED')
      current += sql.slice(at, end + delimiter.length); at = end + delimiter.length; continue
    }
    if (char === ';') { if (current.trim()) statements.push(current.trim()); current = ''; at++; continue }
    current += char; at++
  }
  if (current.trim()) throw Error('SQL_STATEMENT_UNTERMINATED')
  return statements
}
