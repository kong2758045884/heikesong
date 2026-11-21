import { lazy, Suspense, useCallback, useState } from 'react';
import { Layout } from './components/Layout';
import {
  getMasteryStatus,
  INITIAL_CHECKINS,
  INITIAL_KNOWLEDGE_NODES,
  INITIAL_MISTAKES,
  INITIAL_SUGGESTIONS,
  STUDENT_CLASSES,
} from './data/mockData';
import {
  useCoarsePointer,
  usePersistentState,
  usePrefersReducedMotion,
} from './hooks/usePersistentState';
import { useHashRoute } from './hooks/useHashRoute';
// Heavy pages (three.js / recharts) are split into their own chunks so the
// first paint on a phone does not wait for the 3D and chart libraries.
const ClassroomPage = lazy(() =>
  import('./pages/ClassroomPage').then((m) => ({ default: m.ClassroomPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const DiagnosticsAndAnalyticsPage = lazy(() =>
  import('./pages/DiagnosticsAndAnalyticsPage').then((m) => ({ default: m.DiagnosticsAndAnalyticsPage }))
);
const GroupCollabPage = lazy(() =>
  import('./pages/GroupCollabPage').then((m) => ({ default: m.GroupCollabPage }))
);
const KnowledgeGraphPage = lazy(() =>
  import('./pages/KnowledgeGraphPage').then((m) => ({ default: m.KnowledgeGraphPage }))
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((m) => ({ default: m.ReportPage }))
);
const SmartCheckInPage = lazy(() =>
  import('./pages/SmartCheckInPage').then((m) => ({ default: m.SmartCheckInPage }))
);
const VirtualLabPage = lazy(() =>
  import('./pages/VirtualLabPage').then((m) => ({ default: m.VirtualLabPage }))
);
import type {
  CheckInRecord,
  KnowledgeNode,
  MistakeItem,
  NavPage,
  TeachingSuggestion,
  UserRole,
} from './types';

const STORAGE_PREFIX = 'edumind_student_v2_';

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="页面加载中" role="status">
      <div className="h-6 w-32 rounded-lg bg-sky-100" />
      <div className="h-32 rounded-2xl bg-sky-100/80" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-sky-100/80" />
        <div className="h-24 rounded-2xl bg-sky-100/80" />
      </div>
      <div className="h-40 rounded-2xl bg-sky-100/60" />
    </div>
  );
}

export function App() {
  const { route, navigate, changeRole } = useHashRoute();
  const { role, page } = route;
  const isCoarsePointer = useCoarsePointer();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);

  // Shared, persisted state across all modules so the learning loop is real:
  // a check-in updates the report, a resolved mistake lifts graph mastery, etc.
  const [nodes, setNodes] = usePersistentState<KnowledgeNode[]>(
    `${STORAGE_PREFIX}nodes`,
    INITIAL_KNOWLEDGE_NODES
  );
  const [checkIns, setCheckIns] = usePersistentState<CheckInRecord[]>(
    `${STORAGE_PREFIX}checkins`,
    INITIAL_CHECKINS
  );
  const [mistakes, setMistakes] = usePersistentState<MistakeItem[]>(
    `${STORAGE_PREFIX}mistakes`,
    INITIAL_MISTAKES
  );
  const [suggestions, setSuggestions] = usePersistentState<TeachingSuggestion[]>(
    `${STORAGE_PREFIX}suggestions`,
    INITIAL_SUGGESTIONS
  );
  const [completedTasks, setCompletedTasks] = usePersistentState<string[]>(
    `${STORAGE_PREFIX}tasks`,
    ['p1']
  );
  // null = show the class picker; a class id = show that class's workspace.
  // Kept in memory so a fresh visit starts from the class list again.
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const activeClass = STUDENT_CLASSES.find((c) => c.id === activeClassId) ?? STUDENT_CLASSES[0];

  const resetDemoData = useCallback(() => {
    setNodes(INITIAL_KNOWLEDGE_NODES);
    setCheckIns(INITIAL_CHECKINS);
    setMistakes(INITIAL_MISTAKES);
    setSuggestions(INITIAL_SUGGESTIONS);
    setCompletedTasks(['p1']);
    setActiveClassId(null);
    navigate('dashboard');
  }, [navigate, setCheckIns, setCompletedTasks, setMistakes, setNodes, setSuggestions]);

  const markTaskDone = useCallback(
    (id: string) => {
      setCompletedTasks((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [setCompletedTasks]
  );

  const handleApproveCheckIn = useCallback(
    (id: string) => {
      setCheckIns((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: 'verified',
                reason: '已由教师张教授人工复核确认在场 ✓',
              }
            : c
        )
      );
    },
    [setCheckIns]
  );

  const handleAddCheckIn = useCallback(
    (record: CheckInRecord) => {
      setCheckIns((prev) => [{ ...record, classId: activeClass.id }, ...prev]);
      // A completed check-in closes the first stop on the learning path.
      markTaskDone('p1');
    },
    [activeClass.id, markTaskDone, setCheckIns]
  );

  const handleResolveMistake = useCallback(
    (mistakeId: string, nodeId: string) => {
      setMistakes((prev) =>
        prev.map((m) => (m.id === mistakeId ? { ...m, resolved: true } : m))
      );
      // Passing the variant verification should visibly move the graph,
      // the report and the home page — not just flip a local badge.
      // Mastering a variant closes the "diagnose + verify" learning task.
      markTaskDone('p3');
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
    },
    [markTaskDone, setMistakes, setNodes]
  );

  const handleUpdateSuggestion = useCallback(
    (id: string, status: TeachingSuggestion['status']) => {
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    },
    [setSuggestions]
  );

  const toggleTask = useCallback(
    (id: string) => {
      setCompletedTasks((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    },
    [setCompletedTasks]
  );

  const handleRoleChange = useCallback(
    (nextRole: UserRole) => {
      changeRole(nextRole);
    },
    [changeRole]
  );

  const pendingReviewCount = checkIns.filter((c) => c.status === 'review-needed').length;
  const unresolvedMistakesCount = mistakes.filter((m) => !m.resolved).length;

  return (
    <Layout
      role={role}
      onRoleChange={handleRoleChange}
      currentPage={page}
      onNavigate={(next: NavPage) => navigate(next)}
      reduceMotion={reduceMotion}
      onToggleReduceMotion={() => setReduceMotion((v) => !v)}
      pendingReviewCount={pendingReviewCount}
      unresolvedMistakesCount={unresolvedMistakesCount}
      onResetDemoData={resetDemoData}
    >
      <Suspense fallback={<PageSkeleton />}>
      {page === 'dashboard' && (
        <DashboardPage
          role={role}
          nodes={nodes}
          checkIns={checkIns}
          mistakes={mistakes}
          suggestions={suggestions}
          completedTasks={completedTasks}
          onToggleTask={toggleTask}
          onUpdateSuggestion={handleUpdateSuggestion}
          onNavigate={(next) => navigate(next)}
          activeClassId={activeClassId}
          onSelectClass={(id) => setActiveClassId(id)}
          onExitClass={() => setActiveClassId(null)}
        />
      )}
      {page === 'checkin' && (
        <SmartCheckInPage
          role={role}
          checkIns={checkIns}
          onApproveCheckIn={handleApproveCheckIn}
          onAddCheckIn={handleAddCheckIn}
          designatedGesture={activeClass.checkInGesture}
          designatedBy={`${activeClass.teacher} · ${activeClass.name}`}
        />
      )}
      {page === 'classroom' && <ClassroomPage role={role} />}
      {page === 'knowledge-graph' && (
        <KnowledgeGraphPage
          role={role}
          nodes={nodes}
          reduceMotion={reduceMotion}
          isCoarsePointer={isCoarsePointer}
          onNavigate={(next) => navigate(next)}
        />
      )}
      {page === 'virtual-lab' && <VirtualLabPage isMobile={role === 'student'} />}
      {page === 'diagnostics' && (
        <DiagnosticsAndAnalyticsPage
          role={role}
          mistakes={mistakes}
          onResolveMistake={handleResolveMistake}
          onNavigate={(next) => navigate(next)}
        />
      )}
      {page === 'group-collab' && <GroupCollabPage isMobile={role === 'student'} />}
      {page === 'report' && (
        <ReportPage
          role={role}
          nodes={nodes}
          checkIns={checkIns}
          mistakes={mistakes}
          completedTasks={completedTasks}
          onNavigate={(next) => navigate(next)}
        />
      )}
      </Suspense>
    </Layout>
  );
}

export default App;
