import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Network,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { STATUS_META, STUDENT_WEEKLY_TREND } from '../data/mockData';
import type { CheckInRecord, KnowledgeNode, MistakeItem, NavPage, UserRole } from '../types';

interface ReportPageProps {
  role: UserRole;
  nodes: KnowledgeNode[];
  checkIns: CheckInRecord[];
  mistakes: MistakeItem[];
  completedTasks: string[];
  onNavigate: (page: NavPage) => void;
}

const TOTAL_TASKS = 4;

export const ReportPage: React.FC<ReportPageProps> = ({
  role,
  nodes,
  checkIns,
  mistakes,
  completedTasks,
  onNavigate,
}) => {
  const [range, setRange] = useState<'week' | 'month'>('week');
  const isTeacher = role !== 'student';

  const scoredNodes = useMemo(
    () => nodes.filter((n) => (isTeacher ? n.classMastery : n.studentMastery) > 0),
    [isTeacher, nodes]
  );
  const scoreOf = (n: KnowledgeNode) => (isTeacher ? n.classMastery : n.studentMastery);
  const statusOf = (n: KnowledgeNode) => (isTeacher ? n.classStatus : n.status);

  const avgMastery = Math.round(
    scoredNodes.reduce((sum, n) => sum + scoreOf(n), 0) / Math.max(1, scoredNodes.length)
  );
  const weakNodes = nodes
    .filter((n) => statusOf(n) === 'weak' || statusOf(n) === 'needs-review')
    .sort((a, b) => scoreOf(a) - scoreOf(b));
  const unresolved = mistakes.filter((m) => !m.resolved);
  // A student report must only count this student's own check-ins; the shared
  // demo list also contains classmates, which would otherwise skew attendance.
  const ownCheckIns = isTeacher
    ? checkIns
    : checkIns.filter((c) => c.studentName.startsWith('林致远'));
  const attendanceBase = ownCheckIns.filter((c) => c.status !== 'absent');
  const attended = attendanceBase.filter(
    (c) => c.status === 'verified' || c.status === 'late'
  ).length;
  const attendanceRate = Math.round((attended / Math.max(1, attendanceBase.length)) * 100);
  const accuracy = Math.round(
    scoredNodes.reduce((sum, n) => sum + n.evidence.quizScore, 0) /
      Math.max(1, scoredNodes.length)
  );
  const taskRate = Math.round((completedTasks.length / TOTAL_TASKS) * 100);

  const trend = useMemo(() => {
    if (range === 'week') return STUDENT_WEEKLY_TREND;
    return STUDENT_WEEKLY_TREND.map((point, index) => {
      const lift = index < 4 ? index * 2 : (6 - index) * 3;
      return {
        day: `第${index + 1}周`,
        score: Math.min(96, Math.max(58, point.score + lift - 3)),
        minutes: 160 + index * 25,
      };
    });
  }, [range]);

  const radarData = useMemo(
    () => [
      { dimension: '概念理解', value: accuracy },
      {
        dimension: '作业质量',
        value: Math.round(
          scoredNodes.reduce((sum, n) => sum + n.evidence.homeworkScore, 0) /
            Math.max(1, scoredNodes.length)
        ),
      },
      {
        dimension: '先修支撑',
        value: Math.round(
          scoredNodes.reduce((sum, n) => sum + n.evidence.prereqScore, 0) /
            Math.max(1, scoredNodes.length)
        ),
      },
      { dimension: '课堂参与', value: Math.max(60, attendanceRate) },
      { dimension: '任务完成', value: Math.max(20, taskRate) },
    ],
    [accuracy, attendanceRate, scoredNodes, taskRate]
  );

  const headline =
    weakNodes.length > 0
      ? `本周整体掌握度 ${avgMastery} 分，优先补强「${weakNodes[0].label}」。`
      : `本周整体掌握度 ${avgMastery} 分，知识结构稳定，可以挑战迁移题了。`;

  const suggestions = [
    weakNodes[0]
      ? `先花 10 分钟重看「${weakNodes[0].label}」的核心概念，再到 3D 实验室做一次可视化验证。`
      : '保持当前节奏，尝试用费曼学习法给同学讲一遍最容易混淆的知识点。',
    unresolved.length > 0
      ? `还有 ${unresolved.length} 道错题未闭环，建议今天完成对应的 2 道变式题并标记掌握。`
      : '错题已全部闭环，可以挑战图谱中尚未解锁的「图搜索（DFS/BFS）」。',
    attendanceRate < 90
      ? '到课率低于 90%，课堂签到会直接影响过程性评价，请提前处理签到异常。'
      : '课堂参与稳定，建议在课堂 BOSS 环节主动争取一次展示机会，强化表达与协作。',
  ];

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-sky-700 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> 返回首页
        </button>
        <div className="inline-flex rounded-xl bg-white border border-sky-200 p-0.5 text-[11px]">
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                range === r ? 'bg-sky-600 text-white' : 'text-slate-600'
              }`}
            >
              {r === 'week' ? '本周' : '本月'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600" />
            {isTeacher ? '班级学习报告' : '我的学习报告'}
          </h1>
          <p className="text-[11px] text-slate-500 mt-1">
            Python 数据结构 · 第 3 章 · 数据来自签到、答题与实验记录
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
          已更新
        </span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 text-white p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-[11px] text-sky-100">
          <Sparkles className="w-3.5 h-3.5" /> AI 学情摘要
        </div>
        <h2 className="text-base font-bold leading-snug">{headline}</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/10 border border-white/15 py-2">
            <div className="text-lg font-bold tabular-nums">{avgMastery}</div>
            <div className="text-[10px] text-sky-100">平均掌握度</div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 py-2">
            <div className="text-lg font-bold tabular-nums">{accuracy}%</div>
            <div className="text-[10px] text-sky-100">答题正确率</div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 py-2">
            <div className="text-lg font-bold tabular-nums">{attendanceRate}%</div>
            <div className="text-[10px] text-sky-100">课堂到课率</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: '已完成任务', value: `${completedTasks.length}/${TOTAL_TASKS}`, icon: CheckCircle2 },
          { label: '待巩固错题', value: `${unresolved.length} 道`, icon: BrainCircuit },
          { label: '薄弱知识点', value: `${weakNodes.filter((n) => statusOf(n) === 'weak').length} 个`, icon: Target },
          { label: '有效学习', value: range === 'week' ? '6.8 h' : '27.4 h', icon: Clock3 },
        ].map((item) => (
          <div key={item.label} className="glass-panel rounded-2xl p-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{item.label}</span>
              <item.icon className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-sky-600" /> 学习趋势
          </h2>
          <span className="text-[10px] text-slate-400">掌握度 / 时间</span>
        </div>
        <div className="h-[170px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="reportScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #bae6fd',
                  fontSize: 11,
                  boxShadow: '0 8px 24px -12px rgba(14,165,233,.4)',
                }}
                formatter={(value) => [`${Number(value ?? 0)} 分`, '掌握度']}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#0284c7"
                strokeWidth={2.5}
                fill="url(#reportScore)"
                dot={{ r: 3, fill: '#0284c7', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Target className="w-4 h-4 text-sky-600" /> 五维能力雷达
        </h2>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#475569' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.22} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">知识点掌握明细</h2>
          <button
            onClick={() => onNavigate('knowledge-graph')}
            className="text-[11px] text-sky-600 font-semibold flex items-center gap-0.5 cursor-pointer"
          >
            查看图谱 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2.5">
          {[...nodes]
            .sort((a, b) => scoreOf(a) - scoreOf(b))
            .slice(0, 6)
            .map((node) => {
              const meta = STATUS_META[statusOf(node)];
              return (
                <div key={node.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 font-medium truncate pr-2">{node.label}</span>
                    <span className={`${meta.color} font-semibold tabular-nums shrink-0`}>
                      {scoreOf(node)}% · {meta.label}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${scoreOf(node)}%`, backgroundColor: meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-sky-600" /> 下一步建议
        </h2>
        <div className="space-y-2">
          {suggestions.map((text, index) => (
            <div key={text} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onNavigate('diagnostics')}
            className="py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <BrainCircuit className="w-3.5 h-3.5" /> 去清错题
          </button>
          <button
            onClick={() => onNavigate('virtual-lab')}
            className="py-2 rounded-xl bg-white border border-sky-200 text-sky-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5" /> 去 3D 实验室
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-[10px] text-slate-500 leading-relaxed">
        <Network className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span>
          报告数据来自本机学习记录（签到、答题、实验与任务），刷新不会丢失。清除浏览器数据或在设置中重置后回到初始演示状态。
        </span>
      </div>
    </div>
  );
};
