import { buildPublicAppUrl } from "./native-runtime";

type SeoConfig = {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath?: string;
  structuredData?: Record<string, unknown>;
};

function upsertMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }

  meta.content = content;
}

function upsertLink(rel: string, href: string) {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
}

export function applyPageSeo(config: SeoConfig) {
  document.title = config.title;
  upsertMeta("description", config.description);

  if (config.keywords) {
    upsertMeta("keywords", config.keywords);
  }

  if (config.canonicalPath) {
    upsertLink("canonical", buildPublicAppUrl(config.canonicalPath));
  }

  let script: HTMLScriptElement | null = null;
  if (config.structuredData) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(config.structuredData);
    document.head.appendChild(script);
  }

  return () => {
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
  };
}
