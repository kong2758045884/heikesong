import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Lock,
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
import { CLASS_TREND_DATA, ERROR_DIMENSION_DATA, STATUS_META } from '../data/mockData';
import type {
  CheckInRecord,
  KnowledgeNode,
  MistakeItem,
  NavPage,
  TeachingSuggestion,
  UserRole,
} from '../types';

interface DashboardPageProps {
  role: UserRole;
  displayName: string;
  nodes: KnowledgeNode[];
  checkIns: CheckInRecord[];
  mistakes: MistakeItem[];
  suggestions: TeachingSuggestion[];
  onUpdateSuggestion: (id: string, status: TeachingSuggestion['status']) => void;
  onNavigate: (page: NavPage) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  role,
  displayName,
  nodes,
  checkIns,
  mistakes,
  suggestions,
  onUpdateSuggestion,
  onNavigate,
}) => {
  const [completedTasks, setCompletedTasks] = useState<string[]>(['p1']);

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
                {displayName}，本班《递归与调用栈》已生成精准讲评方案
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
  const learningPath = [
    {
      id: 'p1',
      step: '01',
      title: '完成今日 AI 智能课堂签到（实拍 + 手势 + 黑板联验）',
      tag: '课前准备',
      page: 'checkin' as NavPage,
    },
    {
      id: 'p2',
      step: '02',
      title: '在 3D 虚拟实验室运行 factorial(4) 调用栈压栈/回溯演示',
      tag: '薄弱突破 · 递归',
      page: 'virtual-lab' as NavPage,
    },
    {
      id: 'p3',
      step: '03',
      title: '完成 2 道「递归出口遗漏」AI 错因诊断与变式验证题',
      tag: '举一反三',
      page: 'diagnostics' as NavPage,
    },
    {
      id: 'p4',
      step: '04',
      title: '查看 3D 知识图谱并解锁下一章「图搜索 (DFS/BFS)」',
      tag: '知识进阶',
      page: 'knowledge-graph' as NavPage,
    },
  ];

  const toggleTask = (id: string) => {
    setCompletedTasks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      {/* Clean Mobile Student Greeting Card */}
      <div className="rounded-2xl bg-sky-600 text-white p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/15">
            今日学习计划
          </span>
          <span className="text-xs text-sky-100 tabular-nums">掌握度 {avgMastery}%</span>
        </div>
        <div>
          <h1 className="text-lg font-bold leading-snug">{displayName}，继续攻克「递归与调用栈」</h1>
          <p className="text-xs text-sky-100 mt-1">
            当前掌握度 {nodes.find((n) => n.id === 'recursion')?.studentMastery}% · 还有 {unresolvedMistakes.length} 道错题待巩固
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onNavigate('checkin')}
            className="py-2 px-3 rounded-xl bg-white text-sky-700 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> 去课堂签到
          </button>
          <button
            onClick={() => onNavigate('virtual-lab')}
            className="py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold border border-white/25 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <FlaskConical className="w-3.5 h-3.5" /> 3D 实验室
          </button>
        </div>
      </div>

      {/* Compact 2x2 Metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="glass-panel rounded-2xl p-3.5">
          <div className="text-[11px] text-slate-500">已掌握知识点</div>
          <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
            {nodes.filter((n) => n.status === 'mastered').length}
            <span className="text-xs font-normal text-slate-400"> / {nodes.length}</span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-3.5">
          <div className="text-[11px] text-slate-500">本周有效学习</div>
          <div className="text-xl font-bold text-sky-600 tabular-nums mt-0.5">6.8 h</div>
        </div>
      </div>

      {/* Quick Tools Strip (Virtual Lab + Group Collab) */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => onNavigate('virtual-lab')}
          className="glass-panel rounded-2xl p-3.5 text-left hover:border-sky-300 transition-colors cursor-pointer flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800">3D 实验室</div>
            <div className="text-[11px] text-slate-500 truncate">调用栈·排序</div>
          </div>
        </button>
        <button
          onClick={() => onNavigate('group-collab')}
          className="glass-panel rounded-2xl p-3.5 text-left hover:border-sky-300 transition-colors cursor-pointer flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800">小组协作</div>
            <div className="text-[11px] text-slate-500 truncate">脑图·分工</div>
          </div>
        </button>
      </div>

      {/* Personalized Learning Path */}
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">AI 个性化学习路径</h2>
          <span className="text-[11px] text-sky-600 font-semibold tabular-nums">
            {completedTasks.length}/{learningPath.length}
          </span>
        </div>
        <div className="space-y-2">
          {learningPath.map((item) => {
            const done = completedTasks.includes(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-2.5 p-3 rounded-xl border transition-colors ${
                  done ? 'bg-emerald-50/70 border-emerald-200' : 'bg-sky-50/40 border-sky-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => toggleTask(item.id)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                      done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-sky-300 text-sky-600 bg-white'
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <span className="text-[10px] font-bold">{item.step}</span>
                    )}
                  </button>
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-semibold leading-snug ${
                        done ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="text-[10px] text-sky-600 mt-0.5">{item.tag}</div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(item.page)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-sky-700 text-[11px] font-semibold shrink-0 cursor-pointer"
                >
                  去完成
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weak Nodes Snapshot */}
      <div className="glass-panel rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">薄弱点优先巩固</h2>
          <button
            onClick={() => onNavigate('knowledge-graph')}
            className="text-[11px] text-sky-600 font-semibold cursor-pointer"
          >
            查看图谱 →
          </button>
        </div>
        <div className="space-y-2.5">
          {nodes
            .filter((n) => n.studentMastery > 0)
            .sort((a, b) => a.studentMastery - b.studentMastery)
            .slice(0, 4)
            .map((node) => {
              const meta = STATUS_META[node.status];
              return (
                <div key={node.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium">{node.label}</span>
                    <span className={`${meta.color} font-semibold tabular-nums`}>
                      {node.studentMastery}% · {meta.label}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${node.studentMastery}%`, backgroundColor: meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
