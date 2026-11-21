import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Languages,
  MessageSquare,
  Send,
  Sparkles,
  Star,
  Swords,
  Trophy,
  User,
  Wand2,
} from 'lucide-react';
import { COURSE_SLIDES, INITIAL_QUIZ, INITIAL_SUBTITLES } from '../data/mockData';
import { askClassroomCopilot } from '../services/aiService';
import type { QuizQuestion, SubtitleEntry, UserRole } from '../types';

interface ClassroomPageProps {
  role: UserRole;
}

interface ChatMsg {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  anonymous?: boolean;
}

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export const ClassroomPage: React.FC<ClassroomPageProps> = ({ role }) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const currentSlide = COURSE_SLIDES[slideIdx];
  const [activeTab, setActiveTab] = useState<'copilot' | 'interact' | 'notes'>('copilot');

  // Bilingual Subtitles
  const [showBilingual, setShowBilingual] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>(INITIAL_SUBTITLES);
  const [selectedTerm, setSelectedTerm] = useState<{ word: string; definition: string } | null>(null);

  // AI Copilot Chat
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'init',
      sender: 'ai',
      text: `你好！我是你的 **AI 课堂副驾驶**，已实时关联当前课件 **《${COURSE_SLIDES[0].chapter}》**。点击下方快捷提问，或直接针对当前页代码/公式发问！`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Classroom Interaction
  const [quiz, setQuiz] = useState<QuizQuestion>(INITIAL_QUIZ);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [bossHp, setBossHp] = useState(42);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [danmakuInput, setDanmakuInput] = useState('');
  const [danmakus, setDanmakus] = useState<string[]>([
    '老师，栈帧回溯那步太形象了！',
    '请问 n=0 的时候是不是必须单独判断？',
    '已懂，冲刺课堂 BOSS！',
  ]);

  // AI Classroom Notes
  const [noteContent, setNoteContent] = useState(
    `# 《第3章 递归与调用栈》AI 课堂笔记\n\n## 一、核心知识摘要\n- **递归两要素**：① 递归出口（Base Case） ② 规模严格缩小的递归推进。\n- **系统调用栈（Call Stack）**：每次调用压入新栈帧（LIFO），命中出口后逐层回溯计算，空间复杂度 O(n)。\n- **记忆化优化**：使用 \`@lru_cache\` 可将斐波那契从 O(2^n) 降至 O(n)。\n\n## 二、我的课堂重点标记\n- [09:12:04] 写递归第一件事永远是确定递归出口（Base Case）。\n`
  );

  const handleSendQuestion = async (customText?: string) => {
    const q = (customText ?? input).trim();
    if (!q || streaming) return;
    setInput('');
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, sender: 'user', text: q, anonymous: isAnonymous };
    const aiId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: aiId, sender: 'ai', text: '正在结合当前课件上下文检索思考...' }]);
    setStreaming(true);

    await askClassroomCopilot(q, currentSlide, (chunk) => {
      setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: chunk } : m)));
    });
    setStreaming(false);
  };

  const toggleStarSubtitle = (id: string) => {
    setSubtitles((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const nextStar = !s.starred;
          if (nextStar) {
            setNoteContent((n) => `${n}\n- [${s.time}] ${s.zh}`);
          }
          return { ...s, starred: nextStar };
        }
        return s;
      })
    );
  };

  const handleSubmitQuiz = () => {
    if (selectedOption === null || quizSubmitted) return;
    setQuizSubmitted(true);
    setQuiz((prev) => {
      const nextStats = [...prev.stats];
      nextStats[selectedOption] += 1;
      return { ...prev, stats: nextStats };
    });
    if (selectedOption === quiz.correctIndex) {
      setBossHp((hp) => Math.max(0, hp - 12));
    }
  };

  const handleGenerateNewQuiz = () => {
    setQuiz({
      id: `q-${Date.now()}`,
      question: `【AI 基于第 ${currentSlide.pageNumber} 页实时生成】若递归函数缺少 Base Case（递归出口），在 Python 运行时最终会发生什么？`,
      options: [
        '自动返回 None 并正常结束',
        '触发 RecursionError（栈溢出异常）',
        '自动转为 for 循环执行',
        '编译阶段直接报错无法运行',
      ],
      correctIndex: 1,
      explanation: 'Python 调用栈深度存在保护上限（默认约 1000 层），无出口递归会持续压栈直至抛出 RecursionError。',
      stats: [2, 28, 3, 5],
      published: true,
    });
    setSelectedOption(null);
    setQuizSubmitted(false);
  };

  const handleRandomPick = () => {
    const roster = ['林致远', '苏念安', '陈明轩', '周雨桐', '赵子墨', '陆景行', '沈清欢'];
    setPickedStudent(roster[Math.floor(Math.random() * roster.length)]);
  };

  const handleExportNotes = () => {
    const blob = new Blob([noteContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EduMind_第3章递归与调用栈_AI课堂笔记.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalVotes = quiz.stats.reduce((a, b) => a + b, 0);
  const isMobileStudent = role === 'student';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className={`${isMobileStudent ? 'text-lg' : 'text-xl lg:text-2xl'} font-bold text-slate-900 flex items-center gap-2`}>
            <BookOpen className="w-5 h-5 text-sky-600" />
            AI 实时课堂
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              LIVE
            </span>
          </h1>
          {!isMobileStudent && (
            <p className="text-xs text-slate-500 mt-0.5">
              课件上下文 AI 副驾驶 · 中英双语术语字幕 · AI 实时出题与课堂 BOSS 协作 · 自动笔记生成
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {role === 'teacher' && (
            <button
              onClick={handleRandomPick}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold cursor-pointer"
            >
              随机点名 {pickedStudent ? `(${pickedStudent})` : ''}
            </button>
          )}
          <button
            onClick={() => setShowBilingual(!showBilingual)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer flex items-center gap-1 ${
              showBilingual
                ? 'bg-sky-50 text-sky-700 border-sky-300'
                : 'bg-white text-slate-500 border-sky-200'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            {showBilingual ? '双语字幕' : '仅中文'}
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${isMobileStudent ? '' : 'xl:grid-cols-12'} gap-4`}>
        {/* Left 7 cols */}
        <div className={`${isMobileStudent ? '' : 'xl:col-span-7'} space-y-4`}>
          <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3 bg-sky-50/90 border-b border-sky-200/80 flex items-center justify-between">
              <span className="text-xs font-bold text-sky-800">
                {currentSlide.chapter} · 第 {currentSlide.pageNumber} / {COURSE_SLIDES.length} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveTab('copilot');
                    handleSendQuestion(`请帮我通俗解释第 ${currentSlide.pageNumber} 页「${currentSlide.title}」的核心代码与易错点`);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <Sparkles className="w-3 h-3" /> 问 AI 这一页
                </button>
                <div className="flex items-center gap-1">
                  <button
                    disabled={slideIdx === 0}
                    onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                    className="p-1 rounded-lg bg-white hover:bg-sky-100 disabled:opacity-35 text-slate-700 border border-sky-200 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={slideIdx === COURSE_SLIDES.length - 1}
                    onClick={() => setSlideIdx((i) => Math.min(COURSE_SLIDES.length - 1, i + 1))}
                    className="p-1 rounded-lg bg-white hover:bg-sky-100 disabled:opacity-35 text-slate-700 border border-sky-200 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Slide Content */}
            <div className="p-6 bg-gradient-to-br from-white via-sky-50/35 to-blue-50/50 space-y-4 min-h-[380px]">
              <div>
                <h2 className="text-xl font-bold text-slate-900 leading-snug">{currentSlide.title}</h2>
                <p className="text-xs text-slate-500 mt-1">{currentSlide.subtitle}</p>
              </div>

              <ul className="space-y-2">
                {currentSlide.keyPoints.map((pt, idx) => (
                  <li key={idx} className="text-sm text-slate-700 flex items-start gap-2 leading-relaxed">
                    <span className="w-5 h-5 rounded-md bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              {currentSlide.formula && (
                <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-2.5 font-mono text-xs text-sky-900 font-semibold">
                  📐 核心关系：{currentSlide.formula}
                </div>
              )}

              {currentSlide.codeSnippet && (
                <pre className="rounded-xl bg-[#0d1f36] border border-sky-900/40 p-4 text-xs text-sky-100 font-mono overflow-x-auto leading-relaxed shadow-inner">
                  {currentSlide.codeSnippet}
                </pre>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">实时弹幕：</span>
                {danmakus.slice(-3).map((d, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-white border border-sky-200 text-slate-600 shadow-xs"
                  >
                    💬 {d}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Bilingual Subtitles */}
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Languages className="w-4 h-4 text-sky-600" />
                课堂实时双语字幕与术语高亮（点击标星自动存入 AI 笔记）
              </h3>
              <span className="text-[11px] text-emerald-600 font-medium">语音转写同步中</span>
            </div>

            {selectedTerm && (
              <div className="rounded-xl bg-sky-50 border border-sky-300 p-3 text-xs flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-sky-800">📖 术语解释 · {selectedTerm.word}：</span>
                  <span className="text-slate-700">{selectedTerm.definition}</span>
                </div>
                <button
                  onClick={() => setSelectedTerm(null)}
                  className="text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                >
                  关闭
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {subtitles.map((sub) => (
                <div
                  key={sub.id}
                  className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{sub.time}</span>
                      {sub.term && (
                        <button
                          onClick={() => setSelectedTerm(sub.term!)}
                          className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold hover:bg-sky-200 cursor-pointer"
                        >
                          术语：{sub.term.word}
                        </button>
                      )}
                    </div>
                    <p className="text-slate-800 leading-relaxed">{sub.zh}</p>
                    {showBilingual && <p className="text-slate-500 text-[11px]">{sub.en}</p>}
                  </div>
                  <button
                    onClick={() => toggleStarSubtitle(sub.id)}
                    title="标记重点并同步至 AI 课堂笔记"
                    className={`p-1.5 rounded-lg shrink-0 cursor-pointer ${
                      sub.starred ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-amber-500'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" fill={sub.starred ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 cols */}
        <div className={`${isMobileStudent ? '' : 'xl:col-span-5'} glass-panel rounded-2xl flex flex-col overflow-hidden ${isMobileStudent ? 'min-h-[460px]' : 'min-h-[600px]'}`}>
          <div className="grid grid-cols-3 border-b border-sky-200/80 bg-sky-50/70 p-1.5 gap-1">
            {[
              { id: 'copilot', label: 'AI 副驾驶', icon: Bot },
              { id: 'interact', label: '课堂互动', icon: Swords },
              { id: 'notes', label: 'AI 课堂笔记', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'copilot' && (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
              {role === 'teacher' && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs space-y-1">
                  <div className="font-bold text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    AI 实时归纳全班高频卡壳点（教师专属提醒）
                  </div>
                  <p className="text-slate-700">
                    过去 5 分钟内收到 <strong>9 条匿名提问</strong> 集中在「递归空间复杂度为何是 O(n)」，<strong>建议放慢节奏并用 3D 调用栈重讲 2 分钟</strong>。
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[380px]">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.sender === 'ai' && (
                      <div className="w-7 h-7 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-sky-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                        m.sender === 'user'
                          ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
                          : 'bg-sky-50/75 border border-sky-100 text-slate-700'
                      }`}
                    >
                      {m.anonymous && (
                        <span className="block text-[10px] text-sky-100 mb-1">🕵️ 匿名提问</span>
                      )}
                      {m.sender === 'user' ? m.text : renderRichText(m.text)}
                    </div>
                    {m.sender === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-sky-700" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  '为什么递归空间复杂度是 O(n)？',
                  '什么时候会触发栈溢出报错？',
                  '斐波那契怎么用记忆化优化？',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSendQuestion(q)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-medium cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-sky-100">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="accent-sky-600"
                    />
                    匿名向老师与 AI 提问
                  </label>
                  <span>已绑定上下文：P{currentSlide.pageNumber}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendQuestion()}
                    placeholder="输入你对本页课件或代码的疑问..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    disabled={streaming}
                    onClick={() => handleSendQuestion()}
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'interact' && (
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              <div className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 p-3.5 text-white space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-300" />
                    课堂 BOSS 协作挑战：递归迷宫守护者
                  </span>
                  <span className="font-mono text-amber-200 font-bold">HP {bossHp}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-300 to-rose-400 transition-all duration-500"
                    style={{ width: `${bossHp}%` }}
                  />
                </div>
                <div className="text-[11px] text-sky-50">
                  全班每答对 1 题对 BOSS 造成伤害，击败后全班解锁「递归通关徽章」！
                </div>
              </div>

              <div className="rounded-xl bg-sky-50/50 border border-sky-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-700">随堂即时检测</span>
                  {role === 'teacher' && (
                    <button
                      onClick={handleGenerateNewQuiz}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <Wand2 className="w-3 h-3" /> AI 按本页重新出题
                    </button>
                  )}
                </div>

                <p className="text-xs font-semibold text-slate-800 leading-relaxed">{quiz.question}</p>

                <div className="space-y-2">
                  {quiz.options.map((opt, idx) => {
                    const pct = totalVotes > 0 ? Math.round((quiz.stats[idx] / totalVotes) * 100) : 0;
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === quiz.correctIndex;
                    return (
                      <button
                        key={idx}
                        onClick={() => !quizSubmitted && setSelectedOption(idx)}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer relative overflow-hidden ${
                          quizSubmitted && isCorrect
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                            : quizSubmitted && isSelected && !isCorrect
                            ? 'border-rose-400 bg-rose-50 text-rose-900'
                            : isSelected
                            ? 'border-sky-500 bg-sky-100/70 text-sky-950 font-semibold'
                            : 'border-sky-100 bg-white text-slate-700 hover:border-sky-300'
                        }`}
                      >
                        {(quizSubmitted || role === 'teacher') && (
                          <div
                            className="absolute inset-y-0 left-0 bg-sky-200/45 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <div className="relative z-10 flex items-center justify-between">
                          <span>
                            {String.fromCharCode(65 + idx)}. {opt}
                          </span>
                          {(quizSubmitted || role === 'teacher') && (
                            <span className="font-mono text-[11px] text-slate-600 font-semibold">
                              {quiz.stats[idx]}人 ({pct}%)
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!quizSubmitted && role === 'student' && (
                  <button
                    disabled={selectedOption === null}
                    onClick={handleSubmitQuiz}
                    className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                  >
                    提交答案并攻击课堂 BOSS
                  </button>
                )}

                {(quizSubmitted || role === 'teacher') && (
                  <div className="rounded-lg bg-white border border-sky-100 p-2.5 text-[11px] text-slate-600">
                    <strong className="text-emerald-600">解析：</strong>
                    {quiz.explanation}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={danmakuInput}
                  onChange={(e) => setDanmakuInput(e.target.value)}
                  placeholder="发送一条课堂弹幕..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                />
                <button
                  onClick={() => {
                    if (!danmakuInput.trim()) return;
                    setDanmakus((d) => [...d, danmakuInput.trim()]);
                    setDanmakuInput('');
                  }}
                  className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> 发弹幕
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="flex-1 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">已融合课件 + 双语字幕重点（可自由编辑）</span>
                <button
                  onClick={handleExportNotes}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> 导出 Markdown
                </button>
              </div>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="flex-1 min-h-[420px] w-full p-3.5 rounded-xl bg-sky-50/50 border border-sky-200 text-xs text-slate-800 font-mono leading-relaxed focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
