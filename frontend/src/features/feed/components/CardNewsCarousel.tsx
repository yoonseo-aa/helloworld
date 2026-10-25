import { useState } from 'react'

/**
 * 게시글 상세 좌측 체험 영역 — 카드뉴스 이미지 넘겨보기 (이전/다음 + 도트).
 * 이미지는 display_order 순서(image_urls 배열 순서)를 그대로 따른다.
 */
export default function CardNewsCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0)
  const hasMany = images.length > 1

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <img
        src={images[index]}
        alt={`카드 ${index + 1} / ${images.length}`}
        className="h-full w-full object-contain"
      />

      {hasMany && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            disabled={index === 0}
            aria-label="이전 카드"
            className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition-opacity hover:bg-black/60 disabled:opacity-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            disabled={index === images.length - 1}
            aria-label="다음 카드"
            className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition-opacity hover:bg-black/60 disabled:opacity-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <div className="absolute bottom-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5">
            {images.map((url, dotIndex) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(dotIndex)}
                aria-label={`${dotIndex + 1}번째 카드로 이동`}
                aria-current={dotIndex === index}
                className={[
                  'h-1.5 rounded-full transition-all',
                  dotIndex === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                ].join(' ')}
              />
            ))}
          </div>

          <span className="absolute top-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white tabular-nums">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>
  )
}
