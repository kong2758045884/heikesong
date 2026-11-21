import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Cpu,
  Lock,
  MapPin,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CLASS_TREND_DATA, ERROR_DIMENSION_DATA, STUDENT_CLASSES } from '../data/mockData';
import type {
  CheckInRecord,
  KnowledgeNode,
  MistakeItem,
  NavPage,
  StudentClass,
  TeachingSuggestion,
  UserRole,
} from '../types';

interface DashboardPageProps {
  role: UserRole;
  nodes: KnowledgeNode[];
  checkIns: CheckInRecord[];
  mistakes: MistakeItem[];
  suggestions: TeachingSuggestion[];
  completedTasks: string[];
  onToggleTask: (id: string) => void;
  onUpdateSuggestion: (id: string, status: TeachingSuggestion['status']) => void;
  onNavigate: (page: NavPage) => void;
  activeClassId: string | null;
  onSelectClass: (id: string) => void;
  onExitClass: () => void;
}

/** 学生课堂主题色静态映射：只使用静态类名，避免 Tailwind 动态拼接失效。 */
const CLASS_THEME_STYLES: Record<
  StudentClass['theme'],
  { iconBox: string; progress: string; hoverBorder: string }
> = {
  sky: {
    iconBox: 'bg-sky-50 text-sky-600 border border-sky-100',
    progress: 'bg-sky-500',
    hoverBorder: 'hover:border-sky-300',
  },
  violet: {
    iconBox: 'bg-violet-50 text-violet-600 border border-violet-100',
    progress: 'bg-violet-500',
    hoverBorder: 'hover:border-violet-300',
  },
  emerald: {
    iconBox: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    progress: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-300',
  },
};

const CLASS_STATUS_META: Record<StudentClass['status'], { label: string; badge: string }> = {
  ongoing: { label: '进行中', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  upcoming: { label: '即将开始', badge: 'bg-sky-50 text-sky-700 border border-sky-200' },
  ended: { label: '已结课', badge: 'bg-slate-100 text-slate-500 border border-slate-200' },
};

const CHECKIN_GESTURE_EMOJI: Record<StudentClass['checkInGesture'], string> = {
  v: '✌️',
  thumb: '👍',
  ok: '👌',
  heart: '🫶',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  role,
  nodes,
  checkIns,
  mistakes,
  suggestions,
  completedTasks,
  onUpdateSuggestion,
  onNavigate,
  activeClassId,
  onSelectClass,
  onExitClass,
}) => {
  const verifiedCount = checkIns.filter((c) => c.status === 'verified' || c.status === 'late').length;
  const reviewNeededCount = checkIns.filter((c) => c.status === 'review-needed').length;
  const weakNodes = nodes.filter((n) => (role === 'teacher' ? n.classStatus : n.status) === 'weak');
  const unresolvedMistakes = mistakes.filter((m) => !m.resolved);

  const avgMastery = Math.round(
    nodes
      .filter((n) => (role === 'teacher' ? n.classMastery : n.studentMastery) > 0)
      .reduce((acc, n) => acc + (role === 'teacher' ? n.classMastery : n.studentMastery), 0) /
      Math.max(1, nodes.filter((n) => (role === 'teacher' ? n.classMastery : n.studentMastery) > 0).length)
  );

  // ADMIN DASHBOARD
  if (role === 'admin') {
    const apiStats = [
      { day: '周一', calls: 1240 },
      { day: '周二', calls: 1680 },
      { day: '周三', calls: 2150 },
      { day: '周四', calls: 1920 },
      { day: '周五', calls: 2640 },
      { day: '今日', calls: 2890 },
    ];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-sky-600" />
              平台运维、AI 服务与隐私合规中心
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              覆盖 PRD 权限隔离、AI 模型调用监控、签到影像 24h 自动销毁与安全审计日志
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            所有核心微服务运行正常 (SLA 99.96%)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: '活跃师生用户', value: '1,284', sub: '教师 46 · 学生 1,238', icon: Users, accent: 'text-sky-600' },
            { label: '今日 AI 推理调用', value: '2,890', sub: '平均延迟 420ms · 命中 RAG 84%', icon: Cpu, accent: 'text-blue-600' },
            { label: '签到影像自动清理', value: '100%', sub: '24小时到期自动销毁，0 长期留存', icon: Lock, accent: 'text-emerald-600' },
            { label: '异常越权拦截', value: '0 次', sub: 'RBAC 课程与班级数据严格隔离', icon: ShieldCheck, accent: 'text-indigo-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="glass-panel rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-500 mt-1">{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
            <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600" />
              近 7 日 AI 服务调用趋势（课件解析 / 副驾驶问答 / 错题诊断 / 手势核验）
            </h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={apiStats}>
                  <defs>
                    <linearGradient id="adminApi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#bae6fd',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#0f172a',
                    }}
                  />
                  <Area type="monotone" dataKey="calls" stroke="#0284c7" strokeWidth={2.5} fill="url(#adminApi)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              隐私与安全合规策略 (PRD 13.3)
            </h3>
            {[
              { title: '签到拍摄前明示授权', state: '已强制启用' },
              { title: '签到原始影像 24h 自动销毁', state: '定时任务运行中' },
              { title: '禁止无关人脸识别与二次利用', state: '策略已锁定' },
              { title: '不适合影像签到学生替代通道', state: '已开放口令/人工核验' },
              { title: 'AI 教学建议教师审核留痕', state: '审计日志开启' },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50/70 border border-sky-100 text-xs"
              >
                <span className="text-slate-700 font-medium">{item.title}</span>
                <span className="text-emerald-600 font-semibold">{item.state}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // TEACHER DASHBOARD
  if (role === 'teacher') {
    return (
      <div className="space-y-6">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-300/70 bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 p-6 text-white shadow-lg shadow-sky-500/20">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 border border-white/30 text-white text-xs font-medium mb-2.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-100" />
                教师端 · AI 教学驾驶舱
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                早安，张教授！本班《递归与调用栈》已生成精准讲评方案
              </h1>
              <p className="text-sm text-sky-50 mt-1.5 max-w-2xl">
                AI 已自动完成 40 份课后作业四维错因诊断，识别出 <strong>3 个全班共性薄弱节点</strong>，并为你准备好可直接投屏的脱敏错例对比与分层巩固单。
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 shrink-0">
              <button
                onClick={() => onNavigate('diagnostics')}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-sky-50 text-blue-700 text-sm font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <BrainCircuit className="w-4 h-4" />
                一键进入课堂投屏讲评
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('classroom')}
                className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold border border-white/35 transition-all cursor-pointer flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                进入实时课堂
              </button>
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>班级知识综合掌握度</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{avgMastery}%</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">较上周提升 +5.2% · 多证据综合估算</div>
          </div>

          <div
            onClick={() => onNavigate('checkin')}
            className="glass-panel rounded-2xl p-5 hover:border-sky-400 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>本节 AI 智能签到</span>
              <Camera className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {verifiedCount}/{checkIns.length}
              <span className="text-sm font-normal text-slate-400 ml-1">样本</span>
            </div>
            <div className="text-xs text-amber-600 font-medium mt-1">
              {reviewNeededCount > 0 ? `${reviewNeededCount} 条异常待教师一键复核 →` : '全部复核完成 ✓'}
            </div>
          </div>

          <div
            onClick={() => onNavigate('knowledge-graph')}
            className="glass-panel rounded-2xl p-5 hover:border-rose-300 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>全班薄弱预警节点</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-3xl font-bold text-rose-600">{weakNodes.length} 个</div>
            <div className="text-xs text-slate-600 mt-1 truncate">
              {weakNodes.map((n) => n.label).join('、')}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>课堂互动参与率</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">96.0%</div>
            <div className="text-xs text-sky-600 font-medium mt-1">随堂测验 + 匿名提问 + 3D 实验</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">班级平均分与课堂参与度趋势</h3>
                <p className="text-xs text-slate-500">第3周引入递归章节出现短暂波动，经 AI 针对性讲评后迅速回升</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 font-medium">
                实时学情
              </span>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CLASS_TREND_DATA}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="partGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
                  <YAxis domain={[50, 100]} stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#bae6fd',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="avgScore" name="班级均分" stroke="#2563eb" strokeWidth={2.5} fill="url(#scoreGrad)" />
                  <Area type="monotone" dataKey="participation" name="参与率(%)" stroke="#0ea5e9" strokeWidth={2} fill="url(#partGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-bold text-slate-800 text-sm mb-1">全班四维错因分布</h3>
            <p className="text-xs text-slate-500 mb-4">AI 自动归类作业错因，区分概念与粗心</p>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ERROR_DIMENSION_DATA} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis dataKey="name" type="category" stroke="#334155" fontSize={11} width={88} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#bae6fd',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="错题人次" radius={[0, 6, 6, 0]}>
                    {ERROR_DIMENSION_DATA.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* AI Teaching Suggestions */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-600" />
                AI 教学改进建议（支持教师审核：采纳 / 忽略）
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                基于班级错题聚类、先修节点关联与随堂答题数据自动生成，教师保留最终决策权
              </p>
            </div>
            <button
              onClick={() => onNavigate('knowledge-graph')}
              className="text-xs text-sky-600 hover:text-sky-700 font-semibold cursor-pointer flex items-center gap-1"
            >
              查看 3D 全班知识掌握图谱 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {suggestions.map((sug) => (
              <div
                key={sug.id}
                className={`rounded-xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                  sug.status === 'adopted'
                    ? 'bg-emerald-50/90 border-emerald-300'
                    : sug.status === 'ignored'
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : 'bg-sky-50/55 border-sky-200/80 hover:border-sky-400'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        sug.priority === 'high'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {sug.nodeLabel} · 错误率 {sug.errorRate}%
                    </span>
                    {sug.status === 'adopted' && (
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 已采纳
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 leading-snug">{sug.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{sug.detail}</p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-sky-100">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onUpdateSuggestion(sug.id, 'adopted')}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                    >
                      采纳建议
                    </button>
                    <button
                      onClick={() => onUpdateSuggestion(sug.id, 'ignored')}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer"
                    >
                      忽略
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      onNavigate(sug.id === 'sug1' ? 'virtual-lab' : 'diagnostics')
                    }
                    className="text-xs text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
                  >
                    {sug.actionLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STUDENT DASHBOARD
  // 学生端已按「我的课堂」重构：未选课堂时只展示课堂列表；
  // 选中课堂后展示该课堂信息卡 + 五个功能入口（含 AI 学习路线推荐）。
  const studentPathSteps = [
    { id: 'p1', title: '完成今日 AI 智能签到' },
    { id: 'p2', title: '运行 factorial(4) 调用栈演示' },
    { id: 'p3', title: '完成递归出口错因诊断题' },
    { id: 'p4', title: '查看知识图谱并解锁图搜索' },
  ];
  const completedPathCount = studentPathSteps.filter((step) => completedTasks.includes(step.id)).length;
  const nextPathStep = studentPathSteps.find((step) => !completedTasks.includes(step.id));
  const hasCheckedIn = checkIns.some(
    (c) =>
      (c.classId ?? STUDENT_CLASSES[0]?.id) === activeClassId &&
      (c.status === 'verified' || c.status === 'late')
  );
  const classTerm = STUDENT_CLASSES[0]?.term ?? '';
  const activeClass = activeClassId
    ? STUDENT_CLASSES.find((item) => item.id === activeClassId) ?? null
    : null;

  // 未选择课堂（或 activeClassId 失效）时，只展示课堂列表
  if (!activeClass) {
    return (
      <div className="space-y-4">
        <div className="px-0.5">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookOpen className="h-5 w-5 text-sky-600" />
            我的课堂
          </h1>
          <p className="mt-1 text-sm text-slate-500">选择课堂，进入今天的学习</p>
          <p className="mt-1.5 text-[11px] font-semibold text-sky-600 tabular-nums">
            {classTerm} · 共 {STUDENT_CLASSES.length} 门课堂
          </p>
        </div>

        {activeClassId !== null && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700"
          >
            未找到对应课堂，已回退到全部课堂列表。
          </div>
        )}

        <div className="space-y-3">
          {STUDENT_CLASSES.map((cls) => {
            const theme = CLASS_THEME_STYLES[cls.theme];
            const status = CLASS_STATUS_META[cls.status];
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => onSelectClass(cls.id)}
                aria-label={`进入课堂：${cls.name}，${status.label}`}
                className={`glass-panel w-full min-w-0 cursor-pointer rounded-2xl p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${theme.hoverBorder}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.iconBox}`}
                  >
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 break-words text-sm font-bold leading-snug text-slate-900">
                        {cls.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] text-slate-500">
                        {cls.teacher} · {cls.teacherTitle}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${
                          cls.unread > 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        <MessageSquare className="h-3 w-3" />
                        {cls.unread} 条未读
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                    {cls.schedule}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                    {cls.room}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0 text-slate-400" />
                    {cls.studentCount} 人
                  </span>
                </div>

                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>学习进度</span>
                    <span className="font-semibold tabular-nums text-slate-700">{cls.progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${theme.progress}`}
                      style={{ width: `${cls.progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2.5 rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-sky-600">下次课</div>
                  <div className="mt-0.5 break-words text-[11px] font-medium text-slate-700">
                    {cls.nextSession}
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] text-slate-400">{cls.code}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-sky-600">
                    进入课堂
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const theme = CLASS_THEME_STYLES[activeClass.theme];
  const status = CLASS_STATUS_META[activeClass.status];
  const featureEntries = [
    {
      id: 'checkin',
      title: '签到',
      icon: Camera,
      primary: hasCheckedIn ? '已完成签到' : '待签到',
      subtitle: `教师指定手势：${CHECKIN_GESTURE_EMOJI[activeClass.checkInGesture]} ${activeClass.teacher}`,
      ariaLabel: hasCheckedIn ? '查看本课堂签到记录' : '前往本课堂签到',
      onClick: () => onNavigate('checkin'),
    },
    {
      id: 'classroom',
      title: '课堂',
      icon: BookOpen,
      primary: activeClass.live ? 'LIVE · 第 3 章' : activeClass.status === 'upcoming' ? '即将开始' : '待开课',
      subtitle: activeClass.live ? '3 页课件 · 双语字幕' : '课件预习 · 共享笔记',
      ariaLabel: '进入实时课堂',
      onClick: () => onNavigate('classroom'),
    },
    {
      id: 'knowledge-graph',
      title: '图谱',
      icon: Network,
      primary: `${avgMastery}% 平均掌握度`,
      subtitle: `${nodes.length} 个知识点`,
      ariaLabel: '查看知识图谱',
      onClick: () => onNavigate('knowledge-graph'),
    },
    {
      id: 'diagnostics',
      title: '错题',
      icon: BrainCircuit,
      primary: `${unresolvedMistakes.length} 道未解决`,
      subtitle: 'AI 错因诊断',
      ariaLabel: '查看错题与 AI 错因诊断',
      onClick: () => onNavigate('diagnostics'),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 课堂切换头部：返回全部课堂 */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExitClass}
          aria-label="返回全部课堂"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition-all hover:bg-sky-50 active:scale-[0.98]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          全部课堂
        </button>
        <div className="min-w-0 text-right">
          <h1 className="truncate text-sm font-bold text-slate-900">{activeClass.name}</h1>
          <p className="truncate text-[10px] text-slate-500">
            {activeClass.teacher} · {activeClass.term}
          </p>
        </div>
      </div>

      {/* 课堂信息卡 */}
      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.iconBox}`}
            >
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-sm font-bold text-slate-900">{activeClass.name}</h2>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${status.badge}`}
                >
                  {status.label}
                </span>
              </div>
              <p className="truncate text-[10px] text-slate-500">
                {activeClass.code} · {activeClass.studentCount} 人
              </p>
            </div>
          </div>
          {activeClass.unread > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
              <MessageSquare className="h-3 w-3" />
              {activeClass.unread}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-600">
            <CalendarDays className="h-3 w-3" />
            下次课
          </div>
          <div className="mt-1 break-words text-xs font-semibold text-slate-800">
            {activeClass.nextSession}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {activeClass.schedule}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {activeClass.room}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              到课率
            </div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {activeClass.attendance}%
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <TrendingUp className="h-3 w-3 text-sky-500" />
              学习进度
            </div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {activeClass.progress}%
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${theme.progress}`}
                style={{ width: `${activeClass.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 五个功能入口：签到 / 课堂 / 图谱 / 错题 + AI 学习路线推荐 */}
      <div className="space-y-2.5">
        <h2 className="px-0.5 text-sm font-bold text-slate-900">课堂功能</h2>

        <div className="grid grid-cols-2 gap-2.5">
          {featureEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={entry.onClick}
                aria-label={entry.ariaLabel}
                className="glass-panel min-w-0 cursor-pointer rounded-2xl p-3.5 text-left transition-all hover:border-sky-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                </div>
                <div className="mt-2 text-xs font-bold text-slate-800">{entry.title}</div>
                <div className="mt-0.5 break-words text-[11px] font-semibold text-slate-900">
                  {entry.primary}
                </div>
                <div className="mt-0.5 break-words text-[10px] leading-snug text-slate-500">
                  {entry.subtitle}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onNavigate('report')}
          aria-label="查看 AI 学习路线推荐"
          className="w-full cursor-pointer rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 p-4 text-left text-white shadow-lg shadow-sky-500/20 transition-all hover:from-sky-400 hover:to-blue-500 active:scale-[0.99]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-sky-100">个性化推荐</div>
                <div className="mt-0.5 text-sm font-bold">AI 学习路线推荐</div>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
              已完成 {completedPathCount}/{studentPathSteps.length}
            </span>
          </div>
          <p className="mt-2 break-words text-[11px] leading-snug text-sky-50">
            根据学习记录动态生成 · 下一步：{nextPathStep ? nextPathStep.title : '全部任务已完成，去查看学习报告'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${(completedPathCount / studentPathSteps.length) * 100}%` }}
              />
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold">
              查看完整路线
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
