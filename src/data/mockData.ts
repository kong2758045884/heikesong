import type {
  CheckInRecord,
  GroupTask,
  KnowledgeNode,
  MasteryStatus,
  MistakeItem,
  QuizQuestion,
  SlideItem,
  StudentClass,
  SubtitleEntry,
  TeachingSuggestion,
} from '../types';

export function getMasteryStatus(score: number): MasteryStatus {
  if (score === 0) return 'unlearned';
  if (score >= 80) return 'mastered';
  if (score >= 60) return 'needs-review';
  return 'weak';
}

export const STATUS_META: Record<
  MasteryStatus,
  { label: string; color: string; bg: string; border: string; hex: string }
> = {
  mastered: {
    label: '掌握良好',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    hex: '#10b981',
  },
  'needs-review': {
    label: '需加强巩固',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    hex: '#f59e0b',
  },
  weak: {
    label: '薄弱知识点',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    hex: '#f43f5e',
  },
  unlearned: {
    label: '尚未学习',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    hex: '#64748b',
  },
};

export const INITIAL_KNOWLEDGE_NODES: KnowledgeNode[] = [
  {
    id: 'var',
    label: '变量与数据类型',
    chapter: '第1章',
    position: [-4.5, 2.4, -1.2],
    prerequisites: [],
    studentMastery: 94,
    classMastery: 92,
    status: 'mastered',
    classStatus: 'mastered',
    description: '理解 Python 动态类型机制、不可变对象（int/str/tuple）与可变对象（list/dict）的引用区别。',
    evidence: { quizScore: 95, homeworkScore: 96, prereqScore: 90 },
    mistakeCount: 0,
    keyFormula: 'id(a) == id(b) 判定对象引用同一性',
  },
  {
    id: 'cond',
    label: '条件判断与分支',
    chapter: '第1章',
    position: [-2.6, 2.8, 0.8],
    prerequisites: ['var'],
    studentMastery: 91,
    classMastery: 89,
    status: 'mastered',
    classStatus: 'mastered',
    description: '掌握 if-elif-else 分支结构、布尔短路求值（and/or）及三元表达式。',
    evidence: { quizScore: 92, homeworkScore: 90, prereqScore: 94 },
    mistakeCount: 0,
  },
  {
    id: 'loop',
    label: '循环与迭代',
    chapter: '第2章',
    position: [-1.0, 1.8, -1.6],
    prerequisites: ['cond'],
    studentMastery: 86,
    classMastery: 84,
    status: 'mastered',
    classStatus: 'mastered',
    description: '熟练使用 for/while 循环、break/continue 控制流、enumerate 与列表推导式。',
    evidence: { quizScore: 85, homeworkScore: 88, prereqScore: 91 },
    mistakeCount: 1,
    recommendedLab: 'sorting',
  },
  {
    id: 'func',
    label: '函数与作用域',
    chapter: '第2章',
    position: [0.4, 2.3, 1.0],
    prerequisites: ['loop'],
    studentMastery: 78,
    classMastery: 79,
    status: 'needs-review',
    classStatus: 'needs-review',
    description: '理解形参/实参、默认参数陷阱、LEGB 作用域查找规则与函数返回值。',
    evidence: { quizScore: 76, homeworkScore: 80, prereqScore: 86 },
    mistakeCount: 1,
  },
  {
    id: 'recursion',
    label: '递归与调用栈',
    chapter: '第3章',
    position: [0.8, 0.2, 0.0],
    prerequisites: ['func'],
    studentMastery: 44,
    classMastery: 52,
    status: 'weak',
    classStatus: 'weak',
    description: '核心难点：掌握递归出口（Base Case）、递归推进关系与系统调用栈帧（Call Stack）的压栈/出栈过程。',
    evidence: { quizScore: 42, homeworkScore: 45, prereqScore: 78 },
    mistakeCount: 4,
    recommendedLab: 'recursion',
    keyFormula: 'T(n) = T(n-1) + O(1), 必须存在可到达的 Base Case',
  },
  {
    id: 'list',
    label: '列表与切片',
    chapter: '第3章',
    position: [-2.4, -0.5, 1.8],
    prerequisites: ['loop'],
    studentMastery: 88,
    classMastery: 85,
    status: 'mastered',
    classStatus: 'mastered',
    description: '掌握列表动态扩容机制、切片浅拷贝、排序算法的时间复杂度对比。',
    evidence: { quizScore: 88, homeworkScore: 90, prereqScore: 86 },
    mistakeCount: 0,
    recommendedLab: 'sorting',
  },
  {
    id: 'dict',
    label: '字典与哈希映射',
    chapter: '第4章',
    position: [-0.8, -1.6, 2.2],
    prerequisites: ['list'],
    studentMastery: 74,
    classMastery: 76,
    status: 'needs-review',
    classStatus: 'needs-review',
    description: '理解哈希表 O(1) 查找原理、可哈希键约束与字典统计/记忆化搜索应用。',
    evidence: { quizScore: 72, homeworkScore: 75, prereqScore: 88 },
    mistakeCount: 1,
  },
  {
    id: 'stack',
    label: '栈与队列',
    chapter: '第4章',
    position: [2.4, 1.4, -1.4],
    prerequisites: ['list', 'recursion'],
    studentMastery: 66,
    classMastery: 68,
    status: 'needs-review',
    classStatus: 'needs-review',
    description: '理解 LIFO（后进先出）与 FIFO（先进先出）模型，能用显式栈模拟递归过程。',
    evidence: { quizScore: 64, homeworkScore: 68, prereqScore: 66 },
    mistakeCount: 2,
    recommendedLab: 'recursion',
  },
  {
    id: 'linkedlist',
    label: '链表操作',
    chapter: '第5章',
    position: [2.8, -0.8, 1.5],
    prerequisites: ['list', 'func'],
    studentMastery: 55,
    classMastery: 58,
    status: 'weak',
    classStatus: 'weak',
    description: '掌握单链表节点指针修改、头插法/尾插法、双指针反转链表与边界空指针防护。',
    evidence: { quizScore: 52, homeworkScore: 56, prereqScore: 78 },
    mistakeCount: 2,
  },
  {
    id: 'tree',
    label: '二叉树与遍历',
    chapter: '第5章',
    position: [4.2, 0.5, 0.2],
    prerequisites: ['recursion', 'stack'],
    studentMastery: 48,
    classMastery: 54,
    status: 'weak',
    classStatus: 'weak',
    description: '掌握二叉树前序、中序、后序递归遍历及层序（BFS）队列遍历。',
    evidence: { quizScore: 46, homeworkScore: 50, prereqScore: 55 },
    mistakeCount: 3,
    recommendedLab: 'tree',
    keyFormula: '前序: 根-左-右 | 中序: 左-根-右 | 后序: 左-右-根',
  },
  {
    id: 'graph',
    label: '图搜索 (DFS/BFS)',
    chapter: '第6章',
    position: [5.4, -1.5, -1.0],
    prerequisites: ['tree', 'dict'],
    studentMastery: 0,
    classMastery: 0,
    status: 'unlearned',
    classStatus: 'unlearned',
    description: '待解锁章节：邻接表建模、深度优先搜索（DFS）、广度优先搜索（BFS）与最短路径。',
    evidence: { quizScore: 0, homeworkScore: 0, prereqScore: 48 },
    mistakeCount: 0,
  },
];


export const STUDENT_CLASSES: StudentClass[] = [
  {
    id: 'cls-py-01',
    name: 'Python 数据结构',
    code: 'CS-PY-2026-01',
    teacher: '周敏',
    teacherTitle: '副教授',
    term: '2026 秋季学期',
    schedule: '周二 3-4 节',
    room: '信息楼 302',
    studentCount: 46,
    progress: 72,
    status: 'ongoing',
    live: true,
    theme: 'sky',
    nextSession: '今天 15:00 · 递归与调用栈',
    attendance: 96,
    unread: 2,
    checkInGesture: 'v',
  },
  {
    id: 'cls-py-02',
    name: 'Python 数据结构（2 班）',
    code: 'CS-PY-2026-02',
    teacher: '周敏',
    teacherTitle: '副教授',
    term: '2026 秋季学期',
    schedule: '周四 1-2 节',
    room: '信息楼 305',
    studentCount: 44,
    progress: 64,
    status: 'ongoing',
    theme: 'violet',
    nextSession: '明天 09:00 · 函数与作用域',
    attendance: 92,
    unread: 0,
    checkInGesture: 'thumb',
  },
  {
    id: 'cls-algo-01',
    name: '算法基础与竞赛',
    code: 'CS-AL-2026-01',
    teacher: '王浩',
    teacherTitle: '讲师',
    term: '2026 秋季学期',
    schedule: '周五 5-6 节',
    room: '实验楼 401',
    studentCount: 38,
    progress: 58,
    status: 'upcoming',
    theme: 'emerald',
    nextSession: '周五 13:30 · 图搜索 BFS/DFS',
    attendance: 89,
    unread: 1,
    checkInGesture: 'ok',
  },
];

export const COURSE_SLIDES: SlideItem[] = [
  {
    id: 's1',
    pageNumber: 1,
    chapter: '第3章 递归与调用栈',
    title: '3.1 什么是递归？从大问题拆解到最小子问题',
    subtitle: '曲阜师范大学 · Python 程序设计与数据结构（2026秋）',
    keyPoints: [
      '递归（Recursion）是指函数在定义中直接或间接调用自身的编程思想。',
      '任何合法递归必须包含两大要素：① 递归出口（Base Case）；② 规模缩小的递归推进（Recursive Step）。',
      '若缺少可到达的递归出口，将导致无限调用并触发 RecursionError（栈溢出）。',
    ],
    formula: 'n! = n × (n - 1)!,  且当 n = 0 或 1 时,  0! = 1',
    codeSnippet: `def factorial(n: int) -> int:
    # ① 递归出口 (Base Case) — 防止无限压栈
    if n <= 1:
        return 1
    # ② 递归推进 — 问题规模严格向出口收敛
    return n * factorial(n - 1)`,
    aiSummary: '本页核心：递归 = 终止条件（出口）+ 规模递减调用。62% 初学者错题源于漏写出口或递减方向错误。',
    commonPitfall: '常见误区：忘记处理 n == 0 或负数边界，或者在递归调用时忘记写 return 导致返回 None。',
  },
  {
    id: 's2',
    pageNumber: 2,
    chapter: '第3章 递归与调用栈',
    title: '3.2 幕后真相：系统调用栈（Call Stack）的压栈与回溯',
    subtitle: '为什么递归函数“先递进去，再归出来”？',
    keyPoints: [
      '每次调用 factorial(k) 时，系统都会在内存中开辟一个独立的「栈帧（Stack Frame）」保存局部变量与返回地址。',
      '递推阶段：factorial(4) → factorial(3) → factorial(2) → factorial(1) 依次压栈（Push）。',
      '回溯阶段：命中 Base Case 返回 1 后，栈帧按 LIFO（后进先出）顺序依次弹出并完成乘法计算。',
    ],
    formula: '空间复杂度 S(n) = O(n)（取决于最大调用栈深度）',
    codeSnippet: `# 调用 factorial(4) 的栈帧演化轨迹：
# Push: factorial(4) -> 等待 4 * factorial(3)
# Push: factorial(3) -> 等待 3 * factorial(2)
# Push: factorial(2) -> 等待 2 * factorial(1)
# Hit : factorial(1) -> return 1  (触底反弹!)
# Pop : factorial(2) -> return 2 * 1 = 2
# Pop : factorial(3) -> return 3 * 2 = 6
# Pop : factorial(4) -> return 4 * 6 = 24`,
    aiSummary: '本页核心：递归并不是魔法，而是系统替你维护了一个隐式栈。理解压栈/弹栈顺序即可秒懂二叉树遍历。',
    commonPitfall: '常见误区：以为递归空间复杂度是 O(1)，忽略了 n 层栈帧占用的 O(n) 内存。',
  },
  {
    id: 's3',
    pageNumber: 3,
    chapter: '第3章 递归与调用栈',
    title: '3.3 性能警报：斐波那契重复计算与记忆化优化',
    subtitle: '从指数级 O(2^n) 优化到线性级 O(n)',
    keyPoints: [
      '朴素递归 fib(n) = fib(n-1) + fib(n-2) 会形成庞大的递归树，大量子问题被重复计算。',
      '使用字典缓存（Memoization）或 @lru_cache 可将已计算结果存起来，避免重复分支。',
      '工程实践中，深度过大的递归可借助「显式栈」或「迭代」改写。',
    ],
    formula: '朴素递归 T(n) = O(2^n)  →  记忆化优化后 T(n) = O(n)',
    codeSnippet: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n: int) -> int:
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)`,
    aiSummary: '本页核心：结合第4章「字典哈希」做记忆化缓存，是递归走向动态规划（DP）的关键桥梁。',
    commonPitfall: '常见误区：只写递归不分析时间复杂度，n=40 时程序直接卡死。',
  },
];

export const INITIAL_SUBTITLES: SubtitleEntry[] = [
  {
    id: 'sub1',
    time: '09:12:04',
    zh: '同学们注意看，写递归函数第一件事永远不是写递归调用，而是先确定递归出口（Base Case）。',
    en: 'Pay attention everyone: the first step in writing recursion is always defining the Base Case.',
    term: {
      word: '递归出口 (Base Case)',
      definition: '递归函数不再继续调用自身、直接返回结果的终止条件，缺失会导致无限递归和栈溢出。',
    },
    starred: true,
  },
  {
    id: 'sub2',
    time: '09:12:28',
    zh: '每调用一次自身，Python 解释器就会在调用栈（Call Stack）顶部压入一个新的栈帧。',
    en: 'Each self-call pushes a new Stack Frame onto the top of the Python Call Stack.',
    term: {
      word: '调用栈 (Call Stack)',
      definition: '遵循后进先出（LIFO）原则的内存区域，用于保存函数调用链上的局部变量与返回位置。',
    },
  },
  {
    id: 'sub3',
    time: '09:12:51',
    zh: '如果递归深度超过默认限制（通常为 1000 层），系统就会抛出栈溢出异常（RecursionError）。',
    en: 'If recursion depth exceeds the default limit (~1000 frames), Python raises a RecursionError.',
    term: {
      word: '栈溢出 (Stack Overflow)',
      definition: '函数调用层级过深耗尽调用栈空间引发的运行时错误，常由缺失出口或收敛方向错误导致。',
    },
  },
];

export const INITIAL_CHECKINS: CheckInRecord[] = [
  {
    id: 'chk1',
    studentId: '20240101',
    studentName: '林致远',
    time: '08:57:12',
    status: 'verified',
    gesture: '✌️ 剪刀手',
    confidence: 98.4,
    checks: {
      studentPresent: true,
      teacherPresent: true,
      blackboardVisible: true,
      gestureMatched: true,
      livenessPassed: true,
      qualityOk: true,
    },
  },
  {
    id: 'chk2',
    studentId: '20240108',
    studentName: '苏念安',
    time: '08:58:03',
    status: 'verified',
    gesture: '✌️ 剪刀手',
    confidence: 96.7,
    checks: {
      studentPresent: true,
      teacherPresent: true,
      blackboardVisible: true,
      gestureMatched: true,
      livenessPassed: true,
      qualityOk: true,
    },
  },
  {
    id: 'chk3',
    studentId: '20240115',
    studentName: '陈明轩',
    time: '08:59:41',
    status: 'review-needed',
    gesture: '✌️ 剪刀手',
    confidence: 64.2,
    reason: '后排座位拍摄，黑板区域存在强光反光，置信度低于自动通过阈值，已转教师人工复核。',
    checks: {
      studentPresent: true,
      teacherPresent: true,
      blackboardVisible: false,
      gestureMatched: true,
      livenessPassed: true,
      qualityOk: true,
    },
  },
  {
    id: 'chk4',
    studentId: '20240122',
    studentName: '周雨桐',
    time: '09:02:18',
    status: 'late',
    gesture: '✌️ 剪刀手',
    confidence: 95.1,
    reason: '超过 09:00 截止时间 2 分 18 秒，自动标记迟到。',
    checks: {
      studentPresent: true,
      teacherPresent: true,
      blackboardVisible: true,
      gestureMatched: true,
      livenessPassed: true,
      qualityOk: true,
    },
  },
  {
    id: 'chk5',
    studentId: '20240129',
    studentName: '赵子墨',
    time: '08:59:55',
    status: 'review-needed',
    gesture: '✌️ 剪刀手',
    confidence: 68.5,
    reason: '教师恰好转身写板书，侧脸置信度偏低，请教师一键确认在场。',
    checks: {
      studentPresent: true,
      teacherPresent: false,
      blackboardVisible: true,
      gestureMatched: true,
      livenessPassed: true,
      qualityOk: true,
    },
  },
];

export const INITIAL_MISTAKES: MistakeItem[] = [
  {
    id: 'm1',
    nodeId: 'recursion',
    nodeLabel: '递归与调用栈',
    question: '编写递归函数 sum_to_n(n)，计算 1 + 2 + ... + n 的和（n ≥ 0）。',
    studentCode: `def sum_to_n(n):
    if n == 1:
        return 1
    sum_to_n(n - 1) + n  # ❌ 缺少 return 且未处理 n=0`,
    correctCode: `def sum_to_n(n):
    if n <= 0:
        return 0
    return n + sum_to_n(n - 1)`,
    errorDimension: '递归出口遗漏',
    aiDiagnosis:
      '诊断出两个关键缺陷：① 递归推进语句缺少 `return`，导致内层栈帧计算结果未回传，触发 `TypeError: unsupported operand type(s) for +: NoneType and int`；② 边界条件仅判断 `n == 1`，当传入 `n = 0` 时会无限向下递归至栈溢出。',
    knowledgeSupplement:
      '【回溯返回值法则】每次递归调用都必须在当前栈帧显式 `return` 结果给上一层调用者；且 Base Case 建议使用不等式（如 `n <= 0`）兜底边界输入。',
    variantQuestion: {
      prompt: '【举一反三 · 变式巩固】以下递归函数计算列表元素之和，横线处应填入什么才能正确回溯结果？\n`def list_sum(arr): return 0 if not arr else __________`',
      options: [
        'arr[0] + list_sum(arr)',
        'arr[0] + list_sum(arr[1:])',
        'list_sum(arr[1:])',
        'return arr[0] + arr[1:]',
      ],
      correctIndex: 1,
      explanation: '必须通过切片 `arr[1:]` 缩小问题规模，并与当前元素 `arr[0]` 相加后返回，最终在 `not arr`（空列表）时命中出口返回 0。',
    },
    resolved: false,
  },
  {
    id: 'm2',
    nodeId: 'tree',
    nodeLabel: '二叉树与遍历',
    question: '写出二叉树中序遍历（In-order）的递归访问顺序。',
    studentCode: `def inorder(root):
    if not root:
        return
    print(root.val)   # ❌ 放到了最前面，变成了前序遍历
    inorder(root.left)
    inorder(root.right)`,
    correctCode: `def inorder(root):
    if not root:
        return
    inorder(root.left)
    print(root.val)   # ✅ 根节点在左、右子树之间访问
    inorder(root.right)`,
    errorDimension: '概念混淆',
    aiDiagnosis:
      '混淆了「前序遍历（根-左-右）」与「中序遍历（左-根-右）」中访问根节点的时机。记住口诀：“前中后”全看根节点排第几。',
    knowledgeSupplement:
      '对于二叉搜索树（BST），中序遍历的结果恰好是一个严格递增的有序序列，这是算法面试与期末高频考点。',
    variantQuestion: {
      prompt: '【举一反三 · 变式巩固】一棵二叉树根节点为 A，左孩子为 B，右孩子为 C，则其「后序遍历（Post-order）」输出顺序是？',
      options: ['A -> B -> C', 'B -> A -> C', 'B -> C -> A', 'C -> B -> A'],
      correctIndex: 2,
      explanation: '后序遍历遵循「左子树 → 右子树 → 根节点」的顺序，因此先输出 B，再输出 C，最后输出根 A。',
    },
    resolved: false,
  },
  {
    id: 'm3',
    nodeId: 'linkedlist',
    nodeLabel: '链表操作',
    question: '反转单链表时，如何在修改 curr.next 指向前避免丢失后续节点？',
    studentCode: `while curr:
    curr.next = prev  # ❌ 直接断开指向，后续链表丢失！
    prev = curr
    curr = curr.next`,
    correctCode: `while curr:
    nxt = curr.next   # ✅ 先暂存下一个节点
    curr.next = prev
    prev = curr
    curr = nxt`,
    errorDimension: '边界条件错误',
    aiDiagnosis:
      '直接覆盖了 `curr.next`，导致原有后继链表的引用丢失，后续 `curr = curr.next` 反而跳回了 `prev`，引发死循环。',
    knowledgeSupplement:
      '链表指针修改三步法：① 存后继（`nxt = curr.next`）→ ② 改指向（`curr.next = prev`）→ ③ 齐步前移（`prev, curr = curr, nxt`）。',
    variantQuestion: {
      prompt: '【举一反三 · 变式巩固】单链表反转循环结束后，新的链表头节点由哪个指针指向？',
      options: ['curr（此时为 None）', 'prev', 'nxt', '原头节点 head'],
      correctIndex: 1,
      explanation: '当 `curr` 走到 `None` 退出循环时，`prev` 恰好停在原链表的最后一个节点，也就是反转后的新头节点。',
    },
    resolved: false,
  },
];

export const INITIAL_SUGGESTIONS: TeachingSuggestion[] = [
  {
    id: 'sug1',
    priority: 'high',
    nodeLabel: '递归与调用栈',
    errorRate: 56,
    title: '建议下节课前 10 分钟插入「3D 调用栈压栈/回溯」现场演示',
    detail:
      '全班 40 人中有 22 人（56%）在递归作业中出现「遗漏 return」或「Base Case 边界错误」。建议直接打开 EduMind 3D 虚拟实验室演示 factorial(4) 的栈帧演化，并推送分层巩固单 A/B 组。',
    actionLabel: '去 3D 实验室演示',
    status: 'pending',
  },
  {
    id: 'sug2',
    priority: 'high',
    nodeLabel: '二叉树与遍历',
    errorRate: 48,
    title: '前/中/后序遍历混淆率高，建议投屏对比匿名典型错例',
    detail:
      '19 名学生将中序与前序代码写反。建议开启「脱敏错例投屏讲评模式」，结合苏格拉底式提问让学生当堂辨析 3 行代码的位置差异。',
    actionLabel: '打开投屏讲评',
    status: 'pending',
  },
  {
    id: 'sug3',
    priority: 'medium',
    nodeLabel: '链表操作',
    errorRate: 38,
    title: '为薄弱组 11 名学生定向推送「双指针反转动画微课」',
    detail:
      '数据显示先修节点「函数与作用域」得分低于 70 的学生更容易在链表指针赋值中出错，建议先补齐对象引用概念。',
    actionLabel: '生成分层巩固单',
    status: 'pending',
  },
];

export const INITIAL_QUIZ: QuizQuestion = {
  id: 'q1',
  question: '执行递归函数 factorial(4) 时，在命中 Base Case (n == 1) 的那一瞬间，系统调用栈中同时存在几个 factorial 栈帧？',
  options: ['1 个栈帧', '3 个栈帧', '4 个栈帧', '5 个栈帧'],
  correctIndex: 2,
  explanation: '从 factorial(4) → factorial(3) → factorial(2) → factorial(1)，4 个函数均未返回，因此调用栈中同时存在 4 个栈帧，空间复杂度为 O(n)。',
  stats: [4, 7, 23, 6],
  published: true,
};

export const INITIAL_GROUP_TASKS: GroupTask[] = [
  { id: 't1', title: '梳理递归与显式栈等价转换流程图', assignee: '林致远（组长）', status: 'done', contribution: 34 },
  { id: 't2', title: '编写汉诺塔（Hanoi）可视化演示代码', assignee: '苏念安', status: 'doing', contribution: 31 },
  { id: 't3', title: '整理 3 道期末高频递归易错题对比', assignee: '陈明轩', status: 'doing', contribution: 22 },
  { id: 't4', title: '制作小组课堂 BOSS 挑战答辩总结', assignee: '周雨桐', status: 'todo', contribution: 13 },
];

export const CLASS_TREND_DATA = [
  { week: '第1周', avgScore: 76, participation: 82 },
  { week: '第2周', avgScore: 81, participation: 86 },
  { week: '第3周', avgScore: 74, participation: 88 },
  { week: '第4周', avgScore: 84, participation: 91 },
  { week: '第5周', avgScore: 87, participation: 94 },
  { week: '本周', avgScore: 89, participation: 96 },
];

export const ERROR_DIMENSION_DATA = [
  { name: '递归出口遗漏', count: 18, color: '#f43f5e' },
  { name: '栈帧理解偏差', count: 14, color: '#f59e0b' },
  { name: '概念混淆', count: 11, color: '#6366f1' },
  { name: '边界条件错误', count: 9, color: '#06b6d4' },
];

export const STUDENT_WEEKLY_TREND = [
  { day: '周一', score: 66, minutes: 35 },
  { day: '周二', score: 71, minutes: 48 },
  { day: '周三', score: 69, minutes: 30 },
  { day: '周四', score: 75, minutes: 62 },
  { day: '周五', score: 80, minutes: 74 },
  { day: '周六', score: 78, minutes: 55 },
  { day: '周日', score: 84, minutes: 68 },
];
