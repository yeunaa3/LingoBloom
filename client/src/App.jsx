import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  FileText,
  Flame,
  Flower2,
  Home,
  Languages,
  Layers3,
  LibraryBig,
  LoaderCircle,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, LANGUAGES, languageByCode } from './lib/api.js';
import { normalizeQuizAnswer } from './lib/text.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Tổng quan', shortLabel: 'Hôm nay', icon: Home },
  { id: 'library', label: 'Thư viện', shortLabel: 'Thư viện', icon: LibraryBig },
  { id: 'add', label: 'Thêm mới', shortLabel: 'Thêm', icon: Plus, primary: true },
  { id: 'review', label: 'Ôn tập', shortLabel: 'Ôn tập', icon: Layers3 },
  { id: 'stats', label: 'Tiến độ', shortLabel: 'Tiến độ', icon: BarChart3 },
];

function userLanguage(user, key, fallback) {
  return user?.[key] || user?.preferences?.[key] || fallback;
}

function initials(name = 'Bạn học') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value) {
  if (!value) return 'Hôm nay';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Hôm nay';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(date);
}

function dueForReview(item) {
  if (!item.nextReviewAt) return true;
  return new Date(item.nextReviewAt).getTime() <= Date.now();
}

function reviewCardKey(item) {
  return `${item.reviewType}:${item.id}`;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createdWithinReviewRange(item, range, fromDate = '', toDate = '') {
  if (range === 'due') return dueForReview(item);
  if (range === 'all') return true;

  const createdAt = new Date(item.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (range === 'today') return createdAt >= today.getTime() && createdAt < tomorrow.getTime();
  if (range === '7days' || range === '30days') {
    const days = range === '7days' ? 7 : 30;
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    return createdAt >= start.getTime() && createdAt < tomorrow.getTime();
  }

  if (range === 'custom') {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return from <= to && createdAt >= from && createdAt <= to;
  }

  return false;
}

function wordLanguagePair(word) {
  return {
    learningLanguage: word.learningLanguage || word.language || 'en',
    nativeLanguage: word.nativeLanguage || 'vi',
  };
}

function buildQuizDirections(words) {
  const pairs = new Map();
  words.filter(hasUsableQuizTranslation).forEach((word) => {
    const pair = wordLanguagePair(word);
    if (pair.learningLanguage === pair.nativeLanguage) return;
    const key = `${pair.learningLanguage}|${pair.nativeLanguage}`;
    const current = pairs.get(key) || { ...pair, count: 0 };
    current.count += 1;
    pairs.set(key, current);
  });

  return [...pairs.values()].flatMap((pair) => [
    {
      key: `${pair.learningLanguage}>${pair.nativeLanguage}|${pair.learningLanguage}|${pair.nativeLanguage}`,
      ...pair,
      promptLanguage: pair.learningLanguage,
      answerLanguage: pair.nativeLanguage,
      promptField: 'term',
      answerField: 'translation',
    },
    {
      key: `${pair.nativeLanguage}>${pair.learningLanguage}|${pair.learningLanguage}|${pair.nativeLanguage}`,
      ...pair,
      promptLanguage: pair.nativeLanguage,
      answerLanguage: pair.learningLanguage,
      promptField: 'translation',
      answerField: 'term',
    },
  ]);
}

function wordMatchesQuizDirection(word, direction) {
  if (!direction || !hasUsableQuizTranslation(word)) return false;
  const pair = wordLanguagePair(word);
  return pair.learningLanguage === direction.learningLanguage && pair.nativeLanguage === direction.nativeLanguage;
}

function quizCardContent(card, direction) {
  const prompt = direction?.promptField === 'translation' ? card.translation : card.term;
  const answer = direction?.answerField === 'translation' ? card.translation : card.term;
  const alternatives = direction?.answerField === 'translation'
    ? [answer, ...String(answer || '').split(/[;,|]/)]
    : [answer];
  return {
    prompt,
    answer,
    acceptedAnswers: [...new Set(alternatives.map((value) => normalizeQuizAnswer(value, direction?.answerLanguage || 'vi')).filter(Boolean))],
  };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function Button({ children, variant = 'primary', className = '', loading = false, icon: Icon, ...props }) {
  return (
    <button {...props} className={`button button--${variant} ${className}`.trim()} disabled={loading || props.disabled}>
      {loading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : Icon ? <Icon size={18} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

function LoadingScreen() {
  return (
    <main className="splash-screen" aria-busy="true" aria-label="Đang mở LingoBloom">
      <div className="brand-mark brand-mark--large"><Flower2 aria-hidden="true" /></div>
      <div className="splash-title">LingoBloom</div>
      <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>
      <p>Đang chuẩn bị góc học của bạn…</p>
    </main>
  );
}

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`} aria-label="LingoBloom">
      <span className="brand-mark"><Flower2 aria-hidden="true" /></span>
      {!compact && <span>Lingo<span>Bloom</span></span>}
    </div>
  );
}

function AuthScreen({ config, error, loading, onDemo, onGoogle }) {
  const googleReady = Boolean(config.googleOAuthConfigured);
  const demoReady = config.demoMode !== false;
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Giới thiệu LingoBloom">
        <Logo />
        <div className="auth-copy">
          <span className="eyebrow"><Sparkles size={16} /> Mỗi ngày một chút</span>
          <h1>Cho vốn từ của bạn<br /><em>nở hoa.</em></h1>
          <p>Lưu từ mới, ghi nhớ cấu trúc và ôn lại đúng lúc — trong một góc học thật dịu dàng.</p>
        </div>
        <div className="word-cloud" aria-hidden="true">
          <span className="word-cloud__one">serendipity <small>/ˌser.ənˈdɪp.ə.ti/</small></span>
          <span className="word-cloud__two">gentle</span>
          <span className="word-cloud__three">bloom ✿</span>
          <span className="word-cloud__four">こんにちは</span>
        </div>
        <p className="auth-quote">“Học từ vựng không cần vội. Chỉ cần đều.”</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo"><Logo /></div>
          <span className="auth-card__petal">✿</span>
          <h2>Chào bạn quay lại!</h2>
          <p>Đăng nhập để tiếp tục hành trình học ngôn ngữ.</p>

          {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}

          <Button
            variant="google"
            className="button--full"
            onClick={onGoogle}
            disabled={!googleReady || loading}
            aria-describedby={!googleReady ? 'google-help' : undefined}
          >
            <span className="google-g" aria-hidden="true">G</span>
            Tiếp tục với Google
          </Button>

          {!googleReady && (
            <div id="google-help" className="demo-notice">
              <span className="demo-notice__icon"><CircleHelp size={18} /></span>
              <div>
                <strong>Google OAuth chưa được cấu hình</strong>
                <p>{demoReady ? 'Bạn vẫn có thể khám phá trọn vẹn giao diện với dữ liệu mẫu. Không cần tài khoản.' : 'Hãy cấu hình Google OAuth hoặc bật lại chế độ demo trên máy chủ.'}</p>
              </div>
            </div>
          )}

          <div className="auth-divider"><span>hoặc</span></div>

          <Button variant="soft" className="button--full" onClick={onDemo} loading={loading} disabled={!demoReady} icon={Sparkles}>
            {demoReady ? 'Vào chế độ demo' : 'Chế độ demo đã tắt'}
          </Button>
          {!googleReady && !demoReady && <div className="inline-alert inline-alert--error" role="alert">Ứng dụng cần cấu hình Google OAuth hoặc bật đăng nhập demo trên máy chủ.</div>}
          <p className="auth-fineprint">Khi tiếp tục, bạn đồng ý với Điều khoản và Chính sách quyền riêng tư của LingoBloom.</p>
        </div>
      </section>
    </main>
  );
}

function LanguageFields({ learningLanguage, nativeLanguage, onLearningChange, onNativeChange }) {
  return (
    <div className="language-fields">
      <label className="field">
        <span className="field__label">Ngôn ngữ bạn đang học</span>
        <span className="select-wrap">
          <select value={learningLanguage} onChange={(event) => onLearningChange(event.target.value)}>
            {LANGUAGES.map((language) => (
              <option value={language.code} key={`learn-${language.code}`}>{language.flag} {language.name}</option>
            ))}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </label>
      <div className="language-arrow" aria-hidden="true"><ArrowRight size={18} /></div>
      <label className="field">
        <span className="field__label">Ngôn ngữ mẹ đẻ</span>
        <span className="select-wrap">
          <select value={nativeLanguage} onChange={(event) => onNativeChange(event.target.value)}>
            {LANGUAGES.map((language) => (
              <option value={language.code} key={`native-${language.code}`}>{language.flag} {language.name}</option>
            ))}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </label>
    </div>
  );
}

function LanguageOnboarding({ user, onSave, saving, error }) {
  const [learningLanguage, setLearningLanguage] = useState(userLanguage(user, 'learningLanguage', 'en'));
  const [nativeLanguage, setNativeLanguage] = useState(userLanguage(user, 'nativeLanguage', 'vi'));
  const sameLanguage = learningLanguage === nativeLanguage;

  async function submit(event) {
    event.preventDefault();
    if (!sameLanguage) {
      try { await onSave({ learningLanguage, nativeLanguage }); }
      catch { /* Parent state renders the validation/server error. */ }
    }
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-orb onboarding-orb--one" />
      <div className="onboarding-orb onboarding-orb--two" />
      <form className="onboarding-card" onSubmit={submit}>
        <Logo />
        <div className="onboarding-illustration" aria-hidden="true">
          <span>あ</span><span>Hello</span><span>안녕</span>
        </div>
        <span className="eyebrow"><Languages size={16} /> Cá nhân hoá góc học</span>
        <h1>Bạn muốn học ngôn ngữ nào?</h1>
        <p>Chọn cặp ngôn ngữ để LingoBloom sắp xếp từ mới và gợi ý phù hợp hơn.</p>
        <LanguageFields
          learningLanguage={learningLanguage}
          nativeLanguage={nativeLanguage}
          onLearningChange={setLearningLanguage}
          onNativeChange={setNativeLanguage}
        />
        {sameLanguage && <div className="field-error" role="alert">Hai ngôn ngữ cần khác nhau.</div>}
        {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
        <Button type="submit" className="button--full" loading={saving} disabled={sameLanguage} icon={ArrowRight}>
          Bắt đầu học
        </Button>
        <p className="onboarding-note">Bạn có thể thay đổi lựa chọn này bất cứ lúc nào.</p>
      </form>
    </main>
  );
}

function Avatar({ user, size = 'normal' }) {
  return user.avatarUrl ? (
    <img className={`avatar avatar--${size}`} src={user.avatarUrl} alt="" />
  ) : (
    <span className={`avatar avatar--${size}`} aria-hidden="true">{initials(user.name)}</span>
  );
}

function AppShell({ currentPage, setCurrentPage, user, children, onOpenProfile }) {
  const learning = languageByCode(userLanguage(user, 'learningLanguage', 'en'));
  const native = languageByCode(userLanguage(user, 'nativeLanguage', 'vi'));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="side-nav" aria-label="Điều hướng chính">
          {NAV_ITEMS.map(({ id, label, icon: Icon, primary }) => (
            <button
              type="button"
              key={id}
              className={`side-nav__item ${currentPage === id ? 'is-active' : ''} ${primary ? 'side-nav__item--add' : ''}`}
              aria-current={currentPage === id ? 'page' : undefined}
              onClick={() => setCurrentPage(id)}
            >
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar-profile" onClick={onOpenProfile} aria-label="Mở hồ sơ và cài đặt">
          <Avatar user={user} />
          <span><strong>{user.name || 'Bạn học Bloom'}</strong><small>{learning.flag} {learning.name}</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <Logo compact />
          <button type="button" className="language-pill" onClick={onOpenProfile} aria-label="Mở cài đặt ngôn ngữ">
            <span>{learning.flag}</span><ArrowRight size={14} /><span>{native.flag}</span>
          </button>
          <button type="button" className="avatar-button" onClick={onOpenProfile} aria-label="Mở hồ sơ">
            <Avatar user={user} size="small" />
          </button>
        </header>
        <main id="main-content" className="main-content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {NAV_ITEMS.map(({ id, shortLabel, icon: Icon, primary }) => (
          <button
            type="button"
            key={id}
            className={`${currentPage === id ? 'is-active' : ''} ${primary ? 'bottom-nav__add' : ''}`}
            aria-current={currentPage === id ? 'page' : undefined}
            aria-label={shortLabel}
            onClick={() => setCurrentPage(id)}
          >
            <span className="bottom-nav__icon"><Icon size={primary ? 24 : 21} aria-hidden="true" /></span>
            <small>{shortLabel}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function PageTop({ eyebrow, title, description, action }) {
  return (
    <header className="page-top">
      <div>
        {eyebrow && <span className="page-top__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

function StatCard({ icon: Icon, value, label, note, tone = 'pink' }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__icon"><Icon size={20} aria-hidden="true" /></span>
      <div><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</div>
    </article>
  );
}

function EmptyState({ icon: Icon = BookOpen, title, description, action }) {
  return (
    <div className="empty-state">
      <span><Icon size={28} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function Dashboard({ user, words, structures, stats, loading, onNavigate }) {
  const dueCount = [...words, ...structures].filter(dueForReview).length;
  const learning = languageByCode(userLanguage(user, 'learningLanguage', 'en'));
  const recent = [...words.map((item) => ({ ...item, kind: 'word' })), ...structures.map((item) => ({ ...item, kind: 'structure' }))]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 4);

  return (
    <div className="page page--dashboard">
      <PageTop
        eyebrow={`${learning.flag} ${learning.name}`}
        title={`${greeting()}, ${(user.name || 'bạn').split(' ')[0]}!`}
        description="Hôm nay mình cùng học thêm một chút nhé."
      />

      <section className="review-hero">
        <div className="review-hero__copy">
          <span className="review-hero__label"><Sparkles size={15} /> Phiên ôn hôm nay</span>
          <h2>{dueCount ? `${dueCount} thẻ đang đợi bạn` : 'Bạn đã hoàn thành rồi!'}</h2>
          <p>{dueCount ? 'Chỉ khoảng 5 phút để giữ mạch ghi nhớ.' : 'Thêm vài từ mới để khu vườn tiếp tục nở hoa.'}</p>
          <Button variant="white" onClick={() => onNavigate(dueCount ? 'review' : 'add')} icon={dueCount ? Layers3 : Plus}>
            {dueCount ? 'Ôn ngay' : 'Thêm từ mới'}
          </Button>
        </div>
        <div className="review-hero__art" aria-hidden="true">
          <div className="hero-card hero-card--back">gentle</div>
          <div className="hero-card hero-card--front"><Flower2 /><strong>{Math.min(100, stats?.averageMastery || 0)}%</strong><span>đã ghi nhớ</span></div>
          <span className="hero-spark hero-spark--one">✦</span>
          <span className="hero-spark hero-spark--two">✿</span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span>Nhịp học của bạn</span><h2>Một tuần thật đều đặn</h2></div></div>
        {loading ? (
          <div className="stat-grid" aria-busy="true"><div className="skeleton skeleton--stat" /><div className="skeleton skeleton--stat" /><div className="skeleton skeleton--stat" /><div className="skeleton skeleton--stat" /></div>
        ) : (
          <div className="stat-grid">
            <StatCard icon={Flame} value={`${stats?.streak ?? 0} ngày`} label="Chuỗi học" note="Tiếp tục nhé!" tone="coral" />
            <StatCard icon={BookOpen} value={stats?.totalWords ?? words.length} label="Từ đã lưu" note={`+${words.filter((word) => new Date(word.createdAt).getTime() > Date.now() - 604800000).length} tuần này`} tone="pink" />
            <StatCard icon={Target} value={stats?.reviewedToday ?? 0} label="Đã ôn hôm nay" note="Đang tiến bộ" tone="violet" />
            <StatCard icon={Trophy} value={`${stats?.averageMastery ?? 0}%`} label="Mức ghi nhớ" note="Tất cả thẻ" tone="mint" />
          </div>
        )}
      </section>

      <div className="dashboard-columns">
        <section className="section-block">
          <div className="section-heading"><div><span>Lối tắt</span><h2>Bạn muốn làm gì?</h2></div></div>
          <div className="quick-grid">
            <button type="button" className="quick-card quick-card--word" onClick={() => onNavigate('add', 'word')}>
              <span><Plus size={22} /></span><strong>Thêm từ</strong><small>Ghi nhanh từ vừa gặp</small><ChevronRight size={18} />
            </button>
            <button type="button" className="quick-card quick-card--structure" onClick={() => onNavigate('add', 'structure')}>
              <span><FileText size={22} /></span><strong>Thêm cấu trúc</strong><small>Lưu mẫu câu hữu ích</small><ChevronRight size={18} />
            </button>
            <button type="button" className="quick-card quick-card--import" onClick={() => onNavigate('add', 'import')}>
              <span><UploadCloud size={22} /></span><strong>Nhập danh sách</strong><small>Từ CSV hoặc TXT</small><ChevronRight size={18} />
            </button>
            <button type="button" className="quick-card quick-card--lookup" onClick={() => onNavigate('add', 'dictionary')}>
              <span><Search size={22} /></span><strong>Tra từ điển</strong><small>Tìm và lưu ngay</small><ChevronRight size={18} />
            </button>
          </div>
        </section>

        <section className="section-block recent-block">
          <div className="section-heading section-heading--inline"><div><span>Vừa thêm</span><h2>Từ & cấu trúc mới</h2></div><button type="button" onClick={() => onNavigate('library')}>Xem tất cả</button></div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((item) => (
                <article className="recent-item" key={`${item.kind}-${item.id}`}>
                  <span className="recent-item__icon">{item.kind === 'word' ? languageByCode(item.learningLanguage || 'en').flag : <FileText size={18} />}</span>
                  <div><strong>{item.term || item.pattern}</strong><p>{item.translation || item.meaning || 'Chưa có nghĩa'}</p></div>
                  {item.bookmarked && <Bookmark className="is-filled" size={17} aria-label="Đã đánh dấu" />}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Chưa có mục nào" description="Từ mới đầu tiên của bạn sẽ xuất hiện ở đây." action={<Button variant="soft" onClick={() => onNavigate('add')}>Thêm ngay</Button>} />
          )}
        </section>
      </div>
    </div>
  );
}

const ADD_TABS = [
  { id: 'word', label: 'Từ vựng', icon: BookOpen },
  { id: 'structure', label: 'Cấu trúc', icon: FileText },
  { id: 'import', label: 'Nhập file', icon: UploadCloud },
  { id: 'dictionary', label: 'Từ điển', icon: Search },
];

function AddHub({ user, initialTab, onWordCreated, onStructureCreated, onImported, notify }) {
  const [tab, setTab] = useState(initialTab || 'word');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  return (
    <div className="page page--narrow">
      <PageTop title="Gieo thêm từ mới" description="Lưu một từ, một cấu trúc hay nhập cả danh sách — theo cách tiện nhất cho bạn." />
      <div className="tab-bar tab-bar--add" role="tablist" aria-label="Cách thêm nội dung">
        {ADD_TABS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            key={id}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
          ><Icon size={18} aria-hidden="true" /><span>{label}</span></button>
        ))}
      </div>
      <section className="form-card">
        {tab === 'word' && <WordForm user={user} onCreated={onWordCreated} notify={notify} />}
        {tab === 'structure' && <StructureForm user={user} onCreated={onStructureCreated} notify={notify} />}
        {tab === 'import' && <ImportForm user={user} onImported={onImported} />}
        {tab === 'dictionary' && <DictionaryLookup user={user} onCreated={onWordCreated} notify={notify} />}
      </section>
    </div>
  );
}

function FormIntro({ icon: Icon, title, description }) {
  return (
    <div className="form-intro">
      <span><Icon size={22} aria-hidden="true" /></span>
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
  );
}

function TextField({ label, hint, multiline = false, ...props }) {
  const id = props.id || props.name;
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}{props.required && <b aria-hidden="true"> *</b>}</span>
      <Input id={id} {...props} />
      {hint && <small className="field__hint">{hint}</small>}
    </label>
  );
}

function normalizedText(value, locale = 'vi') {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(locale);
}

function isSelectableDictionaryCandidate(item) {
  const term = normalizedText(item?.term);
  return Boolean(term && item?.selectable !== false && (item?.selectionToken || String(item?.id || '').startsWith('demo-dictionary-')));
}

function hasUsableQuizTranslation(item) {
  const term = normalizedText(item?.term);
  const translation = normalizedText(item?.translation);
  const comparableTerm = term.replace(/[.,!?…;:]+$/u, '');
  const comparableTranslation = translation.replace(/[.,!?…;:]+$/u, '');
  if (!term || !translation || comparableTerm === comparableTranslation) return false;
  const placeholder = translation.replace(/[.!?…]+$/u, '');
  return !/^(chưa (có|thêm) nghĩa|không có nghĩa|no (translation|definition)|translation unavailable|unknown|pending|n\/a|[-–—])$/i.test(placeholder);
}

function WordForm(props) {
  const [mode, setMode] = useState('dictionary');
  return (
    <div>
      <div className="word-entry-mode" role="group" aria-label="Cách thêm từ vựng">
        <button type="button" className={mode === 'dictionary' ? 'is-active' : ''} aria-pressed={mode === 'dictionary'} onClick={() => setMode('dictionary')}>
          <Search size={17} aria-hidden="true" /> Gợi ý từ điển
        </button>
        <button type="button" className={mode === 'manual' ? 'is-active' : ''} aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>
          <FileText size={17} aria-hidden="true" /> Nhập từ/cụm từ
        </button>
      </div>
      {mode === 'dictionary' ? <DictionaryWordForm {...props} /> : <ManualWordForm {...props} />}
    </div>
  );
}

const EMPTY_MANUAL_WORD = {
  term: '',
  translation: '',
  pronunciation: '',
  partOfSpeech: '',
  example: '',
  notes: '',
};

function ManualWordForm({ user, onCreated, notify }) {
  const [fields, setFields] = useState({ ...EMPTY_MANUAL_WORD });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField(name, value) {
    setFields((current) => ({ ...current, [name]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    const term = fields.term.trim();
    const translation = fields.translation.trim();
    if (!term || !translation) {
      setError('Hãy điền cả từ/cụm từ và nghĩa. Các ô còn lại có thể bỏ trống.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.createWord({
        ...fields,
        term,
        translation,
        pronunciation: fields.pronunciation.trim(),
        partOfSpeech: fields.partOfSpeech.trim(),
        example: fields.example.trim(),
        notes: fields.notes.trim(),
        language: userLanguage(user, 'learningLanguage', 'en'),
        nativeLanguage: userLanguage(user, 'nativeLanguage', 'vi'),
        source: 'manual',
      });
      onCreated(created);
      setFields({ ...EMPTY_MANUAL_WORD });
      notify(`Đã thêm “${created.term}” vào thư viện.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="manual-word-form">
      <FormIntro icon={FileText} title="Nhập từ hoặc cụm từ" description="Phù hợp với cụm từ, thành ngữ hoặc nội dung không có trong từ điển. Chỉ từ/cụm từ và nghĩa là bắt buộc." />
      <div className="manual-word-grid">
        <TextField label="Từ hoặc cụm từ" name="term" value={fields.term} onChange={(event) => updateField('term', event.target.value)} maxLength="200" required placeholder="Ví dụ: auf jeden Fall" autoFocus />
        <TextField label="Nghĩa" name="translation" value={fields.translation} onChange={(event) => updateField('translation', event.target.value)} maxLength="1000" required placeholder="Ví dụ: trong mọi trường hợp, chắc chắn" />
        <TextField label="Phiên âm (không bắt buộc)" name="pronunciation" value={fields.pronunciation} onChange={(event) => updateField('pronunciation', event.target.value)} maxLength="300" placeholder="Ví dụ: /aʊ̯f ˈjeːdn̩ fal/" />
        <TextField label="Từ loại (không bắt buộc)" name="partOfSpeech" value={fields.partOfSpeech} onChange={(event) => updateField('partOfSpeech', event.target.value)} maxLength="80" placeholder="Ví dụ: cụm trạng từ" />
        <TextField label="Ví dụ (không bắt buộc)" name="example" value={fields.example} onChange={(event) => updateField('example', event.target.value)} maxLength="3000" multiline placeholder="Ví dụ sử dụng trong câu" />
        <TextField label="Ghi chú (không bắt buộc)" name="notes" value={fields.notes} onChange={(event) => updateField('notes', event.target.value)} maxLength="5000" multiline placeholder="Mẹo nhớ hoặc ngữ cảnh riêng của bạn" />
      </div>
      {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
      <div className="form-actions"><Button type="submit" loading={saving} icon={Plus}>Lưu vào thư viện</Button></div>
    </form>
  );
}

function DictionaryWordForm({ user, onCreated, notify }) {
  const learningLanguage = userLanguage(user, 'learningLanguage', 'en');
  const nativeLanguage = userLanguage(user, 'nativeLanguage', 'vi');
  const [query, setQuery] = useState('');
  const [meaningQuery, setMeaningQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestSequence = useRef(0);
  const listboxId = 'word-dictionary-suggestions';
  const trimmedQuery = query.trim();
  const trimmedMeaning = meaningQuery.trim();

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (selected || trimmedQuery.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setSearched(false);
      setActiveIndex(-1);
      return undefined;
    }

    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const found = await api.suggestDictionary(
          trimmedQuery,
          { learningLanguage, nativeLanguage },
          trimmedMeaning,
        );
        if (requestSequence.current !== sequence) return;
        const usable = found.filter(isSelectableDictionaryCandidate);
        setSuggestions(usable);
        setActiveIndex(usable.length ? 0 : -1);
        setSearched(true);
      } catch (caught) {
        if (requestSequence.current !== sequence) return;
        setSuggestions([]);
        setActiveIndex(-1);
        setSearched(true);
        setError(caught.message);
      } finally {
        if (requestSequence.current === sequence) setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [learningLanguage, nativeLanguage, selected, trimmedMeaning, trimmedQuery]);

  function changeQuery(value) {
    setQuery(value);
    setSelected(null);
    setError('');
  }

  function changeMeaning(value) {
    setMeaningQuery(value);
    setSelected(null);
    setError('');
  }

  function chooseSuggestion(item) {
    setSelected(item);
    setQuery(item.term);
    setSuggestions([]);
    setActiveIndex(-1);
    setError('');
  }

  function handleInputKeyDown(event) {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseSuggestion(suggestions[Math.max(0, activeIndex)]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected) {
      setError('Hãy chọn một gợi ý từ từ điển trước khi lưu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.importDictionary(selected, { learningLanguage, nativeLanguage });
      onCreated(created);
      setQuery('');
      setMeaningQuery('');
      setSelected(null);
      setSuggestions([]);
      setSearched(false);
      notify(`Đã thêm “${created.term}” vào thư viện.`);
    } catch (caught) {
      setError(caught.message);
      const code = caught.payload?.error?.code || '';
      if (['INVALID_DICTIONARY_SELECTION', 'DICTIONARY_SELECTION_EXPIRED', 'DICTIONARY_SELECTION_NOT_VERIFIED'].includes(code)) {
        setSelected(null);
        setSearched(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="word-typeahead-form">
      <FormIntro icon={BookOpen} title="Thêm từ bằng từ điển" description="Gõ từ đang học và có thể thêm nghĩa bạn muốn để tìm đúng từ nhanh hơn." />
      <div className="word-typeahead">
        <label className="field" htmlFor="word-typeahead-input">
          <span className="field__label">Từ bạn muốn thêm <b aria-hidden="true">*</b></span>
          <span className="typeahead-input-wrap">
            <Search size={19} aria-hidden="true" />
            <input
              id="word-typeahead-input"
              type="text"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ví dụ: resilient"
              autoComplete="off"
              autoFocus
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(!selected && suggestions.length)}
              aria-controls={listboxId}
              aria-activedescendant={activeIndex >= 0 ? `word-suggestion-${activeIndex}` : undefined}
              aria-describedby="word-typeahead-help"
            />
            {loading && <LoaderCircle className="spin" size={18} aria-label="Đang tìm gợi ý" />}
          </span>
          <small className="field__hint" id="word-typeahead-help">
            {languageByCode(learningLanguage).name} → {languageByCode(nativeLanguage).name} · Gõ ít nhất 2 ký tự.
          </small>
        </label>

        <label className="field typeahead-meaning-hint" htmlFor="word-meaning-hint">
          <span className="field__label">Nghĩa bạn muốn <small>(không bắt buộc)</small></span>
          <input
            id="word-meaning-hint"
            type="text"
            value={meaningQuery}
            onChange={(event) => changeMeaning(event.target.value)}
            placeholder={`Ví dụ bằng ${languageByCode(nativeLanguage).name}: cùng nhau`}
            autoComplete="off"
          />
          <small className="field__hint">Hệ thống dùng nghĩa này để ưu tiên từ phù hợp; từ vẫn được xác thực trước khi lưu.</small>
        </label>

        {!selected && suggestions.length > 0 && (
          <div className="typeahead-menu" id={listboxId} role="listbox" aria-label="Gợi ý từ từ điển">
            {suggestions.map((item, index) => (
              <button
                type="button"
                id={`word-suggestion-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={activeIndex === index ? 'is-active' : ''}
                key={`${item.dictionaryEntryIndex ?? index}-${item.term}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseSuggestion(item)}
              >
                <span><strong>{item.term}</strong>{item.pronunciation && <small>{item.pronunciation}</small>}</span>
                <span className="typeahead-meaning">
                  <small>Nghĩa {languageByCode(nativeLanguage).name}</small>
                  <b>{item.translation || 'Chưa tải được nghĩa xem trước'}</b>
                </span>
                {item.partOfSpeech && <em>{item.partOfSpeech}</em>}
              </button>
            ))}
          </div>
        )}

        <div className="typeahead-status" role="status" aria-live="polite">
          {!selected && loading && <span><LoaderCircle className="spin" size={16} /> Đang tìm trong từ điển…</span>}
          {!selected && !loading && searched && !error && !suggestions.length && <span><Search size={16} /> Chưa có gợi ý phù hợp. Hãy kiểm tra chính tả hoặc thử từ khác.</span>}
          {!selected && !loading && !searched && trimmedQuery.length < 2 && <span><Sparkles size={16} /> Gợi ý sẽ xuất hiện khi bạn bắt đầu gõ.</span>}
        </div>

        {selected && (
          <article className="typeahead-selected" aria-label="Từ đã chọn">
            <span className="typeahead-selected__check"><Check size={18} aria-hidden="true" /></span>
            <div>
              <div><strong>{selected.term}</strong>{selected.pronunciation && <small>{selected.pronunciation}</small>}{selected.partOfSpeech && <em>{selected.partOfSpeech}</em>}</div>
              <p>{selected.translation || 'Nghĩa và phiên âm sẽ được tự động bổ sung khi lưu.'}</p>
              {selected.example && <q>{selected.example}</q>}
            </div>
            <button type="button" aria-label="Bỏ lựa chọn" onClick={() => changeQuery(query)}><X size={18} /></button>
          </article>
        )}
      </div>
      {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
      <div className="form-actions"><Button type="submit" loading={saving} disabled={!selected} icon={Plus}>Lưu từ đã chọn</Button></div>
    </form>
  );
}

function StructureForm({ user, onCreated, notify }) {
  const initial = { pattern: '', meaning: '', example: '', notes: '' };
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const created = await api.createStructure({
        ...form,
        learningLanguage: userLanguage(user, 'learningLanguage', 'en'),
        nativeLanguage: userLanguage(user, 'nativeLanguage', 'vi'),
      });
      onCreated(created); setForm(initial); notify('Đã lưu cấu trúc mới.');
    } catch (caught) { setError(caught.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit}>
      <FormIntro icon={FileText} title="Thêm một cấu trúc câu" description="Ghi lại công thức và một ví dụ thật gần với cách bạn dùng." />
      <TextField name="pattern" label="Cấu trúc" placeholder="Ví dụ: be used to + V-ing" value={form.pattern} onChange={(e) => update('pattern', e.target.value)} required autoFocus />
      <TextField name="meaning" label="Ý nghĩa / cách dùng" placeholder="Quen với việc gì" value={form.meaning} onChange={(e) => update('meaning', e.target.value)} required />
      <TextField name="structureExample" label="Câu ví dụ" placeholder="I am used to waking up early." value={form.example} onChange={(e) => update('example', e.target.value)} multiline rows="3" />
      <TextField name="structureNotes" label="Ghi chú" placeholder="Điểm dễ nhầm hoặc biến thể của cấu trúc…" value={form.notes} onChange={(e) => update('notes', e.target.value)} multiline rows="3" />
      {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
      <div className="form-actions"><Button type="submit" loading={loading} icon={Plus}>Lưu cấu trúc</Button></div>
    </form>
  );
}

function ImportForm({ user, onImported }) {
  const inputRef = useRef(null);
  const [kind, setKind] = useState('words');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function selectFile(candidate) {
    setError(''); setResult(null);
    if (!candidate) return;
    if (!/\.(csv|txt)$/i.test(candidate.name)) {
      setFile(null); setError('Vui lòng chọn file CSV hoặc TXT.'); return;
    }
    if (candidate.size > 2 * 1024 * 1024) {
      setFile(null); setError('File cần nhỏ hơn 2 MB.'); return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const response = await api.importFile(file, {
        type: kind,
        learningLanguage: userLanguage(user, 'learningLanguage', 'en'),
        nativeLanguage: userLanguage(user, 'nativeLanguage', 'vi'),
      });
      const imported = Number(response?.imported ?? response?.count ?? response?.items?.length ?? 0);
      setResult({ imported, skipped: Number(response?.skipped || 0), kind });
      await onImported(kind);
    } catch (caught) { setError(caught.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <FormIntro icon={UploadCloud} title="Nhập danh sách" description="Thêm từ vựng hoặc cấu trúc câu từ file CSV và TXT, tối đa 2 MB." />
      <div className="import-kind" role="group" aria-label="Loại nội dung cần nhập">
        <button type="button" className={kind === 'words' ? 'is-active' : ''} aria-pressed={kind === 'words'} onClick={() => { setKind('words'); setResult(null); }}>Từ vựng</button>
        <button type="button" className={kind === 'structures' ? 'is-active' : ''} aria-pressed={kind === 'structures'} onClick={() => { setKind('structures'); setResult(null); }}>Cấu trúc câu</button>
      </div>
      <div
        role="button"
        tabIndex="0"
        className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}
      >
        <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => selectFile(event.target.files[0])} tabIndex="-1" aria-hidden="true" />
        <span className="drop-zone__icon"><UploadCloud size={28} /></span>
        {file ? <><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB · Chạm để chọn file khác</small></> : <><strong>Chọn file hoặc kéo thả vào đây</strong><small>CSV, TXT · tối đa 2 MB</small></>}
      </div>

      <div className="import-guide">
        <div><span>1</span><p><strong>Cột bắt buộc</strong><br />{kind === 'words' ? 'word, translation' : 'pattern, meaning'}</p></div>
        <div><span>2</span><p><strong>Cột tuỳ chọn</strong><br />example, notes</p></div>
      </div>
      <div className="code-sample" aria-label="Ví dụ nội dung file">
        {kind === 'words' ? <>
          <span>word,translation,example</span>
          <code>gentle,dịu dàng,Be gentle with yourself.</code>
          <code>bloom,nở hoa,Flowers bloom in spring.</code>
        </> : <>
          <span>pattern,meaning,example</span>
          <code>be used to + V-ing,quen với việc gì,I am used to waking up early.</code>
          <code>It takes + time + to V,mất bao lâu để làm gì,It takes ten minutes to walk.</code>
        </>}
      </div>
      {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
      <div className="import-result" aria-live="polite">
        {result && <div className="inline-alert inline-alert--success"><Check size={18} />Đã nhập {result.imported} {result.kind === 'structures' ? 'cấu trúc' : 'từ'}{result.skipped ? `, bỏ qua ${result.skipped} dòng` : ''}.</div>}
      </div>
      <div className="form-actions"><Button type="button" onClick={submit} disabled={!file} loading={loading} icon={UploadCloud}>Nhập vào thư viện</Button></div>
    </div>
  );
}

function DictionaryLookup({ user, onCreated, notify }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState('');

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(''); setSearched(true);
    try {
      const found = await api.lookupDictionary(query.trim(), {
        learningLanguage: userLanguage(user, 'learningLanguage', 'en'),
        nativeLanguage: userLanguage(user, 'nativeLanguage', 'vi'),
      });
      setResults(found.filter(isSelectableDictionaryCandidate));
    } catch (caught) { setError(caught.message); setResults([]); }
    finally { setLoading(false); }
  }

  async function addResult(item) {
    setAddingId(item.id); setError('');
    try {
      const created = await api.importDictionary(item, {
        learningLanguage: userLanguage(user, 'learningLanguage', 'en'),
        nativeLanguage: userLanguage(user, 'nativeLanguage', 'vi'),
      });
      onCreated(created); notify(`Đã lưu “${created.term}” từ từ điển.`);
    } catch (caught) { setError(caught.message); }
    finally { setAddingId(''); }
  }

  return (
    <div>
      <FormIntro icon={Search} title="Tra từ điển" description="Chọn kết quả đã xác thực; hệ thống sẽ tự bổ sung nghĩa, phiên âm và ví dụ khi lưu." />
      <form className="dictionary-search" onSubmit={search} role="search">
        <label className="search-field search-field--large">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Từ cần tra</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập từ cần tra…" />
        </label>
        <Button type="submit" loading={loading}>Tra từ</Button>
      </form>
      <p className="dictionary-pair"><Languages size={16} /> {languageByCode(userLanguage(user, 'learningLanguage', 'en')).name} → {languageByCode(userLanguage(user, 'nativeLanguage', 'vi')).name}</p>
      {error && <div className="inline-alert inline-alert--error" role="alert"><CircleAlert size={18} />{error}</div>}
      <div aria-live="polite">
        {loading ? <div className="result-skeleton"><div className="skeleton" /><div className="skeleton" /></div> : results.length ? (
          <div className="dictionary-results">
            {results.map((item, index) => (
              <article className="dictionary-result" key={`${item.id}-${index}`}>
                <div className="dictionary-result__top"><div><h3>{item.term}</h3>{item.pronunciation && <span>{item.pronunciation}</span>}</div>{item.partOfSpeech && <small>{item.partOfSpeech}</small>}</div>
                <div className="dictionary-edit">
                  <span>Nghĩa từ từ điển</span>
                  <p>{item.translation || 'Nghĩa sẽ được tự động bổ sung khi lưu.'}</p>
                </div>
                {item.example && <blockquote>{item.example}</blockquote>}
                <Button variant="soft" onClick={() => addResult(item)} loading={addingId === item.id} icon={Plus}>Lưu vào thư viện</Button>
              </article>
            ))}
          </div>
        ) : searched && !error ? <EmptyState icon={Search} title="Chưa tìm thấy kết quả" description="Thử kiểm tra chính tả hoặc tìm một từ khác nhé." /> : (
          <div className="lookup-placeholder"><span>dictionary</span><p>Một kết quả rõ nghĩa đang chờ từ bạn.</p></div>
        )}
      </div>
    </div>
  );
}

function LibraryPage({ words, structures, loading, onToggleBookmark, onDelete, onNavigate }) {
  const searchRef = useRef(null);
  const [kind, setKind] = useState('words');
  const [query, setQuery] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [busyId, setBusyId] = useState('');
  const items = kind === 'words' ? words : structures;
  const filtered = items.filter((item) => {
    const haystack = kind === 'words'
      ? `${item.term} ${item.translation} ${item.example}`
      : `${item.pattern} ${item.meaning} ${item.example}`;
    return haystack.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')) && (!bookmarkedOnly || item.bookmarked);
  });

  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  async function toggle(item) {
    setBusyId(item.id);
    await onToggleBookmark(kind === 'words' ? 'word' : 'structure', item).catch(() => {});
    setBusyId('');
  }

  return (
    <div className="page">
      <PageTop title="Thư viện của bạn" description={`${words.length} từ vựng · ${structures.length} cấu trúc câu`} action={<Button icon={Plus} onClick={() => onNavigate('add')}>Thêm mới</Button>} />
      <div className="library-toolbar">
        <div className="tab-bar" role="tablist" aria-label="Loại nội dung">
          <button type="button" role="tab" aria-selected={kind === 'words'} className={kind === 'words' ? 'is-active' : ''} onClick={() => setKind('words')}>Từ vựng <small>{words.length}</small></button>
          <button type="button" role="tab" aria-selected={kind === 'structures'} className={kind === 'structures' ? 'is-active' : ''} onClick={() => setKind('structures')}>Cấu trúc <small>{structures.length}</small></button>
        </div>
        <div className="library-filters">
          <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Tìm trong thư viện</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm từ, nghĩa hoặc ví dụ…" /><kbd>⌘ K</kbd></label>
          <button type="button" className={`filter-button ${bookmarkedOnly ? 'is-active' : ''}`} aria-label={bookmarkedOnly ? 'Hiện tất cả mục' : 'Chỉ hiện mục đã lưu'} aria-pressed={bookmarkedOnly} onClick={() => setBookmarkedOnly((value) => !value)}><Bookmark size={18} aria-hidden="true" /> <span>Đã lưu</span></button>
        </div>
      </div>

      {loading ? (
        <div className="library-list" aria-busy="true"><div className="skeleton skeleton--row" /><div className="skeleton skeleton--row" /><div className="skeleton skeleton--row" /></div>
      ) : filtered.length ? (
        <div className="library-list" aria-live="polite">
          {filtered.map((item) => (
            <article className="library-card" key={`${kind}-${item.id}`}>
              <div className="library-card__main">
                <span className="library-card__language">{kind === 'words' ? languageByCode(item.learningLanguage || 'en').flag : <FileText size={19} />}</span>
                <div className="library-card__content">
                  <div className="library-card__title">
                    <h2>{kind === 'words' ? item.term : item.pattern}</h2>
                    {kind === 'words' && item.pronunciation && <span>{item.pronunciation}</span>}
                    {kind === 'words' && item.partOfSpeech && <small>{item.partOfSpeech}</small>}
                  </div>
                  <p>{kind === 'words' ? item.translation : item.meaning}</p>
                  {(item.example || item.notes) && (
                    <details>
                      <summary>Ví dụ & ghi chú <ChevronDown size={15} /></summary>
                      {item.example && <blockquote>{item.example}</blockquote>}
                      {item.notes && <p className="library-card__note">{item.notes}</p>}
                    </details>
                  )}
                </div>
              </div>
              <div className="library-card__meta">
                <span className="mastery-mini"><i style={{ '--mastery': `${Math.max(0, Math.min(100, item.mastery || 0))}%` }} />{Math.round(item.mastery || 0)}%</span>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <div className="library-card__actions">
                <button
                  type="button"
                  className={`icon-button ${item.bookmarked ? 'is-bookmarked' : ''}`}
                  aria-label={item.bookmarked ? 'Bỏ đánh dấu' : 'Đánh dấu'}
                  aria-pressed={Boolean(item.bookmarked)}
                  disabled={busyId === item.id}
                  onClick={() => toggle(item)}
                ><Bookmark size={19} /></button>
                <button type="button" className="icon-button icon-button--danger" aria-label={`Xóa ${kind === 'words' ? item.term : item.pattern}`} onClick={() => onDelete(kind === 'words' ? 'word' : 'structure', item)}><Trash2 size={18} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={bookmarkedOnly ? Bookmark : Search}
          title={query || bookmarkedOnly ? 'Không có kết quả phù hợp' : kind === 'words' ? 'Chưa có từ vựng nào' : 'Chưa có cấu trúc nào'}
          description={query || bookmarkedOnly ? 'Thử bỏ bớt bộ lọc hoặc tìm bằng từ khoá khác.' : 'Thêm mục đầu tiên để bắt đầu xây thư viện của riêng bạn.'}
          action={!query && !bookmarkedOnly ? <Button variant="soft" onClick={() => onNavigate('add', kind === 'words' ? 'word' : 'structure')} icon={Plus}>Thêm ngay</Button> : undefined}
        />
      )}
    </div>
  );
}

function ReviewPage({ words, structures, onReviewed, onNavigate }) {
  const allDeck = useMemo(() => [
    ...words.map((item) => ({ ...item, reviewType: 'word' })),
    ...structures.map((item) => ({ ...item, reviewType: 'structure' })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [words, structures]);
  const quizDirections = useMemo(() => buildQuizDirections(words), [words]);
  const [reviewStyle, setReviewStyle] = useState('flashcard');
  const [quizDirectionKey, setQuizDirectionKey] = useState('');
  const activeQuizDirection = quizDirections.find((direction) => direction.key === quizDirectionKey) || quizDirections[0] || null;
  const modeDeck = useMemo(() => (
    reviewStyle === 'typed'
      ? allDeck.filter((item) => item.reviewType === 'word' && wordMatchesQuizDirection(item, activeQuizDirection))
      : allDeck
  ), [activeQuizDirection, allDeck, reviewStyle]);
  const dueDeck = useMemo(() => modeDeck.filter(dueForReview), [modeDeck]);
  const [deck, setDeck] = useState([]);
  const [choosing, setChoosing] = useState(true);
  const [range, setRange] = useState('due');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(dueDeck.map(reviewCardKey)));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [message, setMessage] = useState('');
  const [sessionStyle, setSessionStyle] = useState('flashcard');
  const [sessionDirection, setSessionDirection] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [typedResult, setTypedResult] = useState(null);
  const selectionTouched = useRef(false);
  const typedSubmission = useRef('');
  const card = deck[index];
  const typedContent = card && sessionStyle === 'typed' ? quizCardContent(card, sessionDirection) : null;

  useEffect(() => {
    if (!quizDirections.length) {
      setQuizDirectionKey('');
      if (reviewStyle === 'typed') setReviewStyle('flashcard');
      return;
    }
    if (!quizDirections.some((direction) => direction.key === quizDirectionKey)) {
      setQuizDirectionKey(quizDirections[0].key);
    }
  }, [quizDirectionKey, quizDirections, reviewStyle]);

  useEffect(() => {
    if (!selectionTouched.current && choosing) setSelectedKeys(new Set(dueDeck.map(reviewCardKey)));
  }, [dueDeck, choosing]);

  useEffect(() => {
    const available = new Set(allDeck.map(reviewCardKey));
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [allDeck]);

  const rangeDeck = useMemo(
    () => modeDeck.filter((item) => createdWithinReviewRange(item, range, customFrom, customTo)),
    [modeDeck, range, customFrom, customTo],
  );
  const visibleDeck = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('vi');
    return rangeDeck.filter((item) => {
      if (reviewStyle === 'flashcard' && typeFilter !== 'all' && item.reviewType !== typeFilter) return false;
      if (!needle) return true;
      const text = item.reviewType === 'word'
        ? `${item.term || ''} ${item.translation || ''}`
        : `${item.pattern || ''} ${item.meaning || ''}`;
      return text.toLocaleLowerCase('vi').includes(needle);
    });
  }, [rangeDeck, reviewStyle, search, typeFilter]);

  const selectedVisibleCount = visibleDeck.filter((item) => selectedKeys.has(reviewCardKey(item))).length;
  const selectedCount = modeDeck.filter((item) => selectedKeys.has(reviewCardKey(item))).length;
  const invalidCustomRange = range === 'custom' && customFrom && customTo && customFrom > customTo;

  function toggleCard(item) {
    selectionTouched.current = true;
    const key = reviewCardKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function selectRangeFrom(candidateDeck, nextRange = range, nextFrom = customFrom, nextTo = customTo) {
    const eligible = candidateDeck.filter((item) => createdWithinReviewRange(item, nextRange, nextFrom, nextTo));
    setSelectedKeys(new Set(eligible.map(reviewCardKey)));
  }

  function chooseReviewStyle(nextStyle) {
    if (nextStyle === 'typed' && !activeQuizDirection) return;
    selectionTouched.current = true;
    setReviewStyle(nextStyle);
    setTypeFilter(nextStyle === 'typed' ? 'word' : 'all');
    const candidateDeck = nextStyle === 'typed'
      ? allDeck.filter((item) => item.reviewType === 'word' && wordMatchesQuizDirection(item, activeQuizDirection))
      : allDeck;
    selectRangeFrom(candidateDeck);
  }

  function chooseQuizDirection(nextKey) {
    const nextDirection = quizDirections.find((direction) => direction.key === nextKey);
    if (!nextDirection) return;
    selectionTouched.current = true;
    setQuizDirectionKey(nextKey);
    const candidateDeck = allDeck.filter((item) => item.reviewType === 'word' && wordMatchesQuizDirection(item, nextDirection));
    selectRangeFrom(candidateDeck);
  }

  function chooseRange(nextRange, nextFrom = customFrom, nextTo = customTo) {
    selectionTouched.current = true;
    setRange(nextRange);
    selectRangeFrom(modeDeck, nextRange, nextFrom, nextTo);
  }

  function changeCustomFrom(value) {
    setCustomFrom(value);
    chooseRange('custom', value, customTo);
  }

  function changeCustomTo(value) {
    setCustomTo(value);
    chooseRange('custom', customFrom, value);
  }

  function selectVisible() {
    selectionTouched.current = true;
    setSelectedKeys((current) => {
      const next = new Set(current);
      visibleDeck.forEach((item) => next.add(reviewCardKey(item)));
      return next;
    });
  }

  function clearVisible() {
    selectionTouched.current = true;
    setSelectedKeys((current) => {
      const next = new Set(current);
      visibleDeck.forEach((item) => next.delete(reviewCardKey(item)));
      return next;
    });
  }

  function clearAll() {
    selectionTouched.current = true;
    setSelectedKeys(new Set());
  }

  function startReview() {
    if (invalidCustomRange) return;
    const selectedDeck = modeDeck
      .filter((item) => selectedKeys.has(reviewCardKey(item)))
      .map((item) => ({ ...item }));
    if (!selectedDeck.length) return;
    setDeck(selectedDeck);
    setSessionStyle(reviewStyle);
    setSessionDirection(reviewStyle === 'typed' ? { ...activeQuizDirection } : null);
    setIndex(0);
    setFlipped(false);
    setTypedAnswer('');
    setTypedResult(null);
    typedSubmission.current = '';
    setFinished(false);
    setReviewedCount(0);
    setMessage('');
    setChoosing(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseAnotherDeck() {
    const currentDue = modeDeck.filter(dueForReview);
    selectionTouched.current = true;
    setSelectedKeys(new Set(currentDue.map(reviewCardKey)));
    setRange('due');
    setTypeFilter('all');
    setSearch('');
    setDeck([]);
    setIndex(0);
    setFlipped(false);
    setTypedAnswer('');
    setTypedResult(null);
    typedSubmission.current = '';
    setFinished(false);
    setReviewedCount(0);
    setMessage('');
    setChoosing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exitActiveReview() {
    if (submitting) return;
    const savedMessage = reviewedCount
      ? `${reviewedCount} kết quả đã lưu vẫn được giữ.`
      : 'Bạn chưa có kết quả nào được lưu.';
    if (!window.confirm(`Thoát phiên ôn hiện tại?\n\n${savedMessage}`)) return;

    // A typed answer is saved as soon as feedback is shown. Keep only cards that
    // have not been submitted so returning to the setup cannot review one twice
    // by accident. A flashcard at the current index is always still ungraded.
    const firstUnreviewedIndex = index + (sessionStyle === 'typed' && typedResult ? 1 : 0);
    const remainingKeys = deck.slice(firstUnreviewedIndex).map(reviewCardKey);
    selectionTouched.current = true;
    setSelectedKeys(new Set(remainingKeys));
    setDeck([]);
    setIndex(0);
    setFlipped(false);
    setTypedAnswer('');
    setTypedResult(null);
    typedSubmission.current = '';
    setFinished(false);
    setReviewedCount(0);
    setMessage('');
    setSessionDirection(null);
    setChoosing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function rate(rating) {
    if (!card || submitting) return;
    setSubmitting(true); setMessage('Đang lưu kết quả…');
    try {
      const result = await api.submitReview({ id: card.id, type: card.reviewType, rating });
      await onReviewed(card, rating, result?.item);
      const nextCount = reviewedCount + 1;
      setReviewedCount(nextCount);
      if (index + 1 >= deck.length) {
        setFinished(true); setMessage(`Đã hoàn thành ${nextCount} thẻ.`);
      } else {
        setIndex((value) => value + 1); setFlipped(false); setMessage('Đã lưu. Chuyển sang thẻ tiếp theo.');
      }
    } catch (error) { setMessage(error.message); }
    finally { setSubmitting(false); }
  }

  async function submitTypedAnswer(event) {
    event.preventDefault();
    if (!card || !typedContent || typedResult || submitting || !typedAnswer.trim()) return;
    const submissionKey = reviewCardKey(card);
    if (typedSubmission.current === submissionKey) return;
    typedSubmission.current = submissionKey;
    const submittedAnswer = typedAnswer.trim();
    const normalized = normalizeQuizAnswer(submittedAnswer, sessionDirection?.answerLanguage || 'vi');
    const correct = typedContent.acceptedAnswers.includes(normalized);
    const rating = correct ? 'good' : 'again';
    setSubmitting(true);
    setMessage('Đang chấm và lưu kết quả…');
    try {
      const result = await api.submitReview({ id: card.id, type: 'word', rating });
      await onReviewed(card, rating, result?.item);
      setTypedResult({ correct, submittedAnswer });
      setReviewedCount((count) => count + 1);
      setMessage(correct ? 'Chính xác! Kết quả đã được lưu.' : 'Chưa đúng. Xem đáp án rồi chuyển sang câu tiếp theo.');
    } catch (error) {
      typedSubmission.current = '';
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function advanceTypedQuiz() {
    if (!typedResult || submitting) return;
    if (index + 1 >= deck.length) {
      setFinished(true);
      setMessage(`Đã hoàn thành ${reviewedCount} thẻ.`);
    } else {
      setIndex((value) => value + 1);
      setTypedAnswer('');
      setTypedResult(null);
      typedSubmission.current = '';
      setMessage('');
    }
  }

  if (!allDeck.length) {
    return (
      <div className="page page--review">
        <PageTop title="Ôn tập flashcard" description="Tự chọn những từ và cấu trúc bạn muốn luyện lại." />
        <EmptyState icon={BookOpen} title="Chưa có thẻ để ôn" description="Thêm từ vựng hoặc cấu trúc đầu tiên, rồi quay lại tạo bộ flashcard của riêng bạn." action={<Button variant="soft" onClick={() => onNavigate('add')} icon={Plus}>Thêm thẻ mới</Button>} />
      </div>
    );
  }

  if (choosing) {
    const ranges = [
      { id: 'due', label: `Đến hạn (${dueDeck.length})` },
      { id: 'today', label: 'Thêm hôm nay' },
      { id: '7days', label: '7 ngày gần đây' },
      { id: '30days', label: '30 ngày gần đây' },
      { id: 'all', label: 'Từ trước đến giờ' },
      { id: 'custom', label: 'Tự chọn ngày' },
    ];
    const promptLanguages = [...new Set(quizDirections.map((direction) => direction.promptLanguage))];
    const answerDirections = quizDirections.filter((direction) => direction.promptLanguage === activeQuizDirection?.promptLanguage);
    const duplicateAnswerLanguages = new Set(answerDirections
      .filter((direction, index, list) => list.some((candidate, candidateIndex) => (
        candidateIndex !== index && candidate.answerLanguage === direction.answerLanguage
      )))
      .map((direction) => direction.answerLanguage));

    return (
      <div className="page page--review">
        <PageTop
          eyebrow="Tạo phiên ôn"
          title="Bạn muốn ôn những thẻ nào?"
          description="Lọc theo lúc đã thêm, sau đó chọn chính xác từng từ hoặc cấu trúc. Thẻ mới chưa đến hạn vẫn có thể ôn ngay."
        />

        <section className="review-builder" aria-labelledby="review-range-title">
          <div className="review-builder__section">
            <div className="review-builder__heading">
              <div><span className="review-step">1</span><div><h2>Chọn cách ôn</h2><p>Giữ flashcard quen thuộc hoặc tự gõ đáp án để kiểm tra trí nhớ.</p></div></div>
            </div>
            <div className="review-style-options" role="radiogroup" aria-label="Cách ôn tập">
              <button type="button" role="radio" aria-checked={reviewStyle === 'flashcard'} className={reviewStyle === 'flashcard' ? 'is-active' : ''} onClick={() => chooseReviewStyle('flashcard')}>
                <span><Layers3 size={21} /></span><div><strong>Flashcard</strong><small>Lật thẻ và tự đánh giá mức độ nhớ.</small></div>
              </button>
              <button type="button" role="radio" aria-checked={reviewStyle === 'typed'} className={reviewStyle === 'typed' ? 'is-active' : ''} disabled={!quizDirections.length} aria-describedby={!quizDirections.length ? 'typed-mode-help' : undefined} onClick={() => chooseReviewStyle('typed')}>
                <span><Brain size={21} /></span><div><strong>Tự gõ đáp án</strong><small>Chỉ dùng từ vựng có đủ từ và nghĩa.</small></div>
              </button>
            </div>
            {!quizDirections.length && <p className="review-mode-help" id="typed-mode-help"><CircleAlert size={15} /> Cần ít nhất một từ có nghĩa hợp lệ để dùng chế độ tự gõ.</p>}

            {reviewStyle === 'typed' && activeQuizDirection && (
              <div className="quiz-direction" aria-label="Hướng câu hỏi và trả lời">
                <label>
                  <span>Ngôn ngữ câu hỏi</span>
                  <span className="select-wrap"><select value={activeQuizDirection.promptLanguage} onChange={(event) => {
                    const direction = quizDirections.find((item) => item.promptLanguage === event.target.value);
                    if (direction) chooseQuizDirection(direction.key);
                  }}>{promptLanguages.map((code) => <option value={code} key={`prompt-${code}`}>{languageByCode(code).flag} {languageByCode(code).name}</option>)}</select><ChevronDown size={17} /></span>
                </label>
                <span className="quiz-direction__arrow" aria-hidden="true"><ArrowRight size={18} /></span>
                <label>
                  <span>Ngôn ngữ trả lời</span>
                  <span className="select-wrap"><select value={activeQuizDirection.key} onChange={(event) => {
                    const direction = answerDirections.find((item) => item.key === event.target.value);
                    if (direction) chooseQuizDirection(direction.key);
                  }}>{answerDirections.map((direction) => <option value={direction.key} key={direction.key}>
                    {languageByCode(direction.answerLanguage).flag} {languageByCode(direction.answerLanguage).name}
                    {duplicateAnswerLanguages.has(direction.answerLanguage)
                      ? ` · bộ ${languageByCode(direction.learningLanguage).name} → ${languageByCode(direction.nativeLanguage).name} (${direction.count})`
                      : ''}
                  </option>)}</select><ChevronDown size={17} /></span>
                </label>
                <small>{activeQuizDirection.count} từ hợp lệ cho hướng này · Bộ thẻ sẽ được cố định khi bắt đầu.</small>
              </div>
            )}
          </div>

          <div className="review-builder__section">
            <div className="review-builder__heading">
              <div><span className="review-step">2</span><div><h2 id="review-range-title">Chọn thời điểm đã thêm</h2><p>Mặc định là các thẻ đang đến hạn ôn.</p></div></div>
            </div>
            <div className="review-range-tabs" role="group" aria-label="Lọc theo thời điểm thêm thẻ">
              {ranges.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={range === option.id ? 'is-active' : ''}
                  aria-pressed={range === option.id}
                  onClick={() => chooseRange(option.id)}
                >{option.label}</button>
              ))}
            </div>

            {range === 'custom' && (
              <div className="review-date-range">
                <label>Từ ngày<input type="date" value={customFrom} max={customTo || localDateInputValue()} onChange={(event) => changeCustomFrom(event.target.value)} /></label>
                <label>Đến ngày<input type="date" value={customTo} min={customFrom || undefined} max={localDateInputValue()} onChange={(event) => changeCustomTo(event.target.value)} /></label>
                <small>Để trống một đầu nếu bạn không muốn giới hạn mốc đó.</small>
              </div>
            )}
          </div>

          <div className="review-builder__section review-builder__section--cards">
            <div className="review-builder__heading review-builder__heading--selection">
              <div><span className="review-step">3</span><div><h2>Chọn từng thẻ</h2><p><strong>{selectedCount}</strong> thẻ đã chọn · {visibleDeck.length} thẻ đang hiện</p></div></div>
              {selectedCount > 0 && <button type="button" className="review-clear-all" onClick={clearAll}>Bỏ chọn tất cả</button>}
            </div>

            <div className="review-list-filters">
              <label className="review-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Tìm trong danh sách thẻ</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm từ hoặc nghĩa…" /></label>
              {reviewStyle === 'flashcard' ? <div className="review-type-tabs" role="group" aria-label="Loại thẻ">
                {[['all', 'Tất cả'], ['word', 'Từ vựng'], ['structure', 'Cấu trúc']].map(([id, label]) => <button type="button" key={id} className={typeFilter === id ? 'is-active' : ''} aria-pressed={typeFilter === id} onClick={() => setTypeFilter(id)}>{label}</button>)}
              </div> : <div className="review-word-only"><Brain size={16} /> Chế độ tự gõ chỉ dùng từ vựng</div>}
            </div>

            <div className="review-bulk-actions">
              <span aria-live="polite">Đã chọn {selectedVisibleCount}/{visibleDeck.length} thẻ đang hiện</span>
              <div><button type="button" onClick={selectVisible} disabled={!visibleDeck.length || selectedVisibleCount === visibleDeck.length}>Chọn tất cả đang hiện</button><button type="button" onClick={clearVisible} disabled={!selectedVisibleCount}>Bỏ chọn đang hiện</button></div>
            </div>

            {invalidCustomRange ? (
              <div className="review-list-empty" role="status"><CircleAlert size={20} /><div><strong>Khoảng ngày chưa hợp lệ</strong><span>Ngày bắt đầu cần đứng trước ngày kết thúc.</span></div></div>
            ) : visibleDeck.length ? (
              <div className="review-select-list" aria-label="Danh sách thẻ có thể ôn">
                {visibleDeck.map((item) => {
                  const key = reviewCardKey(item);
                  const checked = selectedKeys.has(key);
                  const title = item.reviewType === 'word' ? item.term : item.pattern;
                  const meaning = item.reviewType === 'word' ? item.translation : item.meaning;
                  return (
                    <label className={`review-select-card ${checked ? 'is-selected' : ''}`} key={key}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCard(item)} />
                      <span className="review-checkbox" aria-hidden="true">{checked && <Check size={14} />}</span>
                      <span className="review-select-card__copy"><strong>{title}</strong><span>{meaning}</span><small>{item.reviewType === 'word' ? 'Từ vựng' : 'Cấu trúc câu'} · {Number.isNaN(new Date(item.createdAt).getTime()) ? 'Không rõ ngày thêm' : `Thêm ${formatDate(item.createdAt)}`}{dueForReview(item) ? ' · Đến hạn' : ''}</small></span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="review-list-empty" role="status"><Search size={20} /><div><strong>Không có thẻ phù hợp</strong><span>Thử đổi mốc thời gian, loại thẻ hoặc từ khóa.</span></div></div>
            )}
          </div>

          <div className="review-start-bar">
            <div><strong>{selectedCount} thẻ</strong><span>{reviewStyle === 'typed' ? 'sẽ được hỏi theo hướng đã chọn' : 'sẽ được ôn trong phiên này'}</span></div>
            <Button onClick={startReview} disabled={!selectedCount || invalidCustomRange} icon={ArrowRight}>Bắt đầu ôn</Button>
          </div>
        </section>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="page page--review review-finish">
        <div className="celebration" aria-hidden="true"><span>✦</span><span>✿</span><span>✦</span></div>
        <span className="finish-icon"><Trophy size={34} /></span>
        <h1>Phiên ôn hoàn thành!</h1>
        <p>Bạn vừa chăm sóc <strong>{reviewedCount} thẻ</strong>. Một bước nhỏ nhưng thật đáng tự hào.</p>
        <div className="finish-actions"><Button onClick={chooseAnotherDeck} icon={Layers3}>Chọn bộ thẻ khác</Button><Button variant="soft" onClick={() => onNavigate('home')}>Về tổng quan</Button></div>
        <div className="sr-only" aria-live="polite">{message}</div>
      </div>
    );
  }

  return (
    <div className="page page--review">
      <button
        type="button"
        className="review-session-back"
        onClick={exitActiveReview}
        disabled={submitting}
        aria-label="Thoát phiên ôn và quay lại màn hình chọn thẻ"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        <span>Quay lại chọn thẻ</span>
      </button>
      <PageTop
        title={sessionStyle === 'typed' ? 'Tự gõ đáp án' : 'Ôn tập flashcard'}
        description={sessionStyle === 'typed'
          ? `${languageByCode(sessionDirection?.promptLanguage).name} → ${languageByCode(sessionDirection?.answerLanguage).name}. Mỗi câu chỉ được ghi nhận một lần.`
          : 'Nhớ nghĩa trước khi lật thẻ, rồi đánh giá thật đúng cảm nhận.'}
      />
      <div className="review-toolbar">
        <span>Thẻ {index + 1} / {deck.length}</span>
        <div className="progress-track"><i style={{ width: `${((index + (sessionStyle === 'typed' ? (typedResult ? 0.5 : 0) : (flipped ? 0.5 : 0))) / deck.length) * 100}%` }} /></div>
        <span>{Math.max(0, deck.length - index - 1)} còn lại</span>
      </div>

      {sessionStyle === 'typed' ? (
        <form className="typed-quiz" onSubmit={submitTypedAnswer}>
          <section className={`typed-quiz__card ${typedResult ? (typedResult.correct ? 'is-correct' : 'is-incorrect') : ''}`} aria-labelledby="typed-quiz-prompt">
            <span className="typed-quiz__badge"><Languages size={15} /> Câu hỏi · {languageByCode(sessionDirection?.promptLanguage).name}</span>
            <div className="typed-quiz__prompt">
              <small>{sessionDirection?.answerField === 'translation' ? 'Hãy gõ nghĩa tương ứng' : 'Hãy gõ từ tương ứng'}</small>
              <h2 id="typed-quiz-prompt">{typedContent?.prompt}</h2>
            </div>
            <label className="typed-quiz__answer" htmlFor={`typed-answer-${card.id}`}>
              <span>Trả lời bằng {languageByCode(sessionDirection?.answerLanguage).name}</span>
              <input
                key={card.id}
                id={`typed-answer-${card.id}`}
                value={typedAnswer}
                onChange={(event) => setTypedAnswer(event.target.value)}
                placeholder={`Nhập đáp án bằng ${languageByCode(sessionDirection?.answerLanguage).name}…`}
                autoComplete="off"
                autoCapitalize="none"
                disabled={Boolean(typedResult) || submitting}
                aria-invalid={typedResult ? !typedResult.correct : undefined}
                autoFocus
              />
            </label>

            {typedResult && (
              <div className={`typed-feedback ${typedResult.correct ? 'is-correct' : 'is-incorrect'}`} role="status" aria-live="polite">
                <span>{typedResult.correct ? <Check size={22} /> : <X size={22} />}</span>
                <div>
                  <strong>{typedResult.correct ? 'Chính xác!' : 'Chưa đúng lần này'}</strong>
                  {!typedResult.correct && <p>Bạn đã trả lời: <q>{typedResult.submittedAnswer}</q></p>}
                  <p>Đáp án: <b>{typedContent?.answer}</b></p>
                  {card.example && <small>{card.example}</small>}
                </div>
              </div>
            )}
          </section>

          {!typedResult ? (
            <Button type="submit" className="typed-quiz__action" loading={submitting} disabled={!typedAnswer.trim()} icon={Check}>Kiểm tra đáp án</Button>
          ) : (
            <Button type="button" className="typed-quiz__action" onClick={advanceTypedQuiz} icon={ArrowRight}>{index + 1 >= deck.length ? 'Hoàn thành' : 'Câu tiếp theo'}</Button>
          )}
        </form>
      ) : (<>
      <button
        type="button"
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Đang hiện mặt nghĩa. Nhấn để xem lại mặt từ.' : 'Đang hiện mặt từ. Nhấn để xem nghĩa.'}
      >
        <span className="flashcard__badge">{card.reviewType === 'word' ? 'TỪ VỰNG' : 'CẤU TRÚC CÂU'}</span>
        {!flipped ? (
          <span className="flashcard__side">
            <small>Bạn còn nhớ không?</small>
            <strong>{card.reviewType === 'word' ? card.term : card.pattern}</strong>
            {card.pronunciation && <em>{card.pronunciation}</em>}
            {card.partOfSpeech && <span className="part-pill">{card.partOfSpeech}</span>}
          </span>
        ) : (
          <span className="flashcard__side flashcard__side--answer">
            <small>Nghĩa & cách dùng</small>
            <strong>{card.reviewType === 'word' ? card.translation : card.meaning}</strong>
            {card.example && <q>{card.example}</q>}
            {card.notes && <em>{card.notes}</em>}
          </span>
        )}
        <span className="flashcard__hint"><RotateCcw size={15} /> Chạm để {flipped ? 'xem từ' : 'lật thẻ'}</span>
      </button>

      {!flipped ? (
        <Button variant="soft" className="reveal-button" onClick={() => setFlipped(true)} icon={Sparkles}>Hiện đáp án</Button>
      ) : (
        <div className="rating-panel">
          <p>Bạn nhớ từ này thế nào?</p>
          <div className="rating-grid">
            <button type="button" disabled={submitting} onClick={() => rate('again')}><span>Chưa nhớ</span><small>Sau 10 phút</small></button>
            <button type="button" disabled={submitting} onClick={() => rate('hard')}><span>Khó</span><small>Ngày mai</small></button>
            <button type="button" disabled={submitting} onClick={() => rate('good')}><span>Nhớ</span><small>3 ngày</small></button>
            <button type="button" disabled={submitting} onClick={() => rate('easy')}><span>Dễ</span><small>7 ngày</small></button>
          </div>
        </div>
      )}
      </>)}
      <div className="review-announcer" aria-live="polite">{message}</div>
    </div>
  );
}

function StatsPage({ stats, words, structures, loading }) {
  const weekly = stats?.weeklyReviews || stats?.weekly || [];
  const normalizedWeek = Array.from({ length: 7 }, (_, index) => {
    const row = weekly[index] || {};
    return { count: Number(row.count || row.reviews || 0), date: row.date || new Date(Date.now() - (6 - index) * 86400000).toISOString() };
  });
  const max = Math.max(1, ...normalizedWeek.map((item) => item.count));
  const all = [...words, ...structures];
  const buckets = {
    new: all.filter((item) => Number(item.mastery || 0) < 30).length,
    learning: all.filter((item) => Number(item.mastery || 0) >= 30 && Number(item.mastery || 0) < 80).length,
    mastered: all.filter((item) => Number(item.mastery || 0) >= 80).length,
  };

  return (
    <div className="page">
      <PageTop title="Tiến độ học tập" description="Nhìn lại những bước nhỏ bạn đã đi được cùng LingoBloom." />
      {loading ? <div className="stats-loading" aria-busy="true"><div className="skeleton skeleton--stat" /><div className="skeleton skeleton--chart" /></div> : (
        <>
          <div className="stat-grid stat-grid--stats">
            <StatCard icon={Flame} value={stats?.streak ?? 0} label="Ngày liên tiếp" tone="coral" />
            <StatCard icon={BookOpen} value={stats?.totalWords ?? words.length} label="Từ vựng" tone="pink" />
            <StatCard icon={FileText} value={stats?.totalStructures ?? structures.length} label="Cấu trúc" tone="violet" />
            <StatCard icon={Trophy} value={buckets.mastered} label="Đã thuộc" tone="mint" />
          </div>

          <div className="stats-layout">
            <section className="chart-card weekly-chart">
              <div className="section-heading section-heading--inline"><div><span>7 ngày qua</span><h2>Số thẻ đã ôn</h2></div><span className="chart-total">{normalizedWeek.reduce((sum, item) => sum + item.count, 0)} thẻ</span></div>
              <div className="bar-chart" aria-label="Biểu đồ số thẻ đã ôn trong 7 ngày">
                {normalizedWeek.map((item, index) => (
                  <div className="bar-column" key={`${item.date}-${index}`}>
                    <span className="bar-value">{item.count || ''}</span>
                    <i style={{ height: `${Math.max(item.count ? 12 : 3, (item.count / max) * 100)}%` }} />
                    <small>{new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(new Date(item.date)).replace('Th ', 'T')}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="chart-card mastery-card">
              <div className="section-heading"><div><span>Tổng thể</span><h2>Mức ghi nhớ</h2></div></div>
              <div className="donut-wrap">
                <div className="donut" style={{ '--percent': `${Math.max(0, Math.min(100, stats?.averageMastery || 0)) * 3.6}deg` }}><div><strong>{stats?.averageMastery ?? 0}%</strong><span>trung bình</span></div></div>
                <div className="legend">
                  <div><i className="legend-new" /><span>Mới học</span><strong>{buckets.new}</strong></div>
                  <div><i className="legend-learning" /><span>Đang học</span><strong>{buckets.learning}</strong></div>
                  <div><i className="legend-mastered" /><span>Đã thuộc</span><strong>{buckets.mastered}</strong></div>
                </div>
              </div>
            </section>
          </div>

          <section className="insight-card">
            <span><Brain size={25} /></span>
            <div><small>Gợi ý cho bạn</small><h2>Đều đặn quan trọng hơn thật nhiều</h2><p>Bạn đang giữ một nhịp học tốt. Một phiên ôn ngắn mỗi ngày giúp ký ức bền hơn một buổi học thật dài vào cuối tuần.</p></div>
          </section>
        </>
      )}
    </div>
  );
}

function ProfilePanel({ user, onClose, onSave, onLogout }) {
  const [learningLanguage, setLearningLanguage] = useState(userLanguage(user, 'learningLanguage', 'en'));
  const [nativeLanguage, setNativeLanguage] = useState(userLanguage(user, 'nativeLanguage', 'vi'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  async function save(event) {
    event.preventDefault();
    if (learningLanguage === nativeLanguage) return;
    setSaving(true); setError('');
    try { await onSave({ learningLanguage, nativeLanguage }); onClose(); }
    catch (caught) { setError(caught.message); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    const focusableSelector = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    panel?.querySelector(focusableSelector)?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll(focusableSelector)];
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" tabIndex="-1">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        <div className="profile-heading"><Avatar user={user} size="large" /><div><h2 id="profile-title">{user.name || 'Bạn học Bloom'}</h2><p>{user.email || 'Tài khoản demo'}</p>{user.isDemo && <span>Chế độ demo</span>}</div></div>
        <form onSubmit={save}>
          <h3>Ngôn ngữ học</h3>
          <LanguageFields learningLanguage={learningLanguage} nativeLanguage={nativeLanguage} onLearningChange={setLearningLanguage} onNativeChange={setNativeLanguage} />
          {learningLanguage === nativeLanguage && <div className="field-error">Hai ngôn ngữ cần khác nhau.</div>}
          {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
          <Button className="button--full" type="submit" loading={saving} disabled={learningLanguage === nativeLanguage}>Lưu thay đổi</Button>
        </form>
        <button type="button" className="logout-button" onClick={onLogout}><LogOut size={18} /> Đăng xuất</button>
      </section>
    </div>
  );
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return <div className="toast" role="status"><span><Check size={17} /></span><p>{message}</p><button type="button" onClick={onClose} aria-label="Đóng thông báo"><X size={16} /></button></div>;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [config, setConfig] = useState({ googleOAuthConfigured: false, demoMode: true });
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [currentPage, setCurrentPage] = useState('home');
  const [addTab, setAddTab] = useState('word');
  const [words, setWords] = useState([]);
  const [structures, setStructures] = useState([]);
  const [stats, setStats] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState('');

  const notify = useCallback((message) => setToast(message), []);
  const refreshStats = useCallback(() => api.getStats().then(setStats).catch(() => {}), []);

  const loadData = useCallback(async () => {
    setDataLoading(true); setDataError('');
    try {
      const [loadedWords, loadedStructures, loadedStats] = await Promise.all([
        api.getWords(), api.getStructures(), api.getStats(),
      ]);
      setWords(loadedWords); setStructures(loadedStructures); setStats(loadedStats);
    } catch (error) { setDataError(error.message || 'Chưa thể tải dữ liệu học tập.'); }
    finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    async function boot() {
      const appConfig = await api.getConfig();
      if (!active) return;
      setConfig(appConfig);
      const authParams = new URLSearchParams(window.location.search);
      const authFailure = authParams.get('error');
      if (authFailure) {
        const messages = {
          google_not_configured: 'Google OAuth chưa được cấu hình. Bạn có thể dùng chế độ demo.',
          google_login_failed: 'Đăng nhập Google chưa hoàn tất. Vui lòng thử lại hoặc dùng chế độ demo.',
        };
        setAuthError(messages[authFailure] || 'Đăng nhập Google chưa hoàn tất. Vui lòng thử lại.');
      }
      if (authFailure || authParams.has('success')) window.history.replaceState({}, document.title, '/');
      try {
        const sessionUser = await api.getMe();
        if (active && sessionUser) {
          setUser(sessionUser);
          if (sessionUser.onboardingCompleted === false || !userLanguage(sessionUser, 'learningLanguage', '') || !userLanguage(sessionUser, 'nativeLanguage', '')) setOnboarding(true);
        }
      } catch (error) {
        if (active && error.status && error.status !== 401) setAuthError('Phiên đăng nhập chưa thể khôi phục. Bạn có thể thử chế độ demo.');
      } finally { if (active) setBooting(false); }
    }
    boot();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (user && !onboarding) loadData(); }, [user?.id, onboarding, loadData]);

  function navigate(page, tab) {
    if (tab) setAddTab(tab);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDemoLogin() {
    setAuthLoading(true); setAuthError('');
    try {
      const demoUser = await api.loginDemo();
      setUser(demoUser);
      setOnboarding(demoUser.onboardingCompleted === false || !userLanguage(demoUser, 'learningLanguage', '') || !userLanguage(demoUser, 'nativeLanguage', ''));
    } catch (error) { setAuthError(error.message); }
    finally { setAuthLoading(false); }
  }

  function handleGoogleLogin() {
    if (!config.googleOAuthConfigured) return;
    window.location.assign(api.googleLoginUrl);
  }

  async function savePreferences(preferences) {
    setPreferenceLoading(true); setPreferenceError('');
    try {
      const updated = await api.updatePreferences(preferences);
      setUser((current) => ({ ...current, ...preferences, ...(updated?.id ? updated : {}) }));
      setOnboarding(false);
      notify('Đã lưu cặp ngôn ngữ của bạn.');
      return updated;
    } catch (error) { setPreferenceError(error.message); throw error; }
    finally { setPreferenceLoading(false); }
  }

  async function logout() {
    try { await api.logout(); }
    catch (error) { notify(error.message || 'Chưa thể đăng xuất. Vui lòng thử lại.'); return; }
    setProfileOpen(false); setUser(null); setWords([]); setStructures([]); setStats(null); setCurrentPage('home');
  }

  async function toggleBookmark(type, item) {
    try {
      const updated = type === 'word'
        ? await api.updateWord(item.id, { bookmarked: !item.bookmarked })
        : await api.updateStructure(item.id, { bookmarked: !item.bookmarked });
      const update = (current) => current.map((row) => row.id === item.id ? { ...row, ...updated, bookmarked: !item.bookmarked } : row);
      if (type === 'word') setWords(update); else setStructures(update);
      notify(item.bookmarked ? 'Đã bỏ đánh dấu.' : 'Đã thêm vào mục đã lưu.');
    } catch (error) { notify(error.message); throw error; }
  }

  async function deleteItem(type, item) {
    const label = type === 'word' ? item.term : item.pattern;
    if (!window.confirm(`Xóa “${label}” khỏi thư viện?`)) return;
    try {
      if (type === 'word') { await api.deleteWord(item.id); setWords((current) => current.filter((row) => row.id !== item.id)); }
      else { await api.deleteStructure(item.id); setStructures((current) => current.filter((row) => row.id !== item.id)); }
      refreshStats();
      notify('Đã xóa khỏi thư viện.');
    } catch (error) { notify(error.message); }
  }

  async function refreshAfterImport(kind) {
    if (kind === 'structures') setStructures(await api.getStructures());
    else setWords(await api.getWords());
    refreshStats();
  }

  async function reviewed(card, rating, serverItem) {
    const delta = { again: -12, hard: 5, good: 12, easy: 22 }[rating] || 0;
    const setter = card.reviewType === 'word' ? setWords : setStructures;
    const delayMs = { again: 10 * 60 * 1000, hard: 86400000, good: 3 * 86400000, easy: 7 * 86400000 }[rating] ?? 86400000;
    setter((current) => current.map((item) => item.id === card.id
      ? serverItem || {
        ...item,
        mastery: Math.max(0, Math.min(100, Number(item.mastery || 0) + delta)),
        nextReviewAt: new Date(Date.now() + delayMs).toISOString(),
      }
      : item));
    refreshStats();
  }

  if (booting) return <LoadingScreen />;
  if (!user) return <AuthScreen config={config} error={authError} loading={authLoading} onDemo={handleDemoLogin} onGoogle={handleGoogleLogin} />;
  if (onboarding) return <LanguageOnboarding user={user} onSave={savePreferences} saving={preferenceLoading} error={preferenceError} />;

  let pageContent;
  if (currentPage === 'library') pageContent = <LibraryPage words={words} structures={structures} loading={dataLoading} onToggleBookmark={toggleBookmark} onDelete={deleteItem} onNavigate={navigate} />;
  else if (currentPage === 'add') pageContent = <AddHub user={user} initialTab={addTab} notify={notify} onWordCreated={(item) => { setWords((current) => [item, ...current]); refreshStats(); }} onStructureCreated={(item) => { setStructures((current) => [item, ...current]); refreshStats(); }} onImported={refreshAfterImport} />;
  else if (currentPage === 'review') pageContent = <ReviewPage words={words} structures={structures} onReviewed={reviewed} onNavigate={navigate} />;
  else if (currentPage === 'stats') pageContent = <StatsPage stats={stats} words={words} structures={structures} loading={dataLoading} />;
  else pageContent = <Dashboard user={user} words={words} structures={structures} stats={stats} loading={dataLoading} onNavigate={navigate} />;

  return (
    <>
      <AppShell currentPage={currentPage} setCurrentPage={navigate} user={user} onOpenProfile={() => setProfileOpen(true)}>
        {dataError && <div className="global-error" role="alert"><CircleAlert size={19} /><div><strong>Chưa tải được toàn bộ dữ liệu</strong><p>{dataError}</p></div><Button variant="soft" onClick={loadData}>Thử lại</Button></div>}
        {pageContent}
      </AppShell>
      {profileOpen && <ProfilePanel user={user} onClose={() => setProfileOpen(false)} onSave={savePreferences} onLogout={logout} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
