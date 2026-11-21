import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Camera,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  Home,
  LayoutDashboard,
  Network,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  X,
  ZapOff,
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

const DESKTOP_NAV: {
  id: NavPage;
  label: string;
  icon: React.FC<{ className?: string }>;
  roles: UserRole[];
}[] = [
  { id: 'dashboard', label: '教学驾驶舱', icon: LayoutDashboard, roles: ['teacher', 'admin'] },
  { id: 'checkin', label: '智能签到', icon: Camera, roles: ['teacher'] },
  { id: 'classroom', label: '实时课堂', icon: BookOpen, roles: ['teacher'] },
  { id: 'knowledge-graph', label: '3D 知识图谱', icon: Network, roles: ['teacher'] },
  { id: 'virtual-lab', label: '虚拟实验室', icon: FlaskConical, roles: ['teacher'] },
  { id: 'diagnostics', label: '错题与讲评', icon: BrainCircuit, roles: ['teacher'] },
  { id: 'group-collab', label: '小组协作', icon: Users, roles: ['teacher'] },
];

// Clean 5-button mobile bottom tab bar for Student Mode
const STUDENT_BOTTOM_TABS: {
  id: NavPage;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: '首页', icon: Home },
  { id: 'checkin', label: '签到', icon: Camera },
  { id: 'classroom', label: '课堂', icon: BookOpen },
  { id: 'knowledge-graph', label: '图谱', icon: Network },
  { id: 'diagnostics', label: '错题', icon: BrainCircuit },
];

const ROLE_LABELS: Record<UserRole, string> = {
  teacher: '教师端',
  student: '学生端',
  admin: '管理端',
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

  const handleSaveConfig = () => {
    saveAIConfig(aiConfig);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setSettingsOpen(false);
    }, 700);
  };

  const settingsModal = settingsOpen ? (
    <div className="fixed inset-0 z-[100] bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-sky-200 shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <h3 className="font-semibold text-base text-slate-900">AI 服务引擎配置</h3>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-sky-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-slate-700 leading-relaxed">
          默认使用内置课程上下文 AI 引擎，无需配置 Key 即可完整体验。如需连接外部大模型 API，可在下方开启。
        </div>

        <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
          <div>
            <div className="text-sm font-medium text-slate-800">启用外部大模型 API</div>
            <div className="text-xs text-slate-500">兼容 OpenAI / DeepSeek / 通义千问</div>
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
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Model</label>
              <input
                type="text"
                value={aiConfig.model}
                onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">API Key（仅存本地）</label>
              <input
                type="password"
                placeholder="sk-..."
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSaveConfig}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 cursor-pointer flex items-center gap-1.5"
          >
            {savedToast && <CheckCircle2 className="w-3.5 h-3.5" />}
            {savedToast ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // =========================================================================
  // STUDENT MODE: DEDICATED CLEAN MOBILE APP LAYOUT WITH 5 BOTTOM TAB BUTTONS
  // =========================================================================
  if (role === 'student') {
    const activeTabId: NavPage =
      currentPage === 'virtual-lab' || currentPage === 'group-collab' ? 'dashboard' : currentPage;

    return (
      <div
        className={`min-h-screen bg-[#e8f2fc] flex flex-col items-center justify-start sm:py-4 sm:px-4 ${
          reduceMotion ? 'reduce-motion' : ''
        }`}
      >
        {/* Subtle desktop role-switcher strip above the mobile phone frame */}
        <div className="hidden sm:flex items-center justify-between w-full max-w-[430px] mb-3 px-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Smartphone className="w-3.5 h-3.5 text-sky-600" />
            <span>学生移动端视图</span>
          </div>
          <div className="inline-flex rounded-lg bg-white border border-sky-200 p-0.5 shadow-xs">
            {(['teacher', 'student', 'admin'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  role === r ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile App Shell */}
        <div className="w-full sm:max-w-[430px] min-h-screen sm:min-h-0 sm:h-[calc(100vh-76px)] sm:max-h-[800px] bg-[#f4f9ff] sm:rounded-[28px] sm:border sm:border-sky-200 sm:shadow-[0_20px_50px_-15px_rgba(14,165,233,0.18)] flex flex-col overflow-hidden relative">
          {/* Clean Mobile Top App Bar */}
          <header className="sticky top-0 z-20 h-14 px-4 bg-white/95 backdrop-blur-md border-b border-sky-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold text-slate-900 tracking-tight">EduMind</div>
                <div className="text-[11px] text-slate-500">Python 数据结构 · 林致远</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Mobile-only quick switch back to Teacher */}
              <button
                onClick={() => onRoleChange('teacher')}
                className="sm:hidden px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold cursor-pointer"
              >
                切教师端
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                title="AI 引擎设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Scrollable Mobile Content */}
          <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">{children}</main>

          {/* Clean 5-Button Fixed Bottom Tab Bar */}
          <nav className="sticky sm:absolute bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-sky-100 px-2 pt-1.5 pb-2.5 sm:pb-3">
            <div className="grid grid-cols-5 gap-1">
              {STUDENT_BOTTOM_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTabId === tab.id;
                const hasBadge = tab.id === 'diagnostics' && unresolvedMistakesCount > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onNavigate(tab.id)}
                    className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors cursor-pointer ${
                      active ? 'text-sky-600 bg-sky-50' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <div className="relative">
                      <Icon className="w-5 h-5" />
                      {hasBadge && (
                        <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {unresolvedMistakesCount}
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] mt-0.5 ${active ? 'font-bold' : 'font-medium'}`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        {settingsModal}
      </div>
    );
  }

  // =========================================================================
  // TEACHER & ADMIN MODE: CLEAN UNSLOPPED DESKTOP WORKSPACE
  // =========================================================================
  const visibleNav = DESKTOP_NAV.filter((item) => item.roles.includes(role));

  return (
    <div
      className={`min-h-screen bg-[#f2f7fd] text-slate-800 flex flex-col lg:flex-row ${
        reduceMotion ? 'reduce-motion' : ''
      }`}
    >
      {/* Left Sidebar */}
      <aside className="w-full lg:w-60 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-sky-200/80 bg-white flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-5 h-16 border-b border-sky-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-base text-slate-900 tracking-tight leading-none">EduMind</div>
            <div className="text-[11px] text-slate-500 mt-0.5">AI 智慧教学平台</div>
          </div>
        </div>

        {/* Course Selector Card */}
        <div className="px-4 pt-4 pb-2 hidden lg:block">
          <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-3">
            <div className="text-[11px] text-sky-700 font-medium">当前课程</div>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">Python 程序设计与数据结构</div>
            <div className="text-[11px] text-slate-500 mt-0.5">曲阜师范大学 · 软件1班 (40人)</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            const badgeCount =
              item.id === 'checkin' && role === 'teacher' && pendingReviewCount > 0
                ? pendingReviewCount
                : 0;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 lg:shrink cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      active ? 'bg-white text-rose-600' : 'bg-rose-100 text-rose-600'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-sky-100 hidden lg:block">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold">
              {role === 'teacher' ? '张' : '管'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {role === 'teacher' ? '张教授' : '系统管理员'}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {role === 'teacher' ? '计算机学院' : '运维与合规'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 px-4 lg:px-7 border-b border-sky-200/70 bg-white/90 backdrop-blur-md flex items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-sky-50 border border-sky-200/80 p-1">
            {(['teacher', 'student', 'admin'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  role === r
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                {r === 'teacher' && <UserCheck className="w-3.5 h-3.5" />}
                {r === 'student' && <Smartphone className="w-3.5 h-3.5" />}
                {r === 'admin' && <Activity className="w-3.5 h-3.5" />}
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleReduceMotion}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer flex items-center gap-1.5 ${
                reduceMotion
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'
              }`}
            >
              <ZapOff className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{reduceMotion ? '已开启节能' : '节能模式'}</span>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:border-sky-300 cursor-pointer flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">AI 配置</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-7 max-w-[1440px] w-full mx-auto">{children}</main>

        <footer className="px-4 lg:px-7 py-3 border-t border-sky-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>EduMind AI 智慧教学平台 · 曲阜师范大学演示版</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            脱敏模拟教学数据 · AI 内容均支持教师审核
          </span>
        </footer>
      </div>

      {settingsModal}
    </div>
  );
};
