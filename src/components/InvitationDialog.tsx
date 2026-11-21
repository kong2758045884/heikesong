import { useEffect, useRef, useState } from 'react';
import { Copy, QrCode, X } from 'lucide-react';
import { toDataURL } from 'qrcode';

export type Invitation = { name: string; code: string; base?: string; kind: '课程' | '课堂' };

export function InvitationDialog({ invitation, onClose }: { invitation: Invitation; onClose: () => void }) {
  const modal = useRef<HTMLDialogElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState('');
  const [status, setStatus] = useState('');
  const link = (invitation.base || window.location.origin) + '/#/join/' + invitation.code;

  useEffect(() => {
    modal.current?.showModal();
    let active = true;
    void toDataURL(link, { width: 440, margin: 3, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {
        if (active) setStatus('二维码暂时无法生成，可以使用链接或加入码。');
      });
    return () => {
      active = false;
    };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('链接已复制。');
    } catch {
      linkField.current?.select();
      setStatus('已选中链接，可手动复制。');
    }
  }

  return (
    <dialog
      ref={modal}
      onClose={onClose}
      aria-labelledby="invite-title"
      className="workspace-settings m-auto rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl backdrop:bg-slate-900/45 sm:p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="invite-title" className="flex items-center gap-2 text-lg font-bold">
            <QrCode className="size-5 text-sky-600" />
            邀请学生加入{invitation.kind}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{invitation.name}</p>
        </div>
        <button
          type="button"
          aria-label="关闭邀请"
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-sky-50"
          onClick={() => modal.current?.close()}
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="my-3 grid justify-items-center gap-2 rounded-xl bg-sky-50 p-3 text-center">
        {image && (
          <img
            src={image}
            alt={'加入' + invitation.kind + '的二维码'}
            className="aspect-square w-full max-w-48 rounded-lg bg-white"
          />
        )}
        <div>
          <p className="text-xs font-medium text-slate-600">{invitation.kind}加入码</p>
          <strong className="font-mono text-3xl tracking-[0.23em] text-sky-900">{invitation.code}</strong>
        </div>
        <p className="text-xs text-slate-600">
          {invitation.base?.startsWith('http://')
            ? '手机和这台电脑需连接同一网络。'
            : '学生扫码后使用自己的账号加入。'}
        </p>
      </div>
      <label htmlFor="invite-link" className="mb-1 block text-xs font-semibold text-slate-700">
        加入链接
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={linkField}
          id="invite-link"
          readOnly
          value={link}
          className="min-h-10 w-full min-w-0 rounded-lg border border-sky-200 bg-white px-3 text-xs text-slate-700"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white"
        >
          <Copy className="size-3.5" />
          复制
        </button>
      </div>
      {status && (
        <p className="mt-2 text-sm text-slate-600" role="status">
          {status}
        </p>
      )}
    </dialog>
  );
}
