import { discoverBlogTopics, refreshBlogPost, runDiscoveryGenerationPublishCycle, ensureBlogInfrastructure } from "./blogService";

class BlogAutomationService {
  private started = false;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private pipelineTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  async start() {
    if (this.started) return;
    this.started = true;

    await ensureBlogInfrastructure();

    const safeRun = async (label: string, task: () => Promise<void>) => {
      try {
        await task();
      } catch (error) {
        console.error(`[BLOG] ${label} falhou:`, error);
      }
    };

    void safeRun("bootstrap", async () => {
      await discoverBlogTopics(5);
      await runDiscoveryGenerationPublishCycle();
    });

    this.discoveryTimer = setInterval(() => {
      void safeRun("discovery", async () => {
        await discoverBlogTopics(5);
      });
    }, 6 * 60 * 60 * 1000);

    this.pipelineTimer = setInterval(() => {
      void safeRun("pipeline", async () => {
        await runDiscoveryGenerationPublishCycle();
      });
    }, 60 * 60 * 1000);

    this.refreshTimer = setInterval(() => {
      void safeRun("refresh", async () => {
        await refreshBlogPost();
      });
    }, 8 * 60 * 60 * 1000);
  }

  stop() {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.pipelineTimer) clearInterval(this.pipelineTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.discoveryTimer = null;
    this.pipelineTimer = null;
    this.refreshTimer = null;
    this.started = false;
  }
}

export const blogAutomationService = new BlogAutomationService();
