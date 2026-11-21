import { FileText } from 'lucide-react';
import { deckAsset, type TeachingSlide } from '../services/teachingService';

export function SlideContent({ deckId, slide }: { deckId: string; slide: TeachingSlide }) {
  return (
    <article className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-sky-700">
        <FileText className="size-3.5 shrink-0" /> {slide.source}
      </p>
      <h2 className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{slide.title}</h2>
      <div className="mt-5 grid min-w-0 gap-4 text-sm leading-7 text-slate-700">
        {slide.elements.length === 0 && <p>此页没有可读取的正文，可以打开原课件查看。</p>}
        {slide.elements.map((element) => {
          if (element.kind === 'image') {
            return (
              <figure key={element.id} className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                {element.image && (
                  <img
                    className="mx-auto max-h-[420px] max-w-full object-contain"
                    src={deckAsset(deckId, 'images/' + element.image)}
                    alt={element.text}
                  />
                )}
                <figcaption className="mt-1 text-xs">{element.text}</figcaption>
              </figure>
            );
          }
          if (element.kind === 'code' || element.kind === 'formula') {
            return (
              <pre
                key={element.id}
                className="whitespace-pre-wrap break-words rounded-xl bg-slate-900 px-4 py-3 text-xs leading-6 text-sky-100"
              >
                {element.text}
              </pre>
            );
          }
          return (
            <p key={element.id} className="whitespace-pre-wrap">
              {element.text}
            </p>
          );
        })}
      </div>
    </article>
  );
}
