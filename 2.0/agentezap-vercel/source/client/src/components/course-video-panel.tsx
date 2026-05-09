import { useMemo, useState } from "react";
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
};

export function CourseVideoPanel({
  videos,
  title = "Aulas em video",
  description = "Assista dentro da plataforma, sem precisar sair para o YouTube.",
  compact = false,
}: CourseVideoPanelProps) {
  const orderedVideos = useMemo(() => getOrderedCourseVideos(videos), [videos]);
  const [selectedVideoId, setSelectedVideoId] = useState(orderedVideos[0]?.id || "");
  const selectedVideo = orderedVideos.find((video) => video.id === selectedVideoId) || orderedVideos[0];
  const lessonCount = orderedVideos.filter((video) => !video.isPromotional).length;
  const extraCount = orderedVideos.length - lessonCount;
  const countLabel =
    lessonCount === 0
      ? `${extraCount} extra${extraCount === 1 ? "" : "s"}`
      : extraCount > 0
        ? `${lessonCount} aulas + ${extraCount} extras`
        : `${lessonCount} aula${lessonCount === 1 ? "" : "s"}`;

  if (!selectedVideo) return null;

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline" className="shrink-0 rounded-full">
            {countLabel}
          </Badge>
        </div>
      </div>

      <div className={compact ? "grid gap-3 p-3" : "grid gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]"}>
        <div className="min-w-0">
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
          <div className="mt-3">
            <Badge variant="secondary" className="rounded-full">
              {getCourseModule(selectedVideo).title}
            </Badge>
            <h3 className="mt-2 text-base font-semibold leading-snug text-foreground">
              {selectedVideo.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {selectedVideo.description}
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {orderedVideos.map((video, index) => {
            const active = video.id === selectedVideo.id;
            const module = getCourseModule(video);

            return (
              <button
                key={video.id}
                type="button"
                onClick={() => setSelectedVideoId(video.id)}
                className={`flex w-full items-start gap-3 rounded-md border p-2 text-left transition ${
                  active
                    ? "border-primary/40 bg-primary/5"
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
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {video.isPromotional ? "Extra" : `Aula ${index + 1}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">•</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {module.title}
                    </span>
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
