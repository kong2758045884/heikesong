import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Plus, Settings2, X } from 'lucide-react';
import { apiRequest, errorText, type ModelSettings } from '../services/teachingService';

const actionStyle =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50';
const inputStyle =
  'min-h-10 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-sky-200';

export function ModelManager({ onClose }: { onClose: () => void }) {
  const modal = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<ModelSettings>();
  const [adding, setAdding] = useState(false);
  const [reuseId, setReuseId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(signal?: AbortSignal) {
    const result = await apiRequest<ModelSettings>('models', { signal });
    if (!signal?.aborted) setSettings(result);
  }

  useEffect(() => {
    const dialog = modal.current;
    dialog?.showModal();
    const abort = new AbortController();
    void load(abort.signal).catch((failure) => {
      if (!abort.signal.aborted) setError(errorText(failure));
    });
    return () => abort.abort();
  }, []);

  async function apply(action: string, id: string, success: string) {
    setBusy(action + ':' + id);
    setError('');
    setMessage('');
    try {
      if (action === 'test') {
        await apiRequest('models/test', { method: 'POST', body: { id } });
      } else {
        setSettings(await apiRequest<ModelSettings>('models/' + action, { method: 'POST', body: { id } }));
      }
      if (action !== 'test') window.dispatchEvent(new Event('edumind-model-change'));
      setMessage(success);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('add');
    setError('');
    setMessage('');
    try {
      const input = Object.fromEntries(new FormData(event.currentTarget));
      setSettings(await apiRequest<ModelSettings>('models', { method: 'POST', body: input }));
      setAdding(false);
      setReuseId('');
      window.dispatchEvent(new Event('edumind-model-change'));
      setMessage('已添加并切换模型。');
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  }

  return (
    <dialog
      ref={modal}
      onClose={onClose}
      aria-labelledby="model-manager-title"
      className="workspace-settings m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-sky-600" />
          <h2 id="model-manager-title" className="text-lg font-bold">
            AI 模型管理
          </h2>
        </div>
        <button
          type="button"
          aria-label="关闭模型管理"
          className="grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-sky-50"
          onClick={() => modal.current?.close()}
        >
          <X className="size-5" />
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">课件 AI 识别使用当前模型。密钥由后端保存和调用。</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      {settings ? (
        <div className="mt-4 grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/55 p-3">
            <div>
              <h3 className="text-sm font-semibold">本地课件提取</h3>
              <p className="text-xs text-slate-600">按页整理正文和标题</p>
            </div>
            {settings.active ? (
              <button
                type="button"
                className={actionStyle}
                disabled={!!busy}
                onClick={() => void apply('activate', '', '已切换至本地提取。')}
              >
                切换
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800">
                <Check className="size-3" />
                使用中
              </span>
            )}
          </div>
          {settings.profiles.map((profile) => (
            <div
              key={profile.id}
              className={
                'min-w-0 rounded-xl border p-3 ' +
                (settings.active === profile.id ? 'border-sky-300 bg-sky-50' : 'border-sky-100')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">{profile.name}</h3>
                  <p className="break-all text-xs leading-5 text-slate-600">
                    {profile.model} · {profile.hasKey ? '密钥已设置' : '待设置密钥'}
                  </p>
                  <p className="break-all text-[11px] text-slate-500">{profile.baseUrl}</p>
                </div>
                {settings.active === profile.id && (
                  <span className="shrink-0 text-xs font-semibold text-sky-800">使用中</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {settings.active !== profile.id && (
                  <button
                    type="button"
                    className={actionStyle}
                    disabled={!!busy}
                    onClick={() => void apply('activate', profile.id, '已切换模型。')}
                  >
                    切换
                  </button>
                )}
                <button
                  type="button"
                  className={actionStyle}
                  disabled={!!busy}
                  onClick={() => void apply('test', profile.id, '模型连接成功。')}
                >
                  {busy === 'test:' + profile.id ? '正在测试…' : '测试连接'}
                </button>
                {profile.id !== 'local-bailian' && (
                  <button
                    type="button"
                    className="px-2 text-xs text-rose-700"
                    disabled={!!busy}
                    onClick={() =>
                      window.confirm('删除此模型配置？') && void apply('remove', profile.id, '已删除模型。')
                    }
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
          {!adding && (
            <button
              type="button"
              className={actionStyle + ' justify-self-start'}
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              新增模型
            </button>
          )}
        </div>
      ) : error ? (
        <button
          type="button"
          className={actionStyle + ' mt-3'}
          onClick={() => {
            setError('');
            void load().catch((failure) => setError(errorText(failure)));
          }}
        >
          重新加载
        </button>
      ) : (
        <p role="status" className="mt-4 text-sm text-slate-600">
          正在加载模型…
        </p>
      )}

      {adding && (
        <form onSubmit={(event) => void add(event)} className="mt-4 grid gap-3 border-t border-sky-100 pt-4">
          <label className="grid gap-1 text-xs font-semibold">
            显示名称
            <input name="name" className={inputStyle} required maxLength={60} placeholder="例如 教研组模型" />
          </label>
          {!!settings?.profiles.length && (
            <label className="grid gap-1 text-xs font-semibold">
              密钥来源
              <select
                name="credentialId"
                className={inputStyle}
                value={reuseId}
                onChange={(event) => setReuseId(event.target.value)}
              >
                <option value="">输入新的密钥</option>
                {settings.profiles
                  .filter((profile) => profile.hasKey)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      复用 {profile.name} 的密钥
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-semibold">
            Base URL
            <input
              key={reuseId}
              name="baseUrl"
              className={inputStyle}
              required
              maxLength={260}
              placeholder="https://服务域名/compatible-mode/v1"
              defaultValue={settings?.profiles.find((profile) => profile.id === reuseId)?.baseUrl}
              readOnly={!!reuseId}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            模型 ID
            <input name="model" className={inputStyle} required maxLength={160} placeholder="例如 qwen-plus" />
          </label>
          {!reuseId && (
            <label className="grid gap-1 text-xs font-semibold">
              API Key
              <input
                type="password"
                name="apiKey"
                className={inputStyle}
                required
                maxLength={512}
                autoComplete="new-password"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!!busy}
              className="min-h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {busy === 'add' ? '保存中…' : '保存并切换'}
            </button>
            <button
              type="button"
              className={actionStyle}
              disabled={!!busy}
              onClick={() => {
                setAdding(false);
                setReuseId('');
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
