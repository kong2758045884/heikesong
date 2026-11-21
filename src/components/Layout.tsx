import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Camera,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UserCheck,
  ZapOff,
  X,
} from 'lucide-react';
import type { AIConfig, NavPage, UserRole } from '../types';
import { loadAIConfig, saveAIConfig } from '../services/aiService';

interface LayoutProps {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  reduceMotion: boolean;
  onToggleReduceMotion: () => void;
  pendingReviewCount: number;
  unresolvedMistakesCount: number;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavPage;
  label: string;
  sub: string;
  icon: React.FC<{ className?: string }>;
  roles: UserRole[];
}[] = [
  {
    id: 'dashboard',
    label: '智慧工作台',
    sub: '概览与驾驶舱',
    icon: LayoutDashboard,
    roles: ['teacher', 'student', 'admin'],
  },
  {
    id: 'checkin',
    label: 'AI 智能签到',
    sub: '实拍·手势·黑板联验',
    icon: Camera,
    roles: ['teacher', 'student'],
  },
  {
    id: 'classroom',
    label: 'AI 实时课堂',
    sub: '副驾驶·互动·双语字幕',
    icon: BookOpen,
    roles: ['teacher', 'student'],
  },
  {
    id: 'knowledge-graph',
    label: '3D 知识图谱',
    sub: '先修关系·掌握度星图',
    icon: Network,
    roles: ['teacher', 'student'],
  },
  {
    id: 'virtual-lab',
    label: '3D 虚拟实验室',
    sub: '调用栈·排序·二叉树',
    icon: FlaskConical,
    roles: ['teacher', 'student'],
  },
  {
    id: 'diagnostics',
    label: '错题诊断与讲评',
    sub: '四维错因·分层·投屏',
    icon: BrainCircuit,
    roles: ['teacher', 'student'],
  },
  {
    id: 'group-collab',
    label: 'AI 小组协作',
    sub: '分工·共享脑图·总结',
    icon: Users,
    roles: ['teacher', 'student'],
  },
];

const ROLE_META: Record<UserRole, { label: string; name: string; desc: string }> = {
  teacher: {
    label: '教师端',
    name: '张教授 · 计算机学院',
    desc: '授课教师 / 数据驾驶舱',
  },
  student: {
    label: '学生端',
    name: '林致远 · 2024级软件1班',
    desc: '个性化学习空间',
  },
  admin: {
    label: '管理端',
    name: '系统管理员',
    desc: 'AI 运维与合规审计',
  },
};

export const Layout: React.FC<LayoutProps> = ({
  role,
  onRoleChange,
  currentPage,
  onNavigate,
  reduceMotion,
  onToggleReduceMotion,
  pendingReviewCount,
  unresolvedMistakesCount,
  children,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadAIConfig());
  const [savedToast, setSavedToast] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleSaveConfig = () => {
    saveAIConfig(aiConfig);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setSettingsOpen(false);
    }, 800);
  };

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-[#eaf4ff] via-[#f4f9ff] to-[#e2f0ff] text-slate-800 flex flex-col lg:flex-row relative overflow-x-hidden ${
        reduceMotion ? 'reduce-motion' : ''
      }`}
    >
      {/* Soft Pastel Sky-Blue Ambient Glow */}
      {!reduceMotion && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className="absolute -top-36 -left-36 w-[520px] h-[520px] rounded-full bg-sky-300/25 blur-[120px]" />
          <div className="absolute top-1/3 -right-36 w-[460px] h-[460px] rounded-full bg-blue-300/20 blur-[120px]" />
          <div className="absolute -bottom-36 left-1/3 w-[480px] h-[480px] rounded-full bg-cyan-200/30 blur-[130px]" />
        </div>
      )}

      {/* Left Sidebar */}
      <aside className="relative z-20 w-full lg:w-68 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-sky-200/80 bg-white/80 backdrop-blur-xl flex flex-col shrink-0 shadow-sm">
        {/* Brand Logo */}
        <div className="px-5 py-4 border-b border-sky-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-md shadow-sky-500/25">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-sky-700 via-blue-600 to-cyan-600 bg-clip-text text-transparent">
                EduMind
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                AI 原生
              </span>
            </div>
            <p className="text-[11px] text-slate-500">让老师更容易教 · 让学生真正学会</p>
          </div>
        </div>

        {/* Course Pill */}
        <div className="px-4 pt-4 pb-2">
          <div className="rounded-xl bg-gradient-to-br from-sky-50 to-blue-50/80 border border-sky-200/80 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>当前演示课程</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                授课中
              </span>
            </div>
            <div className="text-xs font-bold text-slate-800 leading-snug">
              Python 程序设计与数据结构
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              曲阜师范大学 · 2024级软件1班 (40人)
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            const badgeCount =
              item.id === 'checkin' && role === 'teacher' && pendingReviewCount > 0
                ? pendingReviewCount
                : item.id === 'diagnostics' && role === 'student' && unresolvedMistakesCount > 0
                ? unresolvedMistakesCount
                : 0;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all shrink-0 lg:shrink cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25'
                    : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50/90 border border-transparent'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-sky-50 text-sky-600 group-hover:bg-sky-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center justify-between gap-2">
                    <span className="truncate">{item.label}</span>
                    {badgeCount > 0 && (
                      <span
                        className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                          active
                            ? 'bg-white text-rose-600'
                            : 'bg-rose-100 text-rose-600 border border-rose-200'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[11px] truncate hidden lg:block ${
                      active ? 'text-sky-100' : 'text-slate-400'
                    }`}
                  >
                    {item.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom Identity & Compliance */}
        <div className="p-3 border-t border-sky-100 hidden lg:block space-y-2.5">
          <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {role === 'teacher' ? '张' : role === 'student' ? '林' : '管'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-800 truncate">
                {ROLE_META[role].name}
              </div>
              <div className="text-[11px] text-slate-500 truncate">{ROLE_META[role].desc}</div>
            </div>
          </div>
          <div className="px-1 flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>脱敏模拟教学数据 · AI 辅助透明标注</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-16 px-4 lg:px-7 border-b border-sky-200/70 bg-white/75 backdrop-blur-xl flex items-center justify-between gap-3">
          {/* Role Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">切换体验视角：</span>
            <div className="inline-flex rounded-xl bg-sky-50 border border-sky-200/80 p-1">
              {(['teacher', 'student', 'admin'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => onRoleChange(r)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    role === r
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/30'
                      : 'text-slate-600 hover:text-sky-700'
                  }`}
                >
                  {r === 'teacher' && <UserCheck className="w-3.5 h-3.5" />}
                  {r === 'student' && <GraduationCap className="w-3.5 h-3.5" />}
                  {r === 'admin' && <Activity className="w-3.5 h-3.5" />}
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleReduceMotion}
              title="低性能设备降级与减少动画模式 (PRD 11.1)"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                reduceMotion
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-white text-slate-600 border-sky-200 hover:border-sky-400 hover:text-sky-700'
              }`}
            >
              <ZapOff className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{reduceMotion ? '已开启节能降级' : '节能模式'}</span>
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-sky-200 hover:border-sky-400 hover:text-sky-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden md:inline">AI 引擎配置</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-7 max-w-[1600px] w-full mx-auto">{children}</main>

        {/* Compliance Footer */}
        <footer className="px-4 lg:px-7 py-3 border-t border-sky-200/60 bg-white/40 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            EduMind AI 原生智慧教学平台 · TRAE AI 校园黑客松（学习教育赛道 · 辅助教师教学与个性化学习闭环）
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <Sparkles className="w-3 h-3 text-sky-500" />
            合规声明：演示均使用自建模拟课程与脱敏学情数据，AI 生成内容均支持教师审核与编辑。
          </span>
        </footer>
      </div>

      {/* AI Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-sky-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-500" />
                <h3 className="font-bold text-base text-slate-800">AI 服务引擎配置</h3>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-sky-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 leading-relaxed">
              <strong>默认开箱即用：</strong>平台内置「课程上下文增强本地 AI 引擎」，无需 API Key 即可流畅演示课件问答、错因诊断、AI 出题与教学建议。如需接入真实大模型 API，可在下方启用。
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 border border-sky-200 cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-800">启用外部大模型 API (OpenAI 兼容)</div>
                <div className="text-xs text-slate-500">支持 DeepSeek / 通义千问 / OpenAI 接口</div>
              </div>
              <input
                type="checkbox"
                checked={aiConfig.useRealApi}
                onChange={(e) => setAiConfig({ ...aiConfig, useRealApi: e.target.checked })}
                className="w-4 h-4 accent-sky-600"
              />
            </label>

            {aiConfig.useRealApi && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">API Endpoint</label>
                  <input
                    type="text"
                    value={aiConfig.apiUrl}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Model 名称</label>
                  <input
                    type="text"
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">API Key（仅保存在本地浏览器）</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={aiConfig.apiKey}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 cursor-pointer flex items-center gap-1.5"
              >
                {savedToast ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                {savedToast ? '已保存' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
