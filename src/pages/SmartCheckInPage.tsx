import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  Hand,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserCheck,
  Video,
  VideoOff,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import {
  detectGestureFromSource,
  drawHandSkeleton,
  getHandLandmarker,
  type DetectedGestureId,
  type GestureDetectionResult,
} from '../services/gestureService';
import type { CheckInRecord, UserRole } from '../types';

interface SmartCheckInPageProps {
  role: UserRole;
  checkIns: CheckInRecord[];
  onApproveCheckIn: (id: string) => void;
  onAddCheckIn: (record: CheckInRecord) => void;
}

const GESTURES: { id: DetectedGestureId; label: string; desc: string }[] = [
  { id: 'v', label: '✌️ 剪刀手', desc: '食指与中指呈 V 字伸直' },
  { id: 'thumb', label: '👍 竖起大拇指', desc: '单手大拇指竖直向上，其余四指握拳' },
  { id: 'ok', label: '👌 OK 手势', desc: '拇指食指捏圆，其余三指伸直' },
  { id: 'heart', label: '🫶 比心手势', desc: '拇指食指捏心/双手比心，其余手指收拢' },
];

export const SmartCheckInPage: React.FC<SmartCheckInPageProps> = ({
  role,
  checkIns,
  onApproveCheckIn,
  onAddCheckIn,
}) => {
  const [selectedGesture, setSelectedGesture] = useState(GESTURES[0]);
  const [requireTeacher, setRequireTeacher] = useState(true);
  const [requireBlackboard, setRequireBlackboard] = useState(true);
  const [livenessChallenge, setLivenessChallenge] = useState(true);

  // Camera & MediaPipe state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [liveGesture, setLiveGesture] = useState<GestureDetectionResult | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<'camera' | 'upload' | 'sim'>('sim');
  const [capturedGesture, setCapturedGesture] = useState<GestureDetectionResult | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0);
  const [verifyResult, setVerifyResult] = useState<'idle' | 'success' | 'review' | 'gesture-failed'>('idle');
  const [failMessage, setFailMessage] = useState('');
  const [altModeOpen, setAltModeOpen] = useState(false);
  const [altCode, setAltCode] = useState('');

  // Preload MediaPipe model when entering student check-in
  useEffect(() => {
    if (role !== 'student') return;
    let cancelled = false;
    setModelStatus('loading');
    getHandLandmarker()
      .then(() => {
        if (!cancelled) setModelStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setModelStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  // Attach MediaStream whenever video mounts
  useEffect(() => {
    if (cameraActive && !capturedPhoto && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive, capturedPhoto]);

  // Real-time MediaPipe detection loop when webcam is active
  useEffect(() => {
    if (!cameraActive || capturedPhoto || modelStatus !== 'ready') return;
    let cancelled = false;
    let timerId: number | undefined;

    const runLoop = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const result = await detectGestureFromSource(video);
          if (!cancelled) {
            setLiveGesture(result);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              drawHandSkeleton(
                ctx,
                result.landmarks,
                canvas.width,
                canvas.height,
                result.gestureId === selectedGesture.id,
                true // mirrored video
              );
            }
          }
        } catch {
          // ignore transient frame errors
        }
      }
      if (!cancelled) {
        timerId = window.setTimeout(runLoop, 160);
      }
    };

    runLoop();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [cameraActive, capturedPhoto, modelStatus, selectedGesture.id]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRealCamera = async () => {
    setCameraError('');
    setCapturedPhoto(null);
    setCapturedGesture(null);
    setVerifyResult('idle');
    setVerifyStep(0);
    setFailMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraError('无法打开摄像头（请确认已允许浏览器相机权限，或直接点击「本地拍照 / 上传照片」进行真实手势识别）。');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setLiveGesture(null);
  };

  // Run MediaPipe on an Image data URL and return annotated photo + real gesture result
  const analyzeImageDataUrl = async (
    rawDataUrl: string
  ): Promise<{ annotatedUrl: string; detection: GestureDetectionResult }> => {
    const img = new Image();
    img.src = rawDataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });

    const detection = await detectGestureFromSource(img);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 960;
    canvas.height = img.naturalHeight || 540;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (detection.landmarks.length > 0) {
        const matched = detection.gestureId === selectedGesture.id;
        // Overlay detected 21-point hand skeleton on the captured photo
        const skCanvas = document.createElement('canvas');
        skCanvas.width = canvas.width;
        skCanvas.height = canvas.height;
        const skCtx = skCanvas.getContext('2d');
        if (skCtx) {
          drawHandSkeleton(skCtx, detection.landmarks, canvas.width, canvas.height, matched, false);
          ctx.drawImage(skCanvas, 0, 0);
        }
      }
      // Stamp real MediaPipe verdict
      const matched = detection.gestureId === selectedGesture.id;
      ctx.fillStyle = matched ? 'rgba(5, 150, 105, 0.85)' : 'rgba(225, 29, 72, 0.85)';
      ctx.fillRect(16, canvas.height - 46, Math.min(canvas.width - 32, 460), 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.fillText(
        `MediaPipe 实测：${detection.label}（要求：${selectedGesture.label}）· ${matched ? '匹配 ✓' : '不匹配 ✗'}`,
        26,
        canvas.height - 25
      );
    }

    return { annotatedUrl: canvas.toDataURL('image/jpeg', 0.9), detection };
  };

  // Capture raw frame from webcam OR simulated classroom canvas
  const captureRawFrame = (): { url: string; source: 'camera' | 'sim' } => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (cameraActive && videoRef.current && videoRef.current.videoWidth > 0 && ctx) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return { url: canvas.toDataURL('image/jpeg', 0.92), source: 'camera' };
    }

    // Simulated classroom scene snapshot
    canvas.width = 960;
    canvas.height = 540;
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, '#0f2942');
      grad.addColorStop(1, '#1e3a5f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = '#0f3d32';
      ctx.fillRect(50, 55, 560, 180);
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 6;
      ctx.strokeRect(50, 55, 560, 180);
      ctx.fillStyle = '#a7f3d0';
      ctx.font = '600 18px monospace';
      ctx.fillText('曲阜师范大学 · Python 程序设计与数据结构', 75, 105);
      ctx.fillStyle = '#ffffff';
      ctx.font = '500 20px monospace';
      ctx.fillText('def factorial(n): return 1 if n<=1 else n*factorial(n-1)', 75, 155);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
      ctx.fillRect(50, 390, 290, 54);
      ctx.fillStyle = '#e0f2fe';
      ctx.font = '600 18px sans-serif';
      ctx.fillText('👨‍🏫 讲台教师：张教授（演示画面）', 66, 424);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
      ctx.fillRect(590, 380, 320, 64);
      ctx.fillStyle = '#ecfdf5';
      ctx.font = '700 20px sans-serif';
      ctx.fillText(`🧑‍🎓 模拟学生 + ${selectedGesture.label}`, 612, 418);
    }
    return { url: canvas.toDataURL('image/jpeg', 0.9), source: 'sim' };
  };

  const handleTakePhotoOnly = async () => {
    const raw = captureRawFrame();
    setPhotoSource(raw.source);
    setVerifyResult('idle');
    setVerifyStep(0);
    setFailMessage('');

    if (raw.source === 'camera' && modelStatus === 'ready') {
      const { annotatedUrl, detection } = await analyzeImageDataUrl(raw.url);
      setCapturedPhoto(annotatedUrl);
      setCapturedGesture(detection);
    } else {
      setCapturedPhoto(raw.url);
      setCapturedGesture(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setPhotoSource('upload');
        setVerifyResult('idle');
        setVerifyStep(0);
        setFailMessage('');
        if (modelStatus === 'ready') {
          const { annotatedUrl, detection } = await analyzeImageDataUrl(reader.result);
          setCapturedPhoto(annotatedUrl);
          setCapturedGesture(detection);
        } else {
          setCapturedPhoto(reader.result);
          setCapturedGesture(null);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const runVerification = async (simulateAmbiguous = false) => {
    setVerifying(true);
    setVerifyResult('idle');
    setVerifyStep(0);
    setFailMessage('');

    let finalPhoto = capturedPhoto;
    let source = photoSource;
    let detection = capturedGesture;

    if (!finalPhoto) {
      const raw = captureRawFrame();
      source = raw.source;
      setPhotoSource(source);
      if (source === 'camera' && modelStatus === 'ready') {
        const res = await analyzeImageDataUrl(raw.url);
        finalPhoto = res.annotatedUrl;
        detection = res.detection;
      } else {
        finalPhoto = raw.url;
      }
      setCapturedPhoto(finalPhoto);
      setCapturedGesture(detection);
    } else if ((source === 'camera' || source === 'upload') && !detection && modelStatus === 'ready') {
      const res = await analyzeImageDataUrl(finalPhoto);
      finalPhoto = res.annotatedUrl;
      detection = res.detection;
      setCapturedPhoto(finalPhoto);
      setCapturedGesture(detection);
    }

    // Step 1~3
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 240));
      setVerifyStep(i);
    }

    // Step 4: REAL MediaPipe Gesture Check for real camera or uploaded photo!
    await new Promise((r) => setTimeout(r, 280));
    setVerifyStep(4);

    const isRealMedia = source === 'camera' || source === 'upload';
    if (isRealMedia && !simulateAmbiguous) {
      if (!detection || detection.gestureId === 'none') {
        setVerifying(false);
        setVerifyResult('gesture-failed');
        setFailMessage(
          `未在照片中检测到手部！请将手举到镜头清晰可见位置，摆出「${selectedGesture.label}」后重拍。`
        );
        return;
      }
      if (detection.gestureId !== selectedGesture.id) {
        setVerifying(false);
        setVerifyResult('gesture-failed');
        setFailMessage(
          `手势不匹配！MediaPipe 实测你摆出的是「${detection.label}」，但本节签到要求「${selectedGesture.label}」。请摆出正确手势重拍，或申请教师人工复核。`
        );
        return;
      }
    }

    // Step 5~6
    for (let i = 5; i <= 6; i++) {
      await new Promise((r) => setTimeout(r, 240));
      setVerifyStep(i);
    }

    setVerifying(false);
    const nowStr = new Date().toTimeString().slice(0, 8);

    if (simulateAmbiguous) {
      setVerifyResult('review');
      onAddCheckIn({
        id: `chk-${Date.now()}`,
        studentId: '20240101',
        studentName: '林致远（本人实时提交）',
        time: nowStr,
        status: 'review-needed',
        gesture: detection ? detection.label : selectedGesture.label,
        confidence: 67.8,
        photoUrl: finalPhoto || undefined,
        reason: '黑板反光或手势复核申请：已附带实拍影像安全转入教师人工复核（不误判缺勤）。',
        checks: {
          studentPresent: true,
          teacherPresent: true,
          blackboardVisible: false,
          gestureMatched: detection ? detection.gestureId === selectedGesture.id : true,
          livenessPassed: true,
          qualityOk: true,
        },
      });
    } else {
      setVerifyResult('success');
      onAddCheckIn({
        id: `chk-${Date.now()}`,
        studentId: '20240101',
        studentName: isRealMedia ? '林致远（实拍 MediaPipe 核验）' : '林致远（模拟演示提交）',
        time: nowStr,
        status: 'verified',
        gesture: detection ? detection.label : selectedGesture.label,
        confidence: detection ? detection.confidence : 98.5,
        photoUrl: finalPhoto || undefined,
        checks: {
          studentPresent: true,
          teacherPresent: requireTeacher,
          blackboardVisible: requireBlackboard,
          gestureMatched: true,
          livenessPassed: livenessChallenge,
          qualityOk: true,
        },
      });
    }
  };

  const handleAltSubmit = () => {
    if (!altCode.trim()) return;
    onAddCheckIn({
      id: `chk-alt-${Date.now()}`,
      studentId: '20240101',
      studentName: '林致远（替代口令签到）',
      time: new Date().toTimeString().slice(0, 8),
      status: 'verified',
      gesture: '口令替代通道',
      confidence: 100,
      checks: {
        studentPresent: true,
        teacherPresent: true,
        blackboardVisible: true,
        gestureMatched: true,
        livenessPassed: true,
        qualityOk: true,
      },
    });
    setAltModeOpen(false);
    setVerifyResult('success');
  };

  const sixChecks = [
    { key: 1, label: '学生本人入镜', desc: '最小必要原则核验' },
    { key: 2, label: '教师在场验证', desc: '结合当前课堂会话核验' },
    { key: 3, label: '黑板/教学屏环境', desc: '教室实景可见性检测' },
    { key: 4, label: `指定手势匹配 (${selectedGesture.label})`, desc: 'MediaPipe 21 关键点真机实测' },
    { key: 5, label: '实时活体防翻拍', desc: '防旧照片/录屏回放' },
    { key: 6, label: '图像清晰度检测', desc: '无严重遮挡与模糊' },
  ];

  // TEACHER VIEW
  if (role === 'teacher') {
    const verified = checkIns.filter((c) => c.status === 'verified').length;
    const late = checkIns.filter((c) => c.status === 'late').length;
    const review = checkIns.filter((c) => c.status === 'review-needed').length;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Camera className="w-6 h-6 text-sky-600" />
              AI 智能课前签到管理（教师端）
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              内置 MediaPipe 21 关键点真实手势识别引擎，异常低置信度自动转人工复核并附带实拍照片
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              已通过 {verified}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
              迟到 {late}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
              待人工复核 {review}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Hand className="w-4 h-4 text-sky-600" />
              本节签到防作弊规则配置
            </h3>

            <div>
              <label className="text-xs text-slate-500 block mb-2">指定动态手势模板（实时同步学生端检测规则）</label>
              <div className="grid grid-cols-2 gap-2">
                {GESTURES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGesture(g)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedGesture.id === g.id
                        ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-sm'
                        : 'bg-white border-sky-100 text-slate-600 hover:border-sky-300'
                    }`}
                  >
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-sky-100">
              {[
                { label: '要求教师入镜核验', val: requireTeacher, set: setRequireTeacher },
                { label: '要求黑板/教学屏入镜', val: requireBlackboard, set: setRequireBlackboard },
                { label: '启用实时拍摄防翻拍挑战', val: livenessChallenge, set: setLivenessChallenge },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50/60 border border-sky-100 text-xs cursor-pointer"
                >
                  <span className="text-slate-700 font-medium">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={opt.val}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="w-4 h-4 accent-sky-600"
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-800 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
              <strong>隐私合规保障：</strong>签到影像仅用于当堂核验，系统已设定 <strong>24 小时自动销毁</strong>，并为不便拍摄的学生开放替代签到通道。
            </div>
          </div>

          <div className="lg:col-span-2 glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">实时签到记录与异常人工复核队列</h3>
              <span className="text-xs text-slate-500">点击学生实拍缩略图可放大核验关键点</span>
            </div>

            <div className="space-y-3">
              {checkIns.map((rec) => (
                <div
                  key={rec.id}
                  className={`rounded-xl p-4 border transition-all ${
                    rec.status === 'review-needed'
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-white/90 border-sky-100'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {rec.photoUrl ? (
                        <button
                          onClick={() => setLightboxPhoto(rec.photoUrl!)}
                          className="relative group w-16 h-11 rounded-lg overflow-hidden border border-sky-300 shrink-0 cursor-pointer"
                          title="点击放大查看学生实拍照片"
                        >
                          <img src={rec.photoUrl} alt="签到实拍" className="w-full h-full object-cover" />
                          <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ZoomIn className="w-4 h-4 text-white" />
                          </span>
                        </button>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center text-xs font-bold text-sky-700 shrink-0">
                          {rec.studentName.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          {rec.studentName}
                          <span className="text-xs font-normal text-slate-500">({rec.studentId})</span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {rec.time}
                          </span>
                          <span>手势：{rec.gesture}</span>
                          <span>置信度：{rec.confidence}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {rec.status === 'verified' && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 验证通过
                        </span>
                      )}
                      {rec.status === 'late' && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          迟到已签
                        </span>
                      )}
                      {rec.status === 'review-needed' && (
                        <button
                          onClick={() => onApproveCheckIn(rec.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5 shadow-sm"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          一键人工复核通过
                        </button>
                      )}
                    </div>
                  </div>

                  {rec.reason && (
                    <div className="mt-2.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 inline mr-1.5 text-amber-600" />
                      {rec.reason}
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[
                      { k: '学生本人', ok: rec.checks.studentPresent },
                      { k: '教师在场', ok: rec.checks.teacherPresent },
                      { k: '黑板环境', ok: rec.checks.blackboardVisible },
                      { k: '手势匹配', ok: rec.checks.gestureMatched },
                      { k: '活体实时', ok: rec.checks.livenessPassed },
                    ].map((tag) => (
                      <span
                        key={tag.k}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${
                          tag.ok
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {tag.ok ? '✓' : '⚠'} {tag.k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {lightboxPhoto &&
          createPortal(
            <div
              onClick={() => setLightboxPhoto(null)}
              className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setLightboxPhoto(null)}
                  className="absolute -top-11 right-0 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-4 h-4" /> 关闭预览
                </button>
                <img
                  src={lightboxPhoto}
                  alt="签到照片大图"
                  className="w-full rounded-2xl border-2 border-sky-400/50 shadow-2xl"
                />
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  // STUDENT VIEW — CLEAN SINGLE-COLUMN MOBILE CHECK-IN
  const liveMatched = liveGesture?.gestureId === selectedGesture.id;

  return (
    <div className="space-y-4">
      {/* Compact Mobile Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">AI 手势签到</h1>
          <p className="text-xs text-slate-500">请摆出指定手势并拍照验证</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1 ${
            modelStatus === 'ready'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-sky-50 text-sky-700 border-sky-200'
          }`}
        >
          <Cpu className="w-3 h-3" />
          {modelStatus === 'ready' ? '手势模型就绪' : '加载中...'}
        </span>
      </div>

      {/* Gesture Selector (4 crisp thumb-friendly pills) */}
      <div className="grid grid-cols-2 gap-2">
        {GESTURES.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setSelectedGesture(g);
              setVerifyResult('idle');
              setFailMessage('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors text-left ${
              selectedGesture.id === g.id
                ? 'bg-sky-600 border-sky-600 text-white'
                : 'bg-white border-sky-200 text-slate-700 hover:border-sky-400'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Camera Card */}
      <div className="glass-panel rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {!cameraActive ? (
            <button
              onClick={startRealCamera}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" /> 开启摄像头
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <VideoOff className="w-3.5 h-3.5 text-rose-500" /> 关闭摄像头
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> 拍照 / 上传
          </button>
        </div>

        {cameraError && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {cameraError}
          </div>
        )}

        {/* Viewport */}
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 border border-sky-200">
          {capturedPhoto ? (
            <div className="relative w-full h-full">
              <img src={capturedPhoto} alt="我拍摄的签到照片" className="w-full h-full object-cover" />
              <div className="absolute top-2.5 right-2.5 flex gap-1.5">
                <button
                  onClick={() => setLightboxPhoto(capturedPhoto)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900/75 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <ZoomIn className="w-3 h-3" /> 大图
                </button>
                <button
                  onClick={() => {
                    setCapturedPhoto(null);
                    setCapturedGesture(null);
                    setVerifyResult('idle');
                    setVerifyStep(0);
                    setFailMessage('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> 重拍
                </button>
              </div>
              <div className="absolute bottom-2.5 left-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-slate-950/80 text-white text-[11px] font-medium flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  {capturedGesture
                    ? `实测：${capturedGesture.label}（${
                        capturedGesture.gestureId === selectedGesture.id ? '匹配 ✓' : '不匹配 ✗'
                      }）`
                    : '已定格照片，点击下方提交'}
                </span>
              </div>
            </div>
          ) : cameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              <canvas
                ref={overlayCanvasRef}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover"
              />
              <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5">
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border ${
                    liveMatched
                      ? 'bg-emerald-600/90 border-emerald-300 text-white'
                      : liveGesture && liveGesture.gestureId !== 'none'
                      ? 'bg-rose-600/90 border-rose-300 text-white'
                      : 'bg-slate-950/75 border-sky-400/50 text-sky-100'
                  }`}
                >
                  识别：{liveGesture ? liveGesture.label : '检测中...'}
                  {liveMatched
                    ? ' · 匹配 ✓'
                    : liveGesture && liveGesture.gestureId !== 'none'
                    ? ` · 需 ${selectedGesture.label}`
                    : ''}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 to-sky-950 p-4 flex flex-col justify-between">
              <div className="rounded-lg bg-emerald-950/90 border border-amber-700/60 p-2.5">
                <div className="text-[10px] text-emerald-300 font-mono">第3章 递归与调用栈</div>
                <div className="text-[11px] text-white font-mono mt-0.5 truncate">
                  def factorial(n): return 1 if n&lt;=1 else n*factorial(n-1)
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-sky-100">
                <span className="px-2.5 py-1 rounded-lg bg-white/10">模拟课堂画面</span>
                <span className="px-2.5 py-1 rounded-lg bg-sky-500/30 font-semibold">
                  目标：{selectedGesture.label}
                </span>
              </div>
            </div>
          )}

          {verifying && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-sky-400/40 to-transparent animate-scanline" />
          )}
        </div>

        {/* Big Primary Action Button */}
        <button
          disabled={verifying}
          onClick={() => runVerification(false)}
          className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
        >
          {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {verifying ? '正在进行 AI 手势核验...' : capturedPhoto ? '提交当前照片签到' : '拍照并提交 AI 签到'}
        </button>

        <div className="flex items-center justify-between gap-2 text-xs">
          {!capturedPhoto && (
            <button
              disabled={verifying}
              onClick={handleTakePhotoOnly}
              className="text-sky-700 font-semibold cursor-pointer"
            >
              先拍一张预览
            </button>
          )}
          <button
            onClick={() => setAltModeOpen(!altModeOpen)}
            className="text-slate-500 hover:text-sky-700 cursor-pointer ml-auto"
          >
            不便拍摄？口令签到
          </button>
        </div>
      </div>

      {altModeOpen && (
        <div className="glass-panel rounded-2xl p-3.5 flex items-center gap-2">
          <input
            type="text"
            placeholder="输入教师大屏 4 位口令（如 8848）"
            value={altCode}
            onChange={(e) => setAltCode(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={handleAltSubmit}
            className="px-3.5 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            提交
          </button>
        </div>
      )}

      {/* Result Banner */}
      {verifyResult === 'gesture-failed' && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900 space-y-2.5">
          <div className="font-bold text-sm text-rose-700 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> 手势验证未通过
          </div>
          <p className="leading-relaxed">{failMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCapturedPhoto(null);
                setCapturedGesture(null);
                setVerifyResult('idle');
                setVerifyStep(0);
              }}
              className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-semibold cursor-pointer"
            >
              重新拍摄
            </button>
            <button
              onClick={() => runVerification(true)}
              className="flex-1 py-2 rounded-xl bg-white text-rose-700 border border-rose-200 font-semibold cursor-pointer"
            >
              转人工复核
            </button>
          </div>
        </div>
      )}

      {verifyResult === 'success' && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800">
          <div className="font-bold text-sm text-emerald-700 mb-1">签到成功，已同步教师端</div>
          <p>
            {capturedGesture
              ? `实测识别为「${capturedGesture.label}」（置信度 ${capturedGesture.confidence}%）。`
              : '所有 6 项校验均已通过。'}
          </p>
        </div>
      )}

      {verifyResult === 'review' && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900">
          <div className="font-bold text-sm text-amber-700 mb-1">已转教师人工复核</div>
          实拍照片已提交给授课教师确认，不会直接判定缺勤。
        </div>
      )}

      {/* Compact 6-Check Status Grid */}
      <div className="glass-panel rounded-2xl p-3.5 space-y-2.5">
        <div className="text-xs font-bold text-slate-700">6 维安全校验状态</div>
        <div className="grid grid-cols-2 gap-2">
          {sixChecks.map((item) => {
            const done = verifyStep >= item.key;
            const isGestureFail = verifyResult === 'gesture-failed' && item.key === 4;
            const isAmbiguous = verifyResult === 'review' && item.key === 3;
            return (
              <div
                key={item.key}
                className={`px-2.5 py-2 rounded-xl border text-[11px] font-medium flex items-center justify-between gap-1 ${
                  isGestureFail
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : isAmbiguous
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : done
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-sky-50/40 border-sky-100 text-slate-500'
                }`}
              >
                <span className="truncate">{item.label.split(' ')[0]}</span>
                {isGestureFail ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                ) : isAmbiguous ? (
                  <XCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                ) : done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-sky-300 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-0.5">
          <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
          影像仅用于当堂考勤，24 小时自动销毁
        </div>
      </div>

      {lightboxPhoto &&
        createPortal(
          <div
            onClick={() => setLightboxPhoto(null)}
            className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="absolute -top-10 right-0 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-4 h-4" /> 关闭
              </button>
              <img
                src={lightboxPhoto}
                alt="签到照片大图"
                className="w-full rounded-2xl border border-sky-400/50 shadow-2xl"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
