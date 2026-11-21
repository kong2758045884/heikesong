import { useState } from 'react';
import { Layout } from './components/Layout';
import {
  getMasteryStatus,
  INITIAL_CHECKINS,
  INITIAL_KNOWLEDGE_NODES,
  INITIAL_MISTAKES,
  INITIAL_SUGGESTIONS,
} from './data/mockData';
import { ClassroomPage } from './pages/ClassroomPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiagnosticsAndAnalyticsPage } from './pages/DiagnosticsAndAnalyticsPage';
import { GroupCollabPage } from './pages/GroupCollabPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { SmartCheckInPage } from './pages/SmartCheckInPage';
import { VirtualLabPage } from './pages/VirtualLabPage';
import type {
  CheckInRecord,
  KnowledgeNode,
  MistakeItem,
  NavPage,
  TeachingSuggestion,
  UserRole,
} from './types';

export function App() {
  const [role, setRole] = useState<UserRole>('teacher');
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [reduceMotion, setReduceMotion] = useState(false);

  // Shared reactive state across all modules for a genuine end-to-end closed loop
  const [nodes, setNodes] = useState<KnowledgeNode[]>(INITIAL_KNOWLEDGE_NODES);
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>(INITIAL_CHECKINS);
  const [mistakes, setMistakes] = useState<MistakeItem[]>(INITIAL_MISTAKES);
  const [suggestions, setSuggestions] = useState<TeachingSuggestion[]>(INITIAL_SUGGESTIONS);

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    if (nextRole === 'admin') {
      setCurrentPage('dashboard');
    }
  };

  const handleApproveCheckIn = (id: string) => {
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
  };

  const handleAddCheckIn = (record: CheckInRecord) => {
    setCheckIns((prev) => [record, ...prev]);
  };

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

  const pendingReviewCount = checkIns.filter((c) => c.status === 'review-needed').length;
  const unresolvedMistakesCount = mistakes.filter((m) => !m.resolved).length;

  return (
    <Layout
      role={role}
      onRoleChange={handleRoleChange}
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      reduceMotion={reduceMotion}
      onToggleReduceMotion={() => setReduceMotion((v) => !v)}
      pendingReviewCount={pendingReviewCount}
      unresolvedMistakesCount={unresolvedMistakesCount}
    >
      {currentPage === 'dashboard' && (
        <DashboardPage
          role={role}
          nodes={nodes}
          checkIns={checkIns}
          mistakes={mistakes}
          suggestions={suggestions}
          onUpdateSuggestion={handleUpdateSuggestion}
          onNavigate={setCurrentPage}
        />
      )}
      {currentPage === 'checkin' && (
        <SmartCheckInPage
          role={role}
          checkIns={checkIns}
          onApproveCheckIn={handleApproveCheckIn}
          onAddCheckIn={handleAddCheckIn}
        />
      )}
      {currentPage === 'classroom' && <ClassroomPage role={role} />}
      {currentPage === 'knowledge-graph' && (
        <KnowledgeGraphPage
          role={role}
          nodes={nodes}
          reduceMotion={reduceMotion}
          onNavigate={setCurrentPage}
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
    </Layout>
  );
}

export default App;
