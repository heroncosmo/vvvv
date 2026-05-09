import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, PlayCircle, Search, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CourseModuleList, CourseVideoPanel } from "@/components/course-video-panel";
import {
  AGENTEZAP_COURSE_CHANNEL,
  getOrderedCourseVideos,
  getPrimaryCourseVideos,
  getPromotionalCourseVideos,
} from "@/lib/youtube-course";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function TrainingCoursePage() {
  const [query, setQuery] = useState("");
  const primaryVideos = useMemo(() => getOrderedCourseVideos(getPrimaryCourseVideos()), []);
  const promotionalVideos = useMemo(() => getPromotionalCourseVideos(), []);
  const allVideos = useMemo(
    () => getOrderedCourseVideos([...primaryVideos, ...promotionalVideos]),
    [primaryVideos, promotionalVideos],
  );

  const filteredVideos = useMemo(() => {
    const search = normalizeSearch(query);
    if (!search) return allVideos;

    return allVideos.filter((video) => {
      const haystack = normalizeSearch(`${video.title} ${video.description} ${video.module}`);
      return haystack.includes(search);
    });
  }, [allVideos, query]);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Youtube className="h-3.5 w-3.5 text-red-600" />
              {AGENTEZAP_COURSE_CHANNEL.title}
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Curso AgenteZap
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Trilha pratica para configurar, operar e crescer sem abrir o YouTube. Os videos de propaganda ficam como extras no fim.
                </p>
              </div>
            </div>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar aula..."
              className="h-10 pl-9"
            />
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-background p-2 text-primary shadow-sm">
                <PlayCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Comece pela aula pratica 1</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Criacao do agente de IA. Essa substitui a ordem antiga em que as duas primeiras aulas eram apenas apresentacao.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-2xl font-semibold text-foreground">{primaryVideos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">aulas praticas</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-2xl font-semibold text-foreground">{promotionalVideos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">extras no final</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-2xl font-semibold text-foreground">100%</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">dentro do painel</p>
          </div>
        </section>

        {query && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {filteredVideos.length} aula{filteredVideos.length === 1 ? "" : "s"} encontrada{filteredVideos.length === 1 ? "" : "s"} para "{query}"
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-medium text-primary hover:underline"
            >
              Limpar busca
            </button>
          </div>
        )}

        {filteredVideos.length > 0 ? (
          <>
            <CourseVideoPanel
              videos={filteredVideos}
              title={query ? "Resultado das aulas" : "Curso completo"}
              description="A ordem principal comeca na configuracao real do agente. As aulas promocionais aparecem como extras no final."
            />
            {!query && <CourseModuleList videos={allVideos} />}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
            <Badge variant="secondary" className="rounded-full">Sem resultado</Badge>
            <p className="mt-3 text-sm text-muted-foreground">
              Tente buscar por agente, follow-up, Kanban, envio em massa, midia ou formulario.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          Este curso usa os videos publicos do canal {AGENTEZAP_COURSE_CHANNEL.handle}, mas a experiencia principal fica no AgenteZap. Quando uma pagina tem aula correspondente, a entrada aparece na navegacao e abre a Central de Ajuda com a aula certa.
        </div>
      </div>
    </div>
  );
}
