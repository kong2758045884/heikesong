import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BrainCircuit,
  CheckCircle2,
  Copy,
  Download,
  Layers,
  Maximize2,
  MessageCircleHeart,
  Sparkles,
  X,
} from 'lucide-react';
import { generateTeacherStyleComment } from '../services/aiService';
import type { MistakeItem, UserRole } from '../types';

interface DiagnosticsAndAnalyticsPageProps {
  role: UserRole;
  mistakes: MistakeItem[];
  onResolveMistake: (mistakeId: string, nodeId: string) => void;
}

export const DiagnosticsAndAnalyticsPage: React.FC<DiagnosticsAndAnalyticsPageProps> = ({
  role,
  mistakes,
  onResolveMistake,
}) => {
  const [selectedId, setSelectedId] = useState(mistakes[0]?.id || 'm1');
  const selected = mistakes.find((m) => m.id === selectedId) || mistakes[0];

  const [pickedOpt, setPickedOpt] = useState<number | null>(null);
  const [checkedVariant, setCheckedVariant] = useState(false);

  const [projectionOpen, setProjectionOpen] = useState(false);
  const [showSocraticTip, setShowSocraticTip] = useState(true);

  const [commentStyle, setCommentStyle] = useState<'warm' | 'strict' | 'humorous'>('warm');
  const [catchphrase, setCatchphrase] = useState('同学好，咱们一步步来：');
  const [copiedKey, setCopiedKey] = useState('');
  const [activeTier, setActiveTier] = useState<'A' | 'B' | 'C'>('B');

  const generatedComment = generateTeacherStyleComment(
    commentStyle,
    '林致远',
    selected.errorDimension,
    catchphrase
  );

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  const handleVerifyVariant = () => {
    if (pickedOpt === null) return;
    setCheckedVariant(true);
    if (pickedOpt === selected.variantQuestion.correctIndex && !selected.resolved) {
      onResolveMistake(selected.id, selected.nodeId);
    }
  };

  const layeredHomework = {
    A: {
      title: 'A 组 · 基础巩固单（建议推送：薄弱组 11 人）',
      students: '陈明轩、赵子墨、王一凡、李思源 等 11 人',
      tasks: [
        '1. 补全递归求阶乘代码的 Base Case 分支，并手写 factorial(3) 的 3 层栈帧变化图。',
        '2. 观看 EduMind 3D 虚拟实验室《调用栈压栈与回溯》动画，记录最大栈深度与 n 的关系。',
      ],
    },
    B: {
      title: 'B 组 · 易错突破单（建议推送：需加强组 18 人）',
      students: '林致远、周雨桐、陆景行、沈清欢 等 18 人',
      tasks: [
        '1. 编写递归函数 list_sum(arr) 并对比「漏写 return」与「正确回溯」的报错差异。',
        '2. 给定二叉树 [A, B, C, D, E]，分别写出前序、中序、后序遍历输出序列并验证。',
      ],
    },
    C: {
      title: 'C 组 · 拔高拓展单（建议推送：掌握良好组 11 人）',
      students: '苏念安、顾言、许知夏 等 11 人',
      tasks: [
        '1. 使用显式列表栈（Iterative Stack）改写二叉树中序遍历，消除递归调用开销。',
        '2. 对比朴素斐波那契与 @lru_cache 记忆化递归在 n=35 时的耗时差异并撰写简评。',
      ],
    },
  };

  const handleExportLayered = () => {
    const md = `# EduMind AI 一键分层巩固作业单（第3章 递归与数据结构）\n\n${(['A', 'B', 'C'] as const)
      .map(
        (k) =>
          `## ${layeredHomework[k].title}\n- **推荐学生**：${layeredHomework[k].students}\n${layeredHomework[k].tasks.join('\n')}\n`
      )
      .join('\n')}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EduMind_ABC分层巩固作业单.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isMobileStudent = role === 'student';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={`${isMobileStudent ? 'text-lg' : 'text-2xl'} font-bold text-slate-900 flex items-center gap-2`}>
            <BrainCircuit className="w-5 h-5 text-sky-600" />
            {role === 'teacher'
              ? 'AI 作业诊断、分层巩固与教室投屏讲评中心'
              : 'AI 错题诊断与变式巩固'}
          </h1>
          {!isMobileStudent && (
            <p className="text-sm text-slate-500 mt-1">
              产出直接用于课堂与课后：脱敏错例大屏对比 + 教师风格评语 + A/B/C 分层巩固作业单
            </p>
          )}
        </div>

        {role === 'teacher' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setProjectionOpen(true)}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
            >
              <Maximize2 className="w-4 h-4" />
              进入教室脱敏投屏讲评模式
            </button>
            <button
              onClick={handleExportLayered}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> 导出 A/B/C 分层作业
            </button>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${isMobileStudent ? '' : 'xl:grid-cols-12'} gap-4`}>
        <div className={`${isMobileStudent ? '' : 'xl:col-span-4'} space-y-2.5`}>
          <div className="text-xs font-semibold text-slate-500 px-1">
            典型错题样本列表（点击查看 AI 四维诊断）
          </div>
          {mistakes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedId(m.id);
                setPickedOpt(null);
                setCheckedVariant(false);
              }}
              className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                selected.id === m.id
                  ? 'bg-sky-50 border-sky-500 shadow-md shadow-sky-500/10'
                  : 'glass-panel hover:border-sky-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-700">{m.nodeLabel}</span>
                {m.resolved ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    ✓ 已攻克
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                    {m.errorDimension}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">{m.question}</p>
            </button>
          ))}

          {role === 'teacher' && (
            <div className="glass-panel rounded-2xl p-4 space-y-3 border-sky-200">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MessageCircleHeart className="w-4 h-4 text-sky-600" />
                教师专属风格评语模板（可编辑）
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                {[
                  { id: 'warm', label: '暖心鼓励' },
                  { id: 'strict', label: '严谨规范' },
                  { id: 'humorous', label: '幽默拉近' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setCommentStyle(s.id as typeof commentStyle)}
                    className={`py-1.5 rounded-lg font-semibold border cursor-pointer ${
                      commentStyle === s.id
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-white border-sky-200 text-slate-600'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={catchphrase}
                onChange={(e) => setCatchphrase(e.target.value)}
                placeholder="输入老师平时爱用的口头禅前缀..."
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
              />
              <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3 text-xs text-slate-700 leading-relaxed">
                {generatedComment}
              </div>
              <button
                onClick={() => handleCopy(generatedComment, 'comment')}
                className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedKey === 'comment' ? '已复制到剪贴板 ✓' : '一键复制评语发给学生/家长'}
              </button>
            </div>
          )}
        </div>

        <div className={`${isMobileStudent ? '' : 'xl:col-span-8'} space-y-4`}>
          <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">{selected.question}</h2>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                {selected.errorDimension}
              </span>
            </div>

            <div className={`grid grid-cols-1 ${isMobileStudent ? '' : 'md:grid-cols-2'} gap-3`}>
              <div className="rounded-xl bg-rose-50/70 border border-rose-200 p-3.5 space-y-2">
                <div className="text-xs font-bold text-rose-700">❌ 匿名典型错解（已脱敏）</div>
                <pre className="text-xs font-mono text-rose-950 bg-white/80 rounded-lg p-3 border border-rose-100 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {selected.studentCode}
                </pre>
              </div>
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3.5 space-y-2">
                <div className="text-xs font-bold text-emerald-700">✅ 规范参考正解</div>
                <pre className="text-xs font-mono text-emerald-950 bg-white/80 rounded-lg p-3 border border-emerald-100 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {selected.correctCode}
                </pre>
              </div>
            </div>

            <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 space-y-2 text-xs leading-relaxed">
              <div className="font-bold text-sky-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-600" /> AI 深度错因解析
              </div>
              <p className="text-slate-700">{selected.aiDiagnosis}</p>
              <div className="pt-2 border-t border-sky-200 text-sky-900 font-medium">
                {selected.knowledgeSupplement}
              </div>
            </div>
          </div>

          {role === 'student' ? (
            <div className="glass-panel rounded-2xl p-5 space-y-4 border-sky-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  举一反三 · 变式巩固验证（答对将实时提升 3D 知识图谱掌握度）
                </h3>
                {selected.resolved && (
                  <span className="text-xs font-bold text-emerald-600">已验证掌握 · 图谱已更新 🎉</span>
                )}
              </div>

              <p className="text-xs text-slate-800 whitespace-pre-line font-semibold leading-relaxed">
                {selected.variantQuestion.prompt}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selected.variantQuestion.options.map((opt, idx) => {
                  const isCorrect = idx === selected.variantQuestion.correctIndex;
                  const isPicked = pickedOpt === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setPickedOpt(idx);
                        setCheckedVariant(false);
                      }}
                      className={`p-3 rounded-xl border text-left text-xs font-mono transition-all cursor-pointer ${
                        checkedVariant && isCorrect
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                          : checkedVariant && isPicked && !isCorrect
                          ? 'bg-rose-50 border-rose-400 text-rose-900'
                          : isPicked
                          ? 'bg-sky-100 border-sky-500 text-sky-950 font-semibold'
                          : 'bg-white border-sky-100 text-slate-700 hover:border-sky-300'
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}. {opt}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={pickedOpt === null}
                  onClick={handleVerifyVariant}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  提交变式验证
                </button>
                {checkedVariant && (
                  <span
                    className={`text-xs font-semibold ${
                      pickedOpt === selected.variantQuestion.correctIndex
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {pickedOpt === selected.variantQuestion.correctIndex
                      ? '🎉 完全正确！「3D 知识图谱」中该节点掌握度已自动提升至 82%（掌握良好）！'
                      : '再想想哦，看看下方解析提示 👇'}
                  </span>
                )}
              </div>

              {checkedVariant && (
                <div className="rounded-xl bg-sky-50/70 border border-sky-200 p-3 text-xs text-slate-700">
                  <strong className="text-emerald-700">变式解析：</strong>
                  {selected.variantQuestion.explanation}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  一键分层巩固作业单（因材施教 · 课后直接推送）
                </h3>
                <div className="flex gap-1.5">
                  {(['A', 'B', 'C'] as const).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setActiveTier(tier)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                        activeTier === tier
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-white border border-sky-200 text-slate-600'
                      }`}
                    >
                      {tier} 组
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-sky-50/60 border border-sky-200 p-4 space-y-2.5">
                <div className="text-sm font-bold text-sky-800">
                  {layeredHomework[activeTier].title}
                </div>
                <div className="text-xs text-slate-500">
                  推荐名单：{layeredHomework[activeTier].students}
                </div>
                <div className="space-y-2 pt-1">
                  {layeredHomework[activeTier].tasks.map((t, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-white border border-sky-100 text-xs text-slate-700"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN CLASSROOM PROJECTION MODAL */}
      {projectionOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-gradient-to-br from-[#081a33] via-[#0c264a] to-[#081a33] p-6 lg:p-10 flex flex-col justify-between overflow-y-auto text-slate-100">
            <div className="flex items-center justify-between border-b border-sky-400/25 pb-4">
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-500/25 text-sky-200 border border-sky-300/40">
                  教室大屏投屏讲评模式 · 学生信息已全匿名脱敏
                </span>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mt-2">
                  典型错例辨析：{selected.nodeLabel}（{selected.errorDimension}）
                </h2>
              </div>
              <button
                onClick={() => setProjectionOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> 退出投屏
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-6 flex-1 items-center">
              <div className="rounded-2xl bg-rose-950/40 border-2 border-rose-400/50 p-6 space-y-3 h-full">
                <div className="text-lg font-bold text-rose-300">❌ 课堂匿名错解（大家一起找 Bug！）</div>
                <pre className="text-base lg:text-lg font-mono text-rose-100 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {selected.studentCode}
                </pre>
              </div>
              <div className="rounded-2xl bg-emerald-950/40 border-2 border-emerald-400/50 p-6 space-y-3 h-full">
                <div className="text-lg font-bold text-emerald-300">✅ 规范正解对比</div>
                <pre className="text-base lg:text-lg font-mono text-emerald-100 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {selected.correctCode}
                </pre>
              </div>
            </div>

            <div className="rounded-2xl bg-sky-900/50 border border-sky-400/40 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-sky-200">
                  🎤 教师苏格拉底式课堂引导提问提词卡
                </span>
                <button
                  onClick={() => setShowSocraticTip(!showSocraticTip)}
                  className="text-xs text-sky-200 hover:text-white cursor-pointer"
                >
                  {showSocraticTip ? '隐藏提词' : '展开提词'}
                </button>
              </div>
              {showSocraticTip && (
                <p className="text-base text-white leading-relaxed">
                  “先别急着看右边正解！请同学们盯住左边标红的那一行——如果我们把参数 <code className="text-amber-300">n = 0</code> 代进去，程序运行到第 3 步会发生什么？谁愿意站起来当一回 Python 解释器帮大家推演一下？”
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
