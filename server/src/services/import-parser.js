import { extname } from "node:path";
import { ApiError, boolean, text } from "../http.js";

const aliases = {
  term: ["term", "word", "vocabulary", "tu", "tu vung"],
  translation: ["translation", "meaning", "definition", "nghia"],
  pronunciation: ["pronunciation", "phonetic", "phien am"],
  partOfSpeech: ["partofspeech", "part_of_speech", "pos", "tu loai"],
  example: ["example", "sentence", "vi du"],
  notes: ["notes", "note", "ghi chu"],
  bookmarked: ["bookmarked", "bookmark", "favorite", "yeu thich"],
  pattern: ["pattern", "structure", "grammar", "cau truc"],
  meaning: ["meaning", "translation", "nghia", "y nghia"],
};

const normalizeHeader = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, " ");

function fieldFor(header) {
  const normalized = normalizeHeader(header);
  return Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0] || null;
}

function countDelimiter(line, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(source, extension) {
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const candidates = extension === ".csv" ? [",", ";", "\t"] : ["\t", "|", ";", ","];
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(firstLine, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || "\t";
}

export function parseDelimited(source, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (quoted) throw new ApiError(400, "INVALID_FILE", "Tệp có dấu ngoặc kép chưa được đóng.");
  return rows;
}

export function parseImportFile(file, kind = "words") {
  if (!file) throw new ApiError(400, "FILE_REQUIRED", "Hãy chọn tệp CSV hoặc TXT.");
  const extension = extname(file.originalname || "").toLowerCase();
  if (![".csv", ".txt", ".tsv"].includes(extension)) {
    throw new ApiError(400, "UNSUPPORTED_FILE", "Chỉ hỗ trợ tệp .csv, .txt hoặc .tsv.");
  }
  if (!file.buffer?.length) throw new ApiError(400, "EMPTY_FILE", "Tệp đang trống.");

  // Some sample TXT files encode the separator as the two visible characters `\\t`.
  const decoded = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const source = decoded.includes("\\t") && !decoded.includes("\t") ? decoded.replace(/\\t/g, "\t") : decoded;
  const delimiter = detectDelimiter(source, extension);
  const rows = parseDelimited(source, delimiter);
  if (!rows.length) throw new ApiError(400, "EMPTY_FILE", "Tệp không có dòng dữ liệu nào.");

  const mappedHeaders = rows[0].map((header) => {
    const field = fieldFor(header);
    return kind === "structures" && field === "translation" ? "meaning" : field;
  });
  const primaryField = kind === "structures" ? "pattern" : "term";
  const hasHeader = mappedHeaders.includes(primaryField) && mappedHeaders.filter(Boolean).length >= 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length > 2000) throw new ApiError(400, "TOO_MANY_ROWS", "Mỗi lần chỉ nhập tối đa 2.000 dòng.");
  const result = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const cells = dataRows[index];
    const record = {};
    if (hasHeader) {
      mappedHeaders.forEach((field, cellIndex) => {
        if (field) record[field] = cells[cellIndex] || "";
      });
    } else if (kind === "structures") {
      [record.pattern, record.meaning, record.example, record.notes] = cells;
    } else {
      [record.term, record.translation, record.example, record.notes] = cells;
    }

    try {
      if (kind === "structures") {
        result.push({
          pattern: text(record.pattern, { name: "Cấu trúc", max: 500, required: true }),
          meaning: text(record.meaning, { name: "Ý nghĩa", max: 1500, required: true }),
          example: text(record.example, { name: "Ví dụ", max: 3000 }),
          notes: text(record.notes, { name: "Ghi chú", max: 5000 }),
          bookmarked: boolean(record.bookmarked),
          line: index + (hasHeader ? 2 : 1),
        });
      } else {
        result.push({
          term: text(record.term, { name: "Từ vựng", max: 200, required: true }),
          translation: text(record.translation, { name: "Nghĩa", max: 1000, required: true }),
          pronunciation: text(record.pronunciation, { name: "Phiên âm", max: 300 }),
          partOfSpeech: text(record.partOfSpeech, { name: "Từ loại", max: 80 }),
          example: text(record.example, { name: "Ví dụ", max: 3000 }),
          notes: text(record.notes, { name: "Ghi chú", max: 5000 }),
          bookmarked: boolean(record.bookmarked),
          line: index + (hasHeader ? 2 : 1),
        });
      }
    } catch (error) {
      error.details = { line: index + (hasHeader ? 2 : 1) };
      throw error;
    }
  }
  return { rows: result, delimiter: delimiter === "\t" ? "tab" : delimiter, hasHeader };
}
