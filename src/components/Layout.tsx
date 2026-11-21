import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Camera,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  ZapOff,
} from 'lucide-react';
import type { AIConfig, NavPage, UserRole } from '../types';
import { loadAIConfig, saveAIConfig } from '../services/aiService';
import { ROLE_NAMES, type Account } from '../services/authService';

interface LayoutProps {
  account: Account;
  allowedPages: NavPage[];
  onLogout: () => void;
  logoutBusy: boolean;
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

export const Layout: React.FC<LayoutProps> = ({
  account,
  allowedPages,
  onLogout,
  logoutBusy,
  currentPage,
  onNavigate,
  reduceMotion,
  onToggleReduceMotion,
  pendingReviewCount,
  unresolvedMistakesCount,
  children,
}) => {
  const role = account.role;
  const contentArea = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (contentArea.current) contentArea.current.scrollTop = 0;
  }, [currentPage]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeDrawerOnDesktop = () => {
      if (desktop.matches) menu.current?.close();
    };
    desktop.addEventListener('change', closeDrawerOnDesktop);
    return () => desktop.removeEventListener('change', closeDrawerOnDesktop);
  }, []);

  const logoutButton = (
    <button type="button" aria-label="退出登录" title="退出登录" disabled={logoutBusy}
      onClick={() => { menu.current?.close(); onLogout(); }}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60">
      <LogOut className="size-4" />
    </button>
  );

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
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="workspace-settings w-full max-w-md rounded-2xl bg-white border border-sky-200 shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <h3 id="settings-title" className="font-semibold text-base text-slate-900">AI 服务引擎配置</h3>
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
        className={`workspace-shell bg-[#e8f2fc] flex flex-col items-center justify-center min-h-0 sm:py-3 sm:px-4 ${
          reduceMotion ? 'reduce-motion' : ''
        }`}
      >
        <div className="w-full flex-1 min-h-0 sm:max-w-[430px] sm:max-h-[800px] bg-[#f4f9ff] sm:rounded-[28px] sm:border sm:border-sky-200 sm:shadow-[0_20px_50px_-15px_rgba(14,165,233,0.18)] flex flex-col overflow-hidden relative">
          {/* Clean Mobile Top App Bar */}
          <header className="sticky top-0 z-20 h-14 px-4 bg-white/95 backdrop-blur-md border-b border-sky-100 flex items-center justify-between shrink-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-sky-600 flex items-center justify-center text-white">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-sm font-bold text-slate-900 tracking-tight">EduMind</div>
                <div className="truncate text-[11px] text-slate-500">学生端 · {account.displayName}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {logoutButton}
              <button
                onClick={() => setSettingsOpen(true)}
              aria-label="AI 引擎配置"
                className="p-2 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                title="AI 引擎设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Scrollable Mobile Content */}
          <main ref={contentArea} className="workspace-scroll workspace-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-4">{children}</main>

          {/* Clean 5-Button Fixed Bottom Tab Bar */}
          <nav aria-label="学生导航" className="student-workspace-tabs z-30 shrink-0 bg-white/95 backdrop-blur-md border-t border-sky-100 px-2 pt-1.5">
            <div className="grid grid-cols-5 gap-1">
              {STUDENT_BOTTOM_TABS.filter((tab) => allowedPages.includes(tab.id)).map((tab) => {
                const Icon = tab.icon;
                const active = activeTabId === tab.id;
                const hasBadge = tab.id === 'diagnostics' && unresolvedMistakesCount > 0;
                return (
                  <button
                    key={tab.id}
                    aria-current={active ? 'page' : undefined}
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
  const visibleNav = DESKTOP_NAV.filter((item) => item.roles.includes(role) && allowedPages.includes(item.id));

  const sidebar = (
    <>
        {/* Brand */}
        <div className="workspace-brand px-5 min-h-16 shrink-0 border-b border-sky-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-base text-slate-900 tracking-tight leading-none">EduMind</div>
            <div className="text-[11px] text-slate-500 mt-0.5">AI 智慧教学平台</div>
          </div>
        </div>

        {/* Course Selector Card */}
        <div className="workspace-course shrink-0 px-4 pt-4 pb-2">
          <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-3">
            <div className="text-[11px] text-sky-700 font-medium">当前课程</div>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">Python 程序设计与数据结构</div>
            <div className="text-[11px] text-slate-500 mt-0.5">曲阜师范大学 · 软件1班 (40人)</div>
          </div>
        </div>

        {/* Nav */}
        <nav aria-label="功能导航" className="flex-1 min-h-0 px-3 py-2 flex flex-col gap-1 overflow-y-auto overscroll-y-contain">
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
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  menu.current?.close();
                  onNavigate(item.id);
                }}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors workspace-link shrink-0 cursor-pointer ${
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
        <div className="workspace-identity shrink-0 p-3 border-t border-sky-100">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold">
              {Array.from(account.displayName)[0]}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {account.displayName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {ROLE_NAMES[role]}
              </div>
            </div>
          </div>
        </div>
    </>
  );

  return (
    <div className={`workspace-shell bg-[#f2f7fd] text-slate-800 flex overflow-hidden ${reduceMotion ? 'reduce-motion' : ''}`}>
      <aside className="hidden lg:flex lg:w-60 h-full border-r border-sky-200/80 bg-white flex-col shrink-0">
        {sidebar}
      </aside>
      <dialog ref={menu} id="workspace-nav-menu" aria-label="工作区导航"
        className="workspace-menu fixed inset-y-0 left-0 right-auto m-0 max-w-none max-h-none overflow-hidden border-0 bg-white backdrop:bg-slate-900/45"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="relative flex h-full flex-col">
          <button type="button" aria-label="关闭导航" onClick={() => menu.current?.close()}
            className="absolute right-2 top-2 grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-sky-50"><X className="size-5" /></button>
          {sidebar}
        </div>
      </dialog>

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <header className="z-20 min-h-16 shrink-0 px-3 lg:px-7 border-b border-sky-200/70 bg-white/90 backdrop-blur-md flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" aria-label="打开导航" aria-haspopup="dialog" aria-controls="workspace-nav-menu"
              onClick={() => menu.current?.showModal()}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-sky-200 bg-white text-sky-700 lg:hidden"><Menu className="size-5" /></button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{account.displayName}</p>
              <p className="text-xs text-slate-600">{ROLE_NAMES[role]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleReduceMotion}
              aria-label="节能模式"
              aria-pressed={reduceMotion}
              className={`min-h-10 min-w-10 justify-center px-2.5 rounded-lg text-xs font-medium border cursor-pointer flex items-center gap-1.5 ${
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
              aria-label="AI 引擎配置"
              className="min-h-10 min-w-10 justify-center px-2.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:border-sky-300 cursor-pointer flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">AI 配置</span>
            </button>
            {logoutButton}
          </div>
        </header>

        <section ref={contentArea} className="workspace-scroll flex flex-1 min-h-0 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <main className="workspace-content flex-1 p-4 lg:p-7 max-w-[1440px] w-full mx-auto">{children}</main>

        <footer className="px-4 lg:px-7 py-3 border-t border-sky-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>EduMind AI 智慧教学平台 · 曲阜师范大学演示版</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            脱敏模拟教学数据 · AI 内容均支持教师审核
          </span>
          </footer>
        </section>
      </div>

      {settingsModal}
    </div>
  );
};
