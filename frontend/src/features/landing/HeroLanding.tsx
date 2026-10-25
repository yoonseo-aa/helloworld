import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

// 이 컴포넌트가 lazy 경계 뒤에 있으므로, CSS도 여기서 import해야 같은 청크로 따라온다.
import './hero-landing.css'

const WHEEL_ACTIVATION_PIXELS = 8
const WHEEL_RANGE_FRAMES = 10
const WHEEL_GESTURE_IDLE_MS = 180
const SECTION_AUTO_COMPLETE_PROGRESS = 0.8
const SCRUB_FRAMES_PER_SECOND = 24
const FINAL_LOGO_LEAD_FRAMES = 5
const FINAL_LOOP_FRAME_COUNT = 48
const FINAL_LOOP_FRAMES_PER_SECOND = 24
const FINAL_LOOP_EXIT_FADE_MS = 260
const MAX_FRAME_TIME_SECONDS = 0.05

interface SequenceDefinition {
  frameCount: number
}

interface StorySectionDefinition {
  eyebrow: string
  title: [string, string]
}

interface FramePosition {
  frameIndex: number
  sceneIndex: number
}

const SEQUENCES: SequenceDefinition[] = [
  { frameCount: 24 },
  { frameCount: 31 },
  { frameCount: 51 },
  { frameCount: 29 },
  { frameCount: 13 },
]

const STORY_SECTIONS: StorySectionDefinition[] = [
  {
    eyebrow: 'FORGOTTEN PROJECT',
    title: ['완성했지만,', '아무도 보지 못한 프로젝트'],
  },
  {
    eyebrow: 'MAKE IT VISIBLE',
    title: ['우리의', '프로젝트를 보이게'],
  },
  {
    eyebrow: 'FIND INSPIRATION',
    title: ['그 수많은', '프로젝트에서 영감을 얻는'],
  },
  {
    eyebrow: 'HELLO, AGAIN',
    title: ['세상에 비추는', '우리의 프로젝트'],
  },
]

/** 기존 이미지 시퀀스 3·4를 하나의 스토리 섹션 3으로 묶는다. */
const SEQUENCE_TO_SECTION_INDEX = [0, 1, 2, 2, 3]

const SEQUENCE_TIMELINE_FRAME_COUNTS = SEQUENCES.map(
  (scene, sceneIndex) => scene.frameCount - (sceneIndex === 0 ? 0 : 1),
)

/** 이전 씬 마지막 이미지와 완전히 같은 다음 씬 첫 이미지는 한 번만 재생한다. */
const FRAME_TIMELINE: FramePosition[] = SEQUENCES.flatMap((_, sceneIndex) =>
  Array.from(
    { length: SEQUENCE_TIMELINE_FRAME_COUNTS[sceneIndex] },
    (_, timelineFrameIndex) => ({
      frameIndex: timelineFrameIndex + (sceneIndex === 0 ? 0 : 1),
      sceneIndex,
    }),
  ),
)

const SECTION_START_INDICES = STORY_SECTIONS.map((_, targetSectionIndex) =>
  FRAME_TIMELINE.findIndex(
    (position) =>
      SEQUENCE_TO_SECTION_INDEX[position.sceneIndex] === targetSectionIndex,
  ),
)

const SECTION_END_INDICES = STORY_SECTIONS.map((_, targetSectionIndex) =>
  FRAME_TIMELINE.reduce(
    (lastIndex, position, timelineFrameIndex) =>
      SEQUENCE_TO_SECTION_INDEX[position.sceneIndex] === targetSectionIndex
        ? timelineFrameIndex
        : lastIndex,
    -1,
  ),
)

/**
 * 버튼·클릭 이동이 멈추는 자리. 시작점과 각 섹션의 끝이다.
 *
 * **앞뒤가 같은 목록을 써야 한다.** 예전에는 앞으로 갈 때 섹션의 끝(…131, 143)에 멈추고
 * 뒤로 갈 때 섹션의 시작(132, 54…)으로 갔는데, 그러면 → 로 131에 와서 ← 를 눌렀을 때
 * 131이 아니라 132로 가서 한 칸 어긋났다. 왔던 자리로 못 돌아오는 셈이다.
 *
 * 실제 값: [0, 23, 53, 131, 143] — 씬 프레임 수(24/31/51/29/13)에서 경계 중복을 뺀 결과다.
 */
const STORY_STOPS: readonly number[] = [0, ...SECTION_END_INDICES]

function framePath(sceneIndex: number, frameIndex: number) {
  const scene = sceneIndex + 1
  const frame = String(frameIndex + 1).padStart(4, '0')
  return `/hero-sequence/scene${scene}/frame_${frame}.webp`
}

function finalLoopFramePath(frameIndex: number) {
  const frame = String(frameIndex + 1).padStart(4, '0')
  return `/hero-sequence/final-loop/frame_${frame}.webp`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

interface HeroLandingProps {
  onComplete: () => void
}

export default function HeroLanding({ onComplete }: HeroLandingProps) {
  const [timelineIndex, setTimelineIndex] = useState(0)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [hasFinalMaskCompleted, setHasFinalMaskCompleted] = useState(false)
  const [finalLoopFrameIndex, setFinalLoopFrameIndex] = useState(0)
  const [isFinalLoopActive, setIsFinalLoopActive] = useState(false)
  const [isFinalLoopExiting, setIsFinalLoopExiting] = useState(false)
  const [paintedSectionIndex, setPaintedSectionIndex] = useState(0)

  const timelineIndexRef = useRef(0)
  const playheadRef = useRef(0)
  const targetTimelineIndexRef = useRef(0)
  const wheelAccumulatorRef = useRef(0)
  const wheelGestureSectionRef = useRef<number | null>(null)
  const wheelGestureDirectionRef = useRef<1 | -1 | null>(null)
  const wheelGestureResetTimerRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastAnimationTimeRef = useRef<number | null>(null)
  const finalLoopFrameIndexRef = useRef(0)
  const finalLoopAnimationFrameRef = useRef<number | null>(null)
  const finalLoopLastTimeRef = useRef<number | null>(null)
  const finalLoopElapsedRef = useRef(0)
  const finalLoopActiveRef = useRef(false)
  const finalLoopExitingRef = useRef(false)
  const finalLoopExitTimerRef = useRef<number | null>(null)
  const pendingFinalLoopExitTargetRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const preloadCacheRef = useRef(new Map<number, Promise<void>>())
  const preloadedScenesRef = useRef(new Set<number>())
  const finalLoopPreloadRef = useRef<Promise<void> | null>(null)
  const pendingImagesRef = useRef(new Set<HTMLImageElement>())
  const effectRunRef = useRef(0)
  const timelineTargetRequestRef = useRef(0)

  const stopPreloading = useCallback(() => {
    pendingImagesRef.current.forEach((image) => {
      if (!image.complete) image.src = ''
    })
    pendingImagesRef.current.clear()
  }, [])

  const stopFinalLoop = useCallback(() => {
    finalLoopActiveRef.current = false
    finalLoopExitingRef.current = false
    finalLoopFrameIndexRef.current = 0
    pendingFinalLoopExitTargetRef.current = null
    finalLoopLastTimeRef.current = null
    finalLoopElapsedRef.current = 0

    if (finalLoopAnimationFrameRef.current !== null) {
      cancelAnimationFrame(finalLoopAnimationFrameRef.current)
      finalLoopAnimationFrameRef.current = null
    }
    if (finalLoopExitTimerRef.current !== null) {
      window.clearTimeout(finalLoopExitTimerRef.current)
      finalLoopExitTimerRef.current = null
    }

    setIsFinalLoopActive(false)
    setIsFinalLoopExiting(false)
    setFinalLoopFrameIndex(0)
  }, [])

  const finishLanding = useCallback(() => {
    timelineTargetRequestRef.current += 1
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (wheelGestureResetTimerRef.current !== null) {
      window.clearTimeout(wheelGestureResetTimerRef.current)
      wheelGestureResetTimerRef.current = null
    }
    stopFinalLoop()
    stopPreloading()
    onComplete()
  }, [onComplete, stopFinalLoop, stopPreloading])

  const preloadScene = useCallback((targetSceneIndex: number) => {
    if (targetSceneIndex < 0 || targetSceneIndex >= SEQUENCES.length) {
      return Promise.resolve()
    }

    const cached = preloadCacheRef.current.get(targetSceneIndex)
    if (cached) return cached

    const frameCount = SEQUENCES[targetSceneIndex].frameCount
    const request = Promise.all(
      Array.from({ length: frameCount }, (_, targetFrameIndex) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image()
          pendingImagesRef.current.add(image)
          image.decoding = 'async'
          image.onload = () => {
            pendingImagesRef.current.delete(image)
            resolve()
          }
          image.onerror = () => {
            pendingImagesRef.current.delete(image)
            reject(new Error(`scene ${targetSceneIndex + 1} preload failed`))
          }
          image.src = framePath(targetSceneIndex, targetFrameIndex)
        }),
      ),
    ).then(() => {
      preloadedScenesRef.current.add(targetSceneIndex)
    })

    preloadCacheRef.current.set(targetSceneIndex, request)
    return request
  }, [])

  const preloadFinalLoop = useCallback(() => {
    if (finalLoopPreloadRef.current) return finalLoopPreloadRef.current

    const request = Promise.all(
      Array.from(
        { length: FINAL_LOOP_FRAME_COUNT },
        (_, targetFrameIndex) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image()
            pendingImagesRef.current.add(image)
            image.decoding = 'async'
            image.onload = () => {
              pendingImagesRef.current.delete(image)
              resolve()
            }
            image.onerror = () => {
              pendingImagesRef.current.delete(image)
              reject(new Error('final loop preload failed'))
            }
            image.src = finalLoopFramePath(targetFrameIndex)
          }),
      ),
    ).then(() => undefined)

    finalLoopPreloadRef.current = request
    return request
  }, [])

  const renderTimelinePosition = useCallback((nextTimelineIndex: number) => {
    if (nextTimelineIndex === timelineIndexRef.current) return

    const nextPosition = FRAME_TIMELINE[nextTimelineIndex]
    timelineIndexRef.current = nextTimelineIndex
    setTimelineIndex(nextTimelineIndex)
    setSceneIndex(nextPosition.sceneIndex)
    setFrameIndex(nextPosition.frameIndex)
    if (nextTimelineIndex === 0) setHasStarted(false)
  }, [])

  const runInertialScrub = useCallback(
    (timestamp: number) => {
      const previousTime = lastAnimationTimeRef.current
      const deltaTime =
        previousTime === null
          ? 1 / 60
          : Math.min((timestamp - previousTime) / 1000, MAX_FRAME_TIME_SECONDS)
      lastAnimationTimeRef.current = timestamp

      const target = targetTimelineIndexRef.current
      const distance = target - playheadRef.current

      const travelDistance = SCRUB_FRAMES_PER_SECOND * deltaTime

      if (Math.abs(distance) <= travelDistance) {
        playheadRef.current = target
        renderTimelinePosition(Math.round(target))
        if (target === 0) setHasStarted(false)
        animationFrameRef.current = null
        lastAnimationTimeRef.current = null
        return
      }

      // 휠 입력량은 재생 범위만 바꾸고, 플레이헤드는 언제나 같은 속도로 이동한다.
      playheadRef.current += Math.sign(distance) * travelDistance
      renderTimelinePosition(Math.round(playheadRef.current))
      animationFrameRef.current = requestAnimationFrame(runInertialScrub)
    },
    [renderTimelinePosition],
  )

  const commitTimelineTarget = useCallback(
    (timelineTarget: number) => {
      if (!isReady) return
      const targetRequestId = ++timelineTargetRequestRef.current

      let nextTargetIndex = clamp(
        Math.round(timelineTarget),
        0,
        FRAME_TIMELINE.length - 1,
      )

      const currentTargetSection =
        SEQUENCE_TO_SECTION_INDEX[
          FRAME_TIMELINE[targetTimelineIndexRef.current].sceneIndex
        ]
      const requestedTargetSection =
        SEQUENCE_TO_SECTION_INDEX[FRAME_TIMELINE[nextTargetIndex].sceneIndex]
      const isEnteringFinalSectionFromPrevious =
        nextTargetIndex > targetTimelineIndexRef.current &&
        currentTargetSection === STORY_SECTIONS.length - 2 &&
        requestedTargetSection === STORY_SECTIONS.length - 1

      if (isEnteringFinalSectionFromPrevious) {
        nextTargetIndex = FRAME_TIMELINE.length - 1
      }

      if (nextTargetIndex === targetTimelineIndexRef.current) return

      const targetPosition = FRAME_TIMELINE[nextTargetIndex]
      const startMovement = () => {
        if (targetRequestId !== timelineTargetRequestRef.current) return
        if (nextTargetIndex === targetTimelineIndexRef.current) return

        targetTimelineIndexRef.current = nextTargetIndex
        if (nextTargetIndex > 0) setHasStarted(true)

        void preloadScene(targetPosition.sceneIndex + 1).catch(() => {
          // 다음 씬 선행 로드에 실패해도 현재 이동은 그대로 유지한다.
        })
        if (
          SEQUENCE_TO_SECTION_INDEX[targetPosition.sceneIndex] >=
          STORY_SECTIONS.length - 2
        ) {
          void preloadFinalLoop().catch(() => {
            // 루프 로드 실패 시 마지막 정지 프레임을 그대로 유지한다.
          })
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          playheadRef.current = nextTargetIndex
          renderTimelinePosition(nextTargetIndex)
          setHasStarted(nextTargetIndex > 0)
          return
        }

        if (animationFrameRef.current === null) {
          lastAnimationTimeRef.current = null
          animationFrameRef.current = requestAnimationFrame(runInertialScrub)
        }
      }

      if (preloadedScenesRef.current.has(targetPosition.sceneIndex)) {
        startMovement()
        return
      }

      void preloadScene(targetPosition.sceneIndex)
        .then(startMovement)
        .catch(() => {
          // 대상 씬이 준비되지 않으면 이전 프레임과 문구를 유지해 어긋남을 막는다.
        })
    },
    [
      isReady,
      preloadFinalLoop,
      preloadScene,
      renderTimelinePosition,
      runInertialScrub,
    ],
  )

  const runFinalLoop = useCallback(
    (timestamp: number) => {
      if (!finalLoopActiveRef.current || finalLoopExitingRef.current) return

      const previousTime = finalLoopLastTimeRef.current
      const deltaTime =
        previousTime === null
          ? 1 / 60
          : Math.min((timestamp - previousTime) / 1000, MAX_FRAME_TIME_SECONDS)
      finalLoopLastTimeRef.current = timestamp
      finalLoopElapsedRef.current += deltaTime

      const frameDuration = 1 / FINAL_LOOP_FRAMES_PER_SECOND
      const frameSteps = Math.floor(finalLoopElapsedRef.current / frameDuration)

      if (frameSteps > 0) {
        finalLoopElapsedRef.current -= frameSteps * frameDuration
        const unwrappedFrameIndex = finalLoopFrameIndexRef.current + frameSteps
        const crossedLoopBoundary = unwrappedFrameIndex >= FINAL_LOOP_FRAME_COUNT
        const nextFrameIndex = unwrappedFrameIndex % FINAL_LOOP_FRAME_COUNT
        finalLoopFrameIndexRef.current = nextFrameIndex
        setFinalLoopFrameIndex(nextFrameIndex)

        if (
          crossedLoopBoundary &&
          pendingFinalLoopExitTargetRef.current !== null
        ) {
          finalLoopExitingRef.current = true
          setIsFinalLoopExiting(true)
          finalLoopAnimationFrameRef.current = null
          finalLoopLastTimeRef.current = null

          finalLoopExitTimerRef.current = window.setTimeout(() => {
            const exitTarget = pendingFinalLoopExitTargetRef.current
            finalLoopActiveRef.current = false
            finalLoopExitingRef.current = false
            pendingFinalLoopExitTargetRef.current = null
            finalLoopExitTimerRef.current = null
            setIsFinalLoopActive(false)
            setIsFinalLoopExiting(false)

            if (exitTarget !== null) commitTimelineTarget(exitTarget)
          }, FINAL_LOOP_EXIT_FADE_MS)
          return
        }
      }

      finalLoopAnimationFrameRef.current = requestAnimationFrame(runFinalLoop)
    },
    [commitTimelineTarget],
  )

  const moveToTimelineIndex = useCallback(
    (timelineTarget: number) => {
      const nextTargetIndex = clamp(
        Math.round(timelineTarget),
        0,
        FRAME_TIMELINE.length - 1,
      )

      if (finalLoopExitingRef.current) {
        if (nextTargetIndex < FRAME_TIMELINE.length - 1) {
          pendingFinalLoopExitTargetRef.current = nextTargetIndex
        }
        return
      }

      if (finalLoopActiveRef.current) {
        pendingFinalLoopExitTargetRef.current =
          nextTargetIndex < FRAME_TIMELINE.length - 1
            ? nextTargetIndex
            : null
        return
      }

      commitTimelineTarget(nextTargetIndex)
    },
    [commitTimelineTarget],
  )

  const moveFrames = useCallback(
    (frameDelta: number) => {
      if (frameDelta === 0) return
      const movementBase =
        pendingFinalLoopExitTargetRef.current ?? targetTimelineIndexRef.current
      moveToTimelineIndex(movementBase + frameDelta)
    },
    [moveToTimelineIndex],
  )

  const moveWheelRange = useCallback(
    (direction: 1 | -1) => {
      const displayedTimelineIndex = timelineIndexRef.current
      const displayedSection =
        SEQUENCE_TO_SECTION_INDEX[
          FRAME_TIMELINE[timelineIndexRef.current].sceneIndex
        ]
      let gestureSection = wheelGestureSectionRef.current

      if (gestureSection === null) {
        gestureSection = displayedSection

        if (
          direction > 0 &&
          displayedTimelineIndex >= SECTION_END_INDICES[displayedSection] &&
          displayedSection < STORY_SECTIONS.length - 1
        ) {
          gestureSection += 1
        } else if (
          direction < 0 &&
          displayedTimelineIndex <= SECTION_START_INDICES[displayedSection] &&
          displayedSection > 0
        ) {
          gestureSection -= 1
        }

        wheelGestureSectionRef.current = gestureSection
      }
      wheelGestureDirectionRef.current = direction

      const movementBase =
        pendingFinalLoopExitTargetRef.current ?? targetTimelineIndexRef.current
      const requestedTarget = movementBase + direction * WHEEL_RANGE_FRAMES
      const gestureBoundary =
        direction > 0
          ? SECTION_END_INDICES[gestureSection]
          : SECTION_START_INDICES[gestureSection]

      moveToTimelineIndex(
        direction > 0
          ? Math.min(requestedTarget, gestureBoundary)
          : Math.max(requestedTarget, gestureBoundary),
      )
    },
    [moveToTimelineIndex],
  )

  const settleWheelGesture = useCallback(() => {
    const gestureSection = wheelGestureSectionRef.current
    const gestureDirection = wheelGestureDirectionRef.current

    if (gestureSection !== null && gestureDirection === 1) {
      const sectionStart = SECTION_START_INDICES[gestureSection]
      const sectionEnd = SECTION_END_INDICES[gestureSection]
      const sectionLength = sectionEnd - sectionStart
      const sectionProgress =
        sectionLength === 0
          ? 1
          : (targetTimelineIndexRef.current - sectionStart) / sectionLength

      if (sectionProgress >= SECTION_AUTO_COMPLETE_PROGRESS) {
        moveToTimelineIndex(sectionEnd)
      }
    }

    wheelGestureSectionRef.current = null
    wheelGestureDirectionRef.current = null
    wheelAccumulatorRef.current = 0
    wheelGestureResetTimerRef.current = null
  }, [moveToTimelineIndex])

  /**
   * 버튼과 화면 클릭이 쓰는 이동. 규칙을 휠 제스처(moveWheelRange)와 맞춘다 —
   * **현재 섹션을 아직 다 안 봤으면 그 끝까지 재생하고 멈추고**, 이미 끝에 와 있을 때만
   * 다음 섹션 끝까지 간다.
   *
   * 예전에는 곧장 `SECTION_START_INDICES[sectionIndex + 1]`로 보냈다. 그러면 시작 화면에서
   * → 를 처음 눌렀을 때 1번 섹션("완성했지만, 아무도 보지 못한 프로젝트")을 지나쳐 2번에서
   * 멈춰서, 버튼으로만 보는 사용자는 첫 장을 영영 못 읽었다. 휠로 보면 멀쩡했으므로 입력
   * 수단에 따라 이야기가 달라지는 상태였다.
   *
   * 기준점이 표시 중인 프레임이 아니라 **목표 프레임**인 이유는, 재생이 도는 중에 한 번 더
   * 누르면 다음 섹션으로 넘어가야 하기 때문이다. 표시 프레임은 목표보다 뒤처져 있어서
   * 그걸 기준으로 삼으면 같은 자리를 다시 겨냥해 아무 일도 안 일어난다.
   */
  const storyBaseIndex = useCallback(
    () => pendingFinalLoopExitTargetRef.current ?? targetTimelineIndexRef.current,
    [],
  )

  const advanceStory = useCallback(() => {
    const baseIndex = storyBaseIndex()
    const nextStop = STORY_STOPS.find((stop) => stop > baseIndex)
    moveToTimelineIndex(nextStop ?? FRAME_TIMELINE.length - 1)
  }, [moveToTimelineIndex, storyBaseIndex])

  const rewindStory = useCallback(() => {
    const baseIndex = storyBaseIndex()
    let previousStop = 0
    for (const stop of STORY_STOPS) {
      if (stop >= baseIndex) break
      previousStop = stop
    }
    moveToTimelineIndex(previousStop)
  }, [moveToTimelineIndex, storyBaseIndex])

  useEffect(() => {
    const runId = ++effectRunRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    void preloadScene(0)
      .then(() => {
        if (runId !== effectRunRef.current) return
        setIsReady(true)
        void preloadScene(1)
      })
      .catch(() => {
        if (runId === effectRunRef.current) setLoadError(true)
      })

    return () => {
      effectRunRef.current += 1
      timelineTargetRequestRef.current += 1
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      finalLoopActiveRef.current = false
      finalLoopExitingRef.current = false
      if (finalLoopAnimationFrameRef.current !== null) {
        cancelAnimationFrame(finalLoopAnimationFrameRef.current)
        finalLoopAnimationFrameRef.current = null
      }
      if (finalLoopExitTimerRef.current !== null) {
        window.clearTimeout(finalLoopExitTimerRef.current)
        finalLoopExitTimerRef.current = null
      }
      document.body.style.overflow = previousOverflow
    }
  }, [preloadScene])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!isReady || event.deltaY === 0) return

      if (wheelGestureResetTimerRef.current !== null) {
        window.clearTimeout(wheelGestureResetTimerRef.current)
      }
      wheelGestureResetTimerRef.current = window.setTimeout(() => {
        settleWheelGesture()
      }, WHEEL_GESTURE_IDLE_MS)

      wheelAccumulatorRef.current += event.deltaY
      const rawSteps = Math.trunc(
        wheelAccumulatorRef.current / WHEEL_ACTIVATION_PIXELS,
      )
      if (rawSteps === 0) return

      // 작은 입력에도 넉넉한 재생 범위를 예약한다. 입력이 커져도 플레이헤드의
      // 초당 프레임 수는 변하지 않으므로 영상 속도는 항상 일정하다.
      const direction = rawSteps > 0 ? 1 : -1
      wheelAccumulatorRef.current = 0
      moveWheelRange(direction)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * 스페이스는 포커스된 버튼의 것이다.
       *
       * 이 핸들러는 window에 걸려 있어서 버튼에 포커스가 있어도 먼저 돈다. 여기서
       * preventDefault()를 해 버리면 "스페이스로 버튼 누르기"라는 기본 동작이 취소되어,
       * 키보드로 '전체 스킵'까지 온 사용자가 정작 그 버튼을 못 누른다. Enter는 여기서
       * 가로채지 않으므로 원래부터 멀쩡했고, 그래서 증상이 스페이스에서만 났다.
       *
       * 화살표·PageUp/Down은 버튼에 기본 동작이 없어서 포커스가 어디 있든 그대로 둔다.
       */
      const isOnControl = Boolean(
        (event.target as HTMLElement | null)?.closest(
          'button, a, input, textarea, select, [contenteditable="true"]',
        ),
      )

      if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        moveFrames(1)
      } else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault()
        moveFrames(-1)
      } else if (
        event.key === 'PageDown' ||
        (event.key === ' ' && !isOnControl)
      ) {
        event.preventDefault()
        moveFrames(6)
      } else if (event.key === 'PageUp') {
        event.preventDefault()
        moveFrames(-6)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      if (wheelGestureResetTimerRef.current !== null) {
        window.clearTimeout(wheelGestureResetTimerRef.current)
        wheelGestureResetTimerRef.current = null
      }
    }
  }, [isReady, moveFrames, moveWheelRange, settleWheelGesture])

  const sectionIndex = SEQUENCE_TO_SECTION_INDEX[sceneIndex]

  function handleStagePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return
    const target = event.target as HTMLElement
    if (target.closest('button, a')) return

    if (event.clientX < window.innerWidth / 2) {
      rewindStory()
      return
    }

    advanceStory()
  }

  const activeSection = STORY_SECTIONS[sectionIndex]
  const isFinalSection = sectionIndex === STORY_SECTIONS.length - 1
  const isFinalLogoVisible =
    timelineIndex >= FRAME_TIMELINE.length - FINAL_LOGO_LEAD_FRAMES
  const isAtFirstSection = sectionIndex === 0
  const isAtLastSection = sectionIndex === STORY_SECTIONS.length - 1
  const isAtTimelineEnd = timelineIndex === FRAME_TIMELINE.length - 1
  const mainFrameSource = framePath(sceneIndex, frameIndex)
  const loopFrameSource = finalLoopFramePath(finalLoopFrameIndex)
  const foregroundFrameSource = isFinalLoopActive
    ? loopFrameSource
    : mainFrameSource

  useEffect(() => {
    if (
      !isReady ||
      !isAtTimelineEnd ||
      finalLoopActiveRef.current ||
      finalLoopExitingRef.current ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    let isCancelled = false

    void preloadFinalLoop()
      .then(() => {
        if (
          isCancelled ||
          timelineIndexRef.current !== FRAME_TIMELINE.length - 1 ||
          targetTimelineIndexRef.current !== FRAME_TIMELINE.length - 1
        ) {
          return
        }

        finalLoopFrameIndexRef.current = 0
        finalLoopLastTimeRef.current = null
        finalLoopElapsedRef.current = 0
        finalLoopActiveRef.current = true
        finalLoopExitingRef.current = false
        pendingFinalLoopExitTargetRef.current = null
        setFinalLoopFrameIndex(0)
        setIsFinalLoopExiting(false)
        setIsFinalLoopActive(true)
        finalLoopAnimationFrameRef.current = requestAnimationFrame(runFinalLoop)
      })
      .catch(() => {
        // 루프 로드 실패 시 마지막 정지 프레임을 그대로 유지한다.
      })

    return () => {
      isCancelled = true
    }
  }, [isAtTimelineEnd, isReady, preloadFinalLoop, runFinalLoop])

  useEffect(() => {
    if (!isFinalLogoVisible) setHasFinalMaskCompleted(false)
  }, [isFinalLogoVisible])

  return (
    <main
      className="hero-landing"
      aria-label="hello, world 서비스 소개"
      onPointerUp={handleStagePointerUp}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? null
      }}
      onTouchEnd={(event) => {
        const startY = touchStartYRef.current
        touchStartYRef.current = null
        if (startY === null) return

        const endY = event.changedTouches[0]?.clientY ?? startY
        const distance = startY - endY
        if (Math.abs(distance) < 24) return
        const steps = clamp(Math.round(Math.abs(distance) / 18), 1, 8)
        moveFrames(distance > 0 ? steps : -steps)
      }}
    >
      <img
        className="hero-landing__backdrop"
        src={mainFrameSource}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {isFinalLoopActive && (
        <img
          className={`hero-landing__loop-backdrop${isFinalLoopExiting ? ' is-exiting' : ''}`}
          src={loopFrameSource}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      <img
        className="hero-landing__frame"
        src={mainFrameSource}
        alt=""
        aria-hidden="true"
        draggable={false}
        onLoad={(event) => {
          const loadedPath = new URL(event.currentTarget.currentSrc).pathname
          if (loadedPath === mainFrameSource) {
            setPaintedSectionIndex(sectionIndex)
          }
        }}
      />
      {isFinalLoopActive && (
        <img
          className={`hero-landing__loop-frame${isFinalLoopExiting ? ' is-exiting' : ''}`}
          src={loopFrameSource}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      <div className="hero-landing__shade" aria-hidden="true" />

      {isFinalLogoVisible && !hasFinalMaskCompleted && (
        <div
          className="hero-landing__foreground-mask"
          aria-hidden="true"
          onAnimationEnd={() => setHasFinalMaskCompleted(true)}
        >
          <img src={foregroundFrameSource} alt="" draggable={false} />
          <div className="hero-landing__foreground-shade" />
        </div>
      )}

      <header className="hero-landing__header">
        <div className="hero-landing__mini-logo" aria-label="hello, world">
          hello<span>,</span> world
        </div>
        <button className="hero-landing__skip" type="button" onClick={finishLanding}>
          전체 스킵
          <span aria-hidden="true">↗</span>
        </button>
      </header>

      {isFinalLogoVisible ? (
        <section
          className="hero-landing__final is-visible"
          key="story-final"
          aria-live="polite"
        >
          <p>{activeSection.eyebrow}</p>
          <h1>
            hello<span>,</span> world
          </h1>
          <h2>
            <span>{activeSection.title[0]}</span>
            <span>{activeSection.title[1]}</span>
          </h2>
          <button type="button" onClick={finishLanding}>
            장롱 속 프로젝트 꺼내기
            <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : (
        hasStarted &&
        !isFinalSection &&
        paintedSectionIndex === sectionIndex && (
          <section
            className="hero-landing__story is-visible"
            key={`story-${sectionIndex}`}
            aria-live="polite"
          >
            <p className="hero-landing__eyebrow">
              <span>{String(sectionIndex + 1).padStart(2, '0')}</span>
              {activeSection.eyebrow}
            </p>
            <h1>
              <span>{activeSection.title[0]}</span>
              <strong>{activeSection.title[1]}</strong>
            </h1>
          </section>
        )
      )}

      <div className="hero-landing__footer">
        {/*
          시작 화면에서는 00이다. 첫 프레임은 기술적으로 1번 장면의 footage 안이지만,
          화면은 아직 "시작 전"으로 말하고 있다 — 문구가 숨겨져 있고 "휠을 내려 이야기를
          시작하세요"가 떠 있다. 여기서 01을 띄우면 아직 읽지도 않은 장을 읽은 것처럼 센다.

          → 를 한 번 누르면 1번 장면 **끝까지** 재생하고 멈추므로(advanceStory), 시작을
          01로 두면 첫 클릭에 카운터가 안 움직여서 버튼이 먹은 것처럼 보인다. 00에서
          출발해야 첫 클릭이 00 → 01로 읽힌다.
        */}
        <div
          className="hero-landing__progress"
          aria-label={
            hasStarted
              ? `전체 4개 중 ${sectionIndex + 1}번째 장면`
              : '아직 시작하지 않음, 전체 4개 장면'
          }
        >
          {STORY_SECTIONS.map((section, index) => (
            <span
              className={hasStarted && index <= sectionIndex ? 'is-active' : ''}
              key={section.eyebrow}
              aria-hidden="true"
            />
          ))}
          <b>
            {String(hasStarted ? sectionIndex + 1 : 0).padStart(2, '0')} / 04
          </b>
        </div>

        <div className="hero-landing__navigation">
          <button
            type="button"
            onClick={rewindStory}
            disabled={!isReady || !hasStarted}
            aria-label={
              isAtFirstSection ? '첫 화면으로 돌아가기' : '이전 장면으로 재생'
            }
          >
            ←
          </button>
          <span>
            {isReady
              ? `WHEEL TO SCRUB · ${String(timelineIndex + 1).padStart(3, '0')} / ${FRAME_TIMELINE.length}`
              : '첫 장면 준비 중'}
          </span>
          <button
            type="button"
            onClick={advanceStory}
            disabled={!isReady || isAtTimelineEnd}
            aria-label={
              isAtLastSection ? '마지막 프레임까지 재생' : '다음 장면으로 재생'
            }
          >
            →
          </button>
        </div>
      </div>

      {!isReady && !loadError && (
        <div className="hero-landing__loading" role="status">
          <span />
          첫 장면을 준비하고 있습니다
        </div>
      )}

      {isReady && !hasStarted && (
        <div className="hero-landing__start-hint" aria-hidden="true">
          <span>SCROLL</span>
          휠을 내려 이야기를 시작하세요
        </div>
      )}

      {loadError && (
        <div className="hero-landing__error" role="alert">
          <p>이미지 시퀀스를 불러오지 못했습니다.</p>
          <button type="button" onClick={finishLanding}>
            로그인으로 이동
          </button>
        </div>
      )}
    </main>
  )
}
