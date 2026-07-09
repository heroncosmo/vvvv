import { useMemo, useRef, useState } from "react";
import { PlayCircle, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  COURSE_MODULES,
  type CourseVideo,
  getCourseEmbedUrl,
  getCourseModule,
  getOrderedCourseVideos,
  getCourseThumbnailUrl,
} from "@/lib/youtube-course";

type CourseVideoPanelProps = {
  videos: CourseVideo[];
  title?: string;
  description?: string;
  compact?: boolean;
  mobileStickyOffset?: string;
  prioritizeVideoOnMobile?: boolean;
};

export function CourseVideoPanel({
  videos,
  title = "Aulas em video",
  description = "Assista dentro da plataforma, sem precisar sair para o YouTube.",
  compact = false,
  mobileStickyOffset = "3.5rem",
  prioritizeVideoOnMobile = false,
}: CourseVideoPanelProps) {
  const orderedVideos = useMemo(() => getOrderedCourseVideos(videos), [videos]);
  const [selectedVideoId, setSelectedVideoId] = useState(orderedVideos[0]?.id || "");
  const playerRef = useRef<HTMLDivElement | null>(null);
  const selectedVideo = orderedVideos.find((video) => video.id === selectedVideoId) || orderedVideos[0];
  const selectedIndex = selectedVideo
    ? Math.max(0, orderedVideos.findIndex((video) => video.id === selectedVideo.id))
    : 0;
  const lessonCount = orderedVideos.filter((video) => !video.isPromotional).length;
  const extraCount = orderedVideos.length - lessonCount;
  const countLabel =
    lessonCount === 0
      ? `${extraCount} extra${extraCount === 1 ? "" : "s"}`
      : extraCount > 0
        ? `${lessonCount} aulas + ${extraCount} extras`
        : `${lessonCount} aula${lessonCount === 1 ? "" : "s"}`;

  if (!selectedVideo) return null;

  const getScrollParent = (element: HTMLElement) => {
    let parent = element.parentElement;

    while (parent) {
      const style = window.getComputedStyle(parent);
      const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";

      if (canScroll && parent.scrollHeight > parent.clientHeight + 1) {
        return parent;
      }

      parent = parent.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  };

  const scrollPlayerIntoView = () => {
    const player = playerRef.current;
    if (!player) return;

    const scrollParent = getScrollParent(player);
    const playerRect = player.getBoundingClientRect();
    const parentRect =
      scrollParent === document.documentElement || scrollParent === document.body
        ? { top: 0 }
        : scrollParent.getBoundingClientRect();
    const stickyOffset = Number.parseFloat(window.getComputedStyle(player).top) || 0;
    const nextTop =
      scrollParent.scrollTop + playerRect.top - parentRect.top - stickyOffset - 8;

    scrollParent.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "smooth",
    });
  };

  const selectVideo = (videoId: string) => {
    const changed = videoId !== selectedVideo.id;
    const playerRect = playerRef.current?.getBoundingClientRect();
    const playerVisible =
      !!playerRect &&
      playerRect.top >= 0 &&
      playerRect.bottom <= window.innerHeight;

    setSelectedVideoId(videoId);

    if (
      changed &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches &&
      !playerVisible
    ) {
      window.requestAnimationFrame(() => {
        scrollPlayerIntoView();
      });
    }
  };

  return (
    <section className="rounded-lg border border-border bg-background">
      <div
        className={`border-b border-border px-3 py-2 sm:px-4 sm:py-3 ${
          prioritizeVideoOnMobile ? "hidden sm:block" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            </div>
            <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">{description}</p>
          </div>
          <Badge variant="outline" className="shrink-0 rounded-full">
            {countLabel}
          </Badge>
        </div>
      </div>

      <div
        className={
          compact
            ? "flex flex-col gap-3 p-3"
            : "flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]"
        }
      >
        <div
          ref={playerRef}
          className="sticky z-20 -mx-2 min-w-0 self-start scroll-mt-3 rounded-lg bg-background px-2 pb-3 pt-2 shadow-sm ring-1 ring-border/70 lg:static lg:z-auto lg:mx-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0"
          style={{ top: mobileStickyOffset }}
        >
          <div className="aspect-video overflow-hidden rounded-md border border-border bg-black">
            <iframe
              key={selectedVideo.id}
              src={getCourseEmbedUrl(selectedVideo.id)}
              title={selectedVideo.title}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="mt-2 lg:mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {getCourseModule(selectedVideo).title}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                {selectedIndex + 1} de {orderedVideos.length}
              </span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-foreground lg:text-base">
              {selectedVideo.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground lg:text-sm">
              {selectedVideo.description}
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-2 pt-1 lg:pt-0">
          {orderedVideos.map((video, index) => {
            const active = video.id === selectedVideo.id;
            const module = getCourseModule(video);

            return (
              <button
                key={video.id}
                type="button"
                onClick={() => selectVideo(video.id)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-[72px] w-full touch-manipulation items-start gap-3 rounded-md border p-2 text-left transition ${
                  active
                    ? "border-primary/50 bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/20 hover:bg-accent"
                }`}
              >
                <div className="relative mt-0.5 h-14 w-20 shrink-0 overflow-hidden rounded bg-muted">
                  <img
                    src={getCourseThumbnailUrl(video.id)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <PlayCircle className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {video.isPromotional ? "Extra" : `Aula ${index + 1}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">•</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {module.title}
                    </span>
                    {active && (
                      <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Assistindo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">
                    {video.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CourseModuleList({ videos }: { videos: CourseVideo[] }) {
  const orderedVideos = useMemo(() => getOrderedCourseVideos(videos), [videos]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {COURSE_MODULES.map((module) => {
        const moduleVideos = orderedVideos.filter((video) => video.module === module.id);
        if (moduleVideos.length === 0) return null;

        return (
          <div key={module.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{module.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {module.description}
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {moduleVideos.length}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {moduleVideos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-start gap-2 rounded-md px-0 py-1.5 text-xs text-muted-foreground"
                >
                  <PlayCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">{video.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
