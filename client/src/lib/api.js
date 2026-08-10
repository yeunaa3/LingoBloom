const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const LOCAL_SESSION_KEY = 'lingobloom.localSession';
const LOCAL_DATA_KEY = 'lingobloom.localData.v1';

export const LANGUAGES = [
  { code: 'en', name: 'Tiếng Anh', native: 'English', flag: '🇬🇧' },
  { code: 'vi', name: 'Tiếng Việt', native: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ja', name: 'Tiếng Nhật', native: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Tiếng Hàn', native: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Tiếng Trung', native: '中文', flag: '🇨🇳' },
  { code: 'fr', name: 'Tiếng Pháp', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Tiếng Đức', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Tiếng Tây Ban Nha', native: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Tiếng Ý', native: 'Italiano', flag: '🇮🇹' },
  { code: 'th', name: 'Tiếng Thái', native: 'ภาษาไทย', flag: '🇹🇭' },
];

const now = new Date();
const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString();

const defaultData = {
  user: {
    id: 'demo-user',
    name: 'Bạn học Bloom',
    email: 'demo@lingobloom.local',
    avatarUrl: '',
    learningLanguage: 'en',
    nativeLanguage: 'vi',
    onboardingCompleted: false,
    isDemo: true,
  },
  words: [
    {
      id: 'seed-word-1',
      term: 'serendipity',
      translation: 'sự tình cờ may mắn',
      pronunciation: '/ˌser.ənˈdɪp.ə.ti/',
      partOfSpeech: 'danh từ',
      example: 'Finding this little café was pure serendipity.',
      notes: 'Một khám phá vui xảy ra ngoài dự tính.',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: true,
      mastery: 72,
      nextReviewAt: day(0),
      createdAt: day(-6),
    },
    {
      id: 'seed-word-2',
      term: 'gentle',
      translation: 'dịu dàng, nhẹ nhàng',
      pronunciation: '/ˈdʒen.təl/',
      partOfSpeech: 'tính từ',
      example: 'Be gentle with yourself while you learn.',
      notes: '',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: false,
      mastery: 48,
      nextReviewAt: day(0),
      createdAt: day(-4),
    },
    {
      id: 'seed-word-3',
      term: 'wander',
      translation: 'đi lang thang, thơ thẩn',
      pronunciation: '/ˈwɒn.dər/',
      partOfSpeech: 'động từ',
      example: 'We wandered through the old streets after lunch.',
      notes: '',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: true,
      mastery: 30,
      nextReviewAt: day(-1),
      createdAt: day(-3),
    },
    {
      id: 'seed-word-4',
      term: 'bloom',
      translation: 'nở hoa; phát triển rực rỡ',
      pronunciation: '/bluːm/',
      partOfSpeech: 'động từ',
      example: 'Her confidence began to bloom.',
      notes: '',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: false,
      mastery: 12,
      nextReviewAt: day(0),
      createdAt: day(-1),
    },
  ],
  structures: [
    {
      id: 'seed-structure-1',
      pattern: 'be used to + V-ing',
      meaning: 'quen với việc gì',
      example: 'I am used to waking up early.',
      notes: 'Khác với “used to + V” (đã từng).',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: true,
      mastery: 62,
      nextReviewAt: day(0),
      createdAt: day(-5),
    },
    {
      id: 'seed-structure-2',
      pattern: 'It takes + time + to V',
      meaning: 'mất bao lâu để làm gì',
      example: 'It takes twenty minutes to walk there.',
      notes: '',
      learningLanguage: 'en',
      nativeLanguage: 'vi',
      bookmarked: false,
      mastery: 25,
      nextReviewAt: day(0),
      createdAt: day(-2),
    },
  ],
  reviewLog: [
    { date: day(-6), count: 6 },
    { date: day(-5), count: 9 },
    { date: day(-4), count: 5 },
    { date: day(-3), count: 12 },
    { date: day(-2), count: 8 },
    { date: day(-1), count: 14 },
    { date: day(0), count: 4 },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readLocalData() {
  try {
    const saved = localStorage.getItem(LOCAL_DATA_KEY);
    return saved ? { ...clone(defaultData), ...JSON.parse(saved) } : clone(defaultData);
  } catch {
    return clone(defaultData);
  }
}

function writeLocalData(data) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function isLocalDemo() {
  return localStorage.getItem(LOCAL_SESSION_KEY) === 'true';
}

function extract(payload, keys = []) {
  if (payload == null) return payload;
  if (payload.data !== undefined) return payload.data;
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  return payload;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers,
      body: options.body && !isForm && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
    });
  } catch (cause) {
    const error = new Error('Không thể kết nối máy chủ.');
    error.code = 'NETWORK_ERROR';
    error.cause = cause;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const errorMessage = payload?.message
      || payload?.error?.message
      || (typeof payload?.error === 'string' ? payload.error : '')
      || 'Yêu cầu chưa được xử lý.';
    const error = new Error(errorMessage);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function requestAll(path, keys) {
  const pageSize = 200;
  let offset = 0;
  const items = [];
  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await request(`${path}${separator}limit=${pageSize}&offset=${offset}`);
    const page = extract(payload, keys);
    const rows = Array.isArray(page) ? page : [];
    items.push(...rows);
    const total = Number(payload?.meta?.total);
    offset += rows.length;
    if (!rows.length || rows.length < pageSize || (Number.isFinite(total) && offset >= total)) break;
  }
  return items;
}

function normalizeWord(item) {
  return {
    ...item,
    id: String(item.id ?? item._id ?? makeId('word')),
    term: item.term ?? item.word ?? item.front ?? '',
    translation: item.translation ?? item.meaning ?? item.definition ?? item.back ?? '',
    pronunciation: item.pronunciation ?? item.phonetic ?? '',
    partOfSpeech: item.partOfSpeech ?? item.type ?? '',
    example: item.example ?? item.exampleSentence ?? '',
    bookmarked: Boolean(item.bookmarked ?? item.isBookmarked ?? item.favorite),
    mastery: Number(item.mastery ?? item.progress ?? 0),
  };
}

function normalizeStructure(item) {
  return {
    ...item,
    id: String(item.id ?? item._id ?? makeId('structure')),
    pattern: item.pattern ?? item.structure ?? item.title ?? '',
    meaning: item.meaning ?? item.translation ?? item.description ?? '',
    bookmarked: Boolean(item.bookmarked ?? item.isBookmarked ?? item.favorite),
    mastery: Number(item.mastery ?? item.progress ?? 0),
  };
}

function parseDelimitedLine(line, delimiter) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value.trim());
  return fields;
}

async function localImport(file, options) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { imported: 0, skipped: 0, items: [] };

  const first = lines[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : null;
  const headerWords = /^(word|term|từ|vocabulary|front|pattern|structure|cấu trúc)/i;
  const content = headerWords.test(first) ? lines.slice(1) : lines;
  if (content.length > 2000) throw new Error('Mỗi lần chỉ nhập tối đa 2.000 dòng.');
  const data = readLocalData();
  const created = [];
  const importStructures = ['structure', 'structures', 'sentence', 'sentences'].includes(String(options.type || options.kind).toLowerCase());
  const targetLanguage = options.learningLanguage || 'en';
  const normalizeKey = (value, language = targetLanguage) => `${language}:${String(value || '').normalize('NFKC').trim().toLocaleLowerCase(language)}`;
  const existingItems = importStructures ? data.structures : data.words;
  const seen = new Set(existingItems.map((item) => normalizeKey(
    importStructures ? item.pattern : item.term,
    item.learningLanguage || item.language || targetLanguage,
  )));

  content.forEach((line, lineIndex) => {
    let parts;
    if (delimiter) parts = parseDelimitedLine(line, delimiter);
    else parts = line.split(/\s+(?:-|—|:)\s+/, 2).map((part) => part.trim());
    if (!parts[0]) return;
    if (!parts[1]?.trim()) throw new Error(`Dòng ${lineIndex + (content === lines ? 1 : 2)} cần có nghĩa ở cột thứ hai.`);
    const key = normalizeKey(parts[0]);
    if (seen.has(key)) return;
    seen.add(key);
    if (importStructures) {
      const structure = normalizeStructure({
        id: makeId('structure'),
        pattern: parts[0],
        meaning: parts[1] || '',
        example: parts[2] || '',
        notes: parts[3] || '',
        learningLanguage: targetLanguage,
        bookmarked: false,
        mastery: 0,
        nextReviewAt: day(0),
        createdAt: new Date().toISOString(),
      });
      data.structures.unshift(structure);
      created.push(structure);
    } else {
      const word = normalizeWord({
        id: makeId('word'),
        term: parts[0],
        translation: parts[1] || '',
        example: parts[2] || '',
        notes: parts[3] || '',
        learningLanguage: targetLanguage,
        nativeLanguage: options.nativeLanguage,
        bookmarked: false,
        mastery: 0,
        nextReviewAt: day(0),
        createdAt: new Date().toISOString(),
      });
      data.words.unshift(word);
      created.push(word);
    }
  });
  writeLocalData(data);
  return { imported: created.length, skipped: content.length - created.length, items: created };
}

export const api = {
  googleLoginUrl: `${API_BASE}/auth/google`,

  async getConfig() {
    try {
      const result = extract(await request('/config'), ['config']);
      return {
        googleOAuthConfigured: Boolean(result?.googleOAuthConfigured ?? result?.googleEnabled),
        demoMode: result?.demoMode !== false,
      };
    } catch {
      return { googleOAuthConfigured: false, demoMode: true };
    }
  },

  async getMe() {
    if (isLocalDemo()) return readLocalData().user;
    const payload = await request('/auth/me');
    return extract(payload, ['user']);
  },

  async loginDemo() {
    try {
      const payload = await request('/auth/demo', { method: 'POST' });
      localStorage.removeItem(LOCAL_SESSION_KEY);
      return extract(payload, ['user']);
    } catch (error) {
      if (error.status && error.status !== 404 && error.status !== 503) throw error;
      localStorage.setItem(LOCAL_SESSION_KEY, 'true');
      return readLocalData().user;
    }
  },

  async logout() {
    if (isLocalDemo()) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      return;
    }
    await request('/auth/logout', { method: 'POST' });
  },

  async updatePreferences(preferences) {
    if (isLocalDemo()) {
      const data = readLocalData();
      data.user = { ...data.user, ...preferences, onboardingCompleted: true };
      writeLocalData(data);
      return data.user;
    }
    const payload = await request('/users/me/preferences', { method: 'PATCH', body: preferences });
    return extract(payload, ['user', 'preferences']);
  },

  async getWords() {
    if (isLocalDemo()) return readLocalData().words.map(normalizeWord);
    const rows = await requestAll('/words', ['words', 'items']);
    return rows.map(normalizeWord);
  },

  async createWord(word) {
    if (isLocalDemo()) {
      const data = readLocalData();
      const created = normalizeWord({ ...word, id: makeId('word'), bookmarked: false, mastery: 0, nextReviewAt: day(0), createdAt: new Date().toISOString() });
      data.words.unshift(created);
      writeLocalData(data);
      return created;
    }
    const payload = await request('/words', { method: 'POST', body: word });
    return normalizeWord(extract(payload, ['word']));
  },

  async updateWord(id, updates) {
    if (isLocalDemo()) {
      const data = readLocalData();
      const index = data.words.findIndex((word) => String(word.id) === String(id));
      if (index < 0) throw new Error('Không tìm thấy từ này.');
      data.words[index] = { ...data.words[index], ...updates };
      writeLocalData(data);
      return normalizeWord(data.words[index]);
    }
    const payload = await request(`/words/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates });
    return normalizeWord(extract(payload, ['word']));
  },

  async deleteWord(id) {
    if (isLocalDemo()) {
      const data = readLocalData();
      data.words = data.words.filter((word) => String(word.id) !== String(id));
      writeLocalData(data);
      return;
    }
    await request(`/words/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getStructures() {
    if (isLocalDemo()) return readLocalData().structures.map(normalizeStructure);
    const rows = await requestAll('/structures', ['structures', 'items']);
    return rows.map(normalizeStructure);
  },

  async createStructure(structure) {
    if (isLocalDemo()) {
      const data = readLocalData();
      const created = normalizeStructure({ ...structure, id: makeId('structure'), bookmarked: false, mastery: 0, nextReviewAt: day(0), createdAt: new Date().toISOString() });
      data.structures.unshift(created);
      writeLocalData(data);
      return created;
    }
    const payload = await request('/structures', { method: 'POST', body: structure });
    return normalizeStructure(extract(payload, ['structure']));
  },

  async updateStructure(id, updates) {
    if (isLocalDemo()) {
      const data = readLocalData();
      const index = data.structures.findIndex((item) => String(item.id) === String(id));
      if (index < 0) throw new Error('Không tìm thấy cấu trúc này.');
      data.structures[index] = { ...data.structures[index], ...updates };
      writeLocalData(data);
      return normalizeStructure(data.structures[index]);
    }
    const payload = await request(`/structures/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates });
    return normalizeStructure(extract(payload, ['structure']));
  },

  async deleteStructure(id) {
    if (isLocalDemo()) {
      const data = readLocalData();
      data.structures = data.structures.filter((item) => String(item.id) !== String(id));
      writeLocalData(data);
      return;
    }
    await request(`/structures/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async importFile(file, options) {
    if (isLocalDemo()) return localImport(file, options);
    const form = new FormData();
    form.append('file', file);
    Object.entries(options).forEach(([key, value]) => form.append(key, value));
    const payload = await request('/import', { method: 'POST', body: form });
    return extract(payload, ['result']);
  },

  async lookupDictionary(query, languages) {
    if (isLocalDemo()) {
      const known = defaultData.words.find((word) => word.term.toLowerCase() === query.trim().toLowerCase());
      if (known) return [normalizeWord(known)];
      return [{
        id: `lookup-${query}`,
        term: query.trim(),
        translation: '',
        pronunciation: '',
        partOfSpeech: '',
        example: '',
        source: 'Bản nháp demo',
      }];
    }
    const search = new URLSearchParams({
      q: query,
      query,
      source: languages.learningLanguage,
      target: languages.nativeLanguage,
    });
    const payload = await request(`/dictionary/search?${search}`);
    const result = extract(payload, ['results', 'entries', 'words']);
    return (Array.isArray(result) ? result : result ? [result] : []).map(normalizeWord);
  },

  async getStats() {
    if (isLocalDemo()) {
      const data = readLocalData();
      const all = [...data.words, ...data.structures];
      const countsByDay = new Map();
      data.reviewLog.forEach((entry) => {
        const key = new Date(entry.date).toDateString();
        countsByDay.set(key, (countsByDay.get(key) || 0) + Number(entry.count || 0));
      });
      const weeklyReviews = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        return { date: date.toISOString(), count: countsByDay.get(date.toDateString()) || 0 };
      });
      let streak = 0;
      const today = new Date();
      const startsToday = countsByDay.has(today.toDateString());
      for (let offset = startsToday ? 0 : 1; offset < 370; offset += 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        if (!countsByDay.has(date.toDateString())) break;
        streak += 1;
      }
      return {
        streak,
        totalWords: data.words.length,
        totalStructures: data.structures.length,
        reviewedToday: countsByDay.get(today.toDateString()) || 0,
        mastered: all.filter((item) => Number(item.mastery) >= 80).length,
        averageMastery: all.length ? Math.round(all.reduce((sum, item) => sum + Number(item.mastery || 0), 0) / all.length) : 0,
        weeklyReviews,
      };
    }
    const payload = await request('/stats');
    return extract(payload, ['stats']);
  },

  async submitReview(review) {
    if (isLocalDemo()) {
      const data = readLocalData();
      const list = review.type === 'structure' ? data.structures : data.words;
      const index = list.findIndex((item) => String(item.id) === String(review.id));
      if (index >= 0) {
        const delta = { again: -12, hard: 5, good: 12, easy: 22 }[review.rating] || 0;
        list[index].mastery = Math.max(0, Math.min(100, Number(list[index].mastery || 0) + delta));
        const delayMs = { again: 10 * 60 * 1000, hard: 86400000, good: 3 * 86400000, easy: 7 * 86400000 }[review.rating] ?? 86400000;
        list[index].nextReviewAt = new Date(Date.now() + delayMs).toISOString();
      }
      const todayKey = new Date().toDateString();
      const today = data.reviewLog.find((entry) => new Date(entry.date).toDateString() === todayKey);
      if (today) today.count += 1;
      else data.reviewLog.push({ date: new Date().toISOString(), count: 1 });
      writeLocalData(data);
      const item = index >= 0
        ? (review.type === 'structure' ? normalizeStructure(list[index]) : normalizeWord(list[index]))
        : null;
      return { ok: true, item };
    }
    const payload = await request('/reviews', { method: 'POST', body: review });
    return {
      ...payload,
      item: payload?.item
        ? (review.type === 'structure' ? normalizeStructure(payload.item) : normalizeWord(payload.item))
        : null,
    };
  },
};

export function languageByCode(code) {
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0];
}
