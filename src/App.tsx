import { useCallback, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { AuthError, checkPage, endSession, getSession, WORKSPACE_PAGES, type Account, type Session } from './services/authService';
import { setAIConfigAccount } from './services/aiService';
import {
  getMasteryStatus,
  INITIAL_KNOWLEDGE_NODES,
  INITIAL_MISTAKES,
  INITIAL_SUGGESTIONS,
} from './data/mockData';
import { LiveTeachingPage } from './pages/LiveTeachingPage';
import { TeachingWorkspace } from './pages/TeachingWorkspace';
import { DashboardPage } from './pages/DashboardPage';
import { DiagnosticsAndAnalyticsPage } from './pages/DiagnosticsAndAnalyticsPage';
import { GroupCollabPage } from './pages/GroupCollabPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { useAttendance } from './services/attendanceService';
import { SmartCheckInPage } from './pages/SmartCheckInPage';
import { VirtualLabPage } from './pages/VirtualLabPage';
import type {
  KnowledgeNode,
  MistakeItem,
  NavPage,
  TeachingSuggestion,
} from './types';

function invitationCode() {
  return /^#\/?join\/([0-9]{6})$/.exec(window.location.hash)?.[1];
}

function requestedPage(): NavPage {
  if (invitationCode()) return 'classroom';
  const value = window.location.hash.replace(/^#\/?/, '');
  return WORKSPACE_PAGES.find((page) => page === value) ?? 'dashboard';
}

function Workspace({ user, pages, onSession }: {
  user: Account;
  pages: NavPage[];
  onSession: (session: Session) => void;
}) {
  const role = user.role;
  const [currentPage, setCurrentPage] = useState<NavPage>(requestedPage);
  const [pendingInvite, setPendingInvite] = useState(invitationCode);
  const [approvedPage, setApprovedPage] = useState<NavPage | null>(null);
  const [pageError, setPageError] = useState<{ page: NavPage; message: string } | null>(null);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [teachingCourse, setTeachingCourse] = useState<string>();
  const [coursewareCourse, setCoursewareCourse] = useState<string>();

  function navigate(page: NavPage) {
    if (window.location.hash !== '#/' + page) window.location.hash = '/' + page;
    setCurrentPage(page);
  }

  useEffect(() => {
    const onLocationChange = () => {
      setCurrentPage(requestedPage());
      setPendingInvite(invitationCode());
    };
    window.addEventListener('hashchange', onLocationChange);
    return () => window.removeEventListener('hashchange', onLocationChange);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    checkPage(currentPage, abort.signal).then((session) => {
      if (abort.signal.aborted) return;
      if (session.user?.id !== user.id || session.user.role !== role) {
        onSession(session);
        return;
      }
      setPageError(null);
      setApprovedPage(currentPage);
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      if (error instanceof AuthError && error.status === 401) {
        onSession({ user: null, pages: [] });
        return;
      }
      setApprovedPage(null);
      setPageError({
        page: currentPage,
        message: error instanceof AuthError && error.status === 403
          ? '当前账号没有访问此页面的权限。'
          : '暂时无法验证页面权限。',
      });
    });
    return () => abort.abort();
  }, [accessAttempt, currentPage, onSession, role, user.id]);

  useEffect(() => {
    const abort = new AbortController();
    const verifySession = () => {
      if (document.hidden) return;
      getSession(abort.signal).then((session) => {
        if (!abort.signal.aborted && (session.user?.id !== user.id || session.user.role !== role)) onSession(session);
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', verifySession);
    return () => {
      abort.abort();
      document.removeEventListener('visibilitychange', verifySession);
    };
  }, [onSession, role, user.id]);

  async function logout() {
    setLogoutBusy(true);
    setLogoutError('');
    try {
      const session = await endSession();
      if (!invitationCode()) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      onSession(session);
    } catch {
      setLogoutError('暂时无法退出，请重试。');
    } finally {
      setLogoutBusy(false);
    }
  }
  const [reduceMotion, setReduceMotion] = useState(false);

  // Shared reactive state across all modules for a genuine end-to-end closed loop
  const [nodes, setNodes] = useState<KnowledgeNode[]>(INITIAL_KNOWLEDGE_NODES);
  const attendance = useAttendance(role !== 'admin');
  const checkIns = attendance.rounds.flatMap(round => round.entries);
  const [mistakes, setMistakes] = useState<MistakeItem[]>(INITIAL_MISTAKES);
  const [suggestions, setSuggestions] = useState<TeachingSuggestion[]>(INITIAL_SUGGESTIONS);

  const handleResolveMistake = (mistakeId: string, nodeId: string) => {
    setMistakes((prev) =>
      prev.map((m) => (m.id === mistakeId ? { ...m, resolved: true } : m))
    );
    // Live-update 3D Knowledge Graph mastery when student passes variant verification!
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const boosted = Math.max(n.studentMastery, 82);
        return {
          ...n,
          studentMastery: boosted,
          status: getMasteryStatus(boosted),
          mistakeCount: Math.max(0, n.mistakeCount - 1),
          evidence: {
            ...n.evidence,
            homeworkScore: Math.max(n.evidence.homeworkScore, 85),
          },
        };
      })
    );
  };

  const handleUpdateSuggestion = (id: string, status: TeachingSuggestion['status']) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const pendingReviewCount = checkIns.filter((c) => c.status === 'pending').length;
  const unresolvedMistakesCount = mistakes.filter((m) => !m.resolved).length;

  return (
    <Layout
      account={user}
      allowedPages={pages}
      onLogout={logout}
      logoutBusy={logoutBusy}
      currentPage={currentPage}
      onNavigate={navigate}
      reduceMotion={reduceMotion}
      onToggleReduceMotion={() => setReduceMotion((v) => !v)}
      pendingReviewCount={pendingReviewCount}
      unresolvedMistakesCount={unresolvedMistakesCount}
    >
      {logoutError && <p role="alert" className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{logoutError}</p>}
      {pageError?.page === currentPage ? (
        <section className="glass-panel rounded-2xl p-6">
          <h1 className="text-xl font-bold">无法打开页面</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600">{pageError.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('dashboard')} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white">回到工作台</button>
            {pages.includes(currentPage) && <button type="button" onClick={() => {
              setPageError(null);
              setAccessAttempt((attempt) => attempt + 1);
            }} className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800">重新验证</button>}
          </div>
        </section>
      ) : approvedPage !== currentPage || !pages.includes(currentPage) ? (
        <p role="status" className="py-6 text-sm text-slate-600">正在验证页面权限…</p>
      ) : (
        <>
          {currentPage === 'dashboard' && (
            <DashboardPage
              role={role}
              displayName={user.displayName}
              nodes={nodes}
              checkIns={checkIns}
              attendanceReady={attendance.loaded && !attendance.error}
              mistakes={mistakes}
              suggestions={suggestions}
              onUpdateSuggestion={handleUpdateSuggestion}
              onNavigate={navigate}
            />
          )}
          {currentPage === 'checkin' && (
            <SmartCheckInPage
              role={role}
              state={attendance}
              onNavigate={navigate}
            />
          )}
          {currentPage === 'classroom' && <LiveTeachingPage
            role={role} preferredCourse={teachingCourse} onNavigate={navigate}
            pendingInvite={pendingInvite}
            onInviteUsed={() => {
              window.history.replaceState(null, '', '#/classroom');
              setPendingInvite(undefined);
            }}
          />}
          {(currentPage === 'classes' || currentPage === 'courses' || currentPage === 'courseware') && role === 'teacher' && (
            <TeachingWorkspace key={currentPage} page={currentPage} onNavigate={navigate}
              initialCourseId={coursewareCourse}
              onManageCourse={(id) => { setCoursewareCourse(id); navigate('courseware'); }}
              onTeach={(id) => { setTeachingCourse(id); navigate('classroom'); }} />
          )}
          {currentPage === 'knowledge-graph' && (
            <KnowledgeGraphPage
              role={role}
              nodes={nodes}
              reduceMotion={reduceMotion}
              onNavigate={navigate}
            />
          )}
          {currentPage === 'virtual-lab' && <VirtualLabPage isMobile={role === 'student'} />}
          {currentPage === 'diagnostics' && (
            <DiagnosticsAndAnalyticsPage
              role={role}
              mistakes={mistakes}
              onResolveMistake={handleResolveMistake}
            />
          )}
          {currentPage === 'group-collab' && <GroupCollabPage isMobile={role === 'student'} />}
        </>
      )}
    </Layout>
  );
}

export function App() {
  const [session, setSession] = useState<Session>();
  const [bootError, setBootError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const applySession = useCallback((next: Session) => {
    setAIConfigAccount(next.user?.id ?? null);
    setSession(next);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    getSession(abort.signal).then((current) => {
      if (!abort.signal.aborted) applySession(current);
    }).catch(() => {
      if (!abort.signal.aborted) setBootError('无法连接账户服务。');
    });
    return () => abort.abort();
  }, [applySession, attempt]);

  if (!session) {
    return (
      <main className="workspace-shell grid place-items-center bg-[#f2f7fd] px-4">
        <div className="glass-panel w-full max-w-sm rounded-2xl px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">EduMind</h1>
          <p className="mt-2 text-sm text-slate-600" role={bootError ? 'alert' : 'status'}>{bootError || '正在恢复登录状态…'}</p>
          {bootError && <button type="button" onClick={() => {
            setBootError('');
            setAttempt((value) => value + 1);
          }} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">重新连接</button>}
        </div>
      </main>
    );
  }
  return session.user
    ? <Workspace key={session.user.id} user={session.user} pages={session.pages} onSession={applySession} />
    : <LoginPage onSession={applySession} studentOnly={session.studentOnly} hasInvitation={!!invitationCode()} />;
}

export default App;
