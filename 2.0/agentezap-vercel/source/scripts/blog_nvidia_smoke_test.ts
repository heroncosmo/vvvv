import { eq, desc } from "drizzle-orm";
import { closeDbPool, db } from "../server/db";
import { blogPosts } from "../shared/schema";
import { generateBlogImagePreviewAsset } from "../server/blogService";

async function main() {
  const slug = process.argv[2]?.trim();

  const post = slug
    ? await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1).then((rows) => rows[0] || null)
    : await db.select().from(blogPosts).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.updatedAt)).limit(1).then((rows) => rows[0] || null);

  if (!post) {
    throw new Error("Nenhum post encontrado para smoke test");
  }

  const asset = await generateBlogImagePreviewAsset(post.id);
  console.log(JSON.stringify({
    postId: post.id,
    slug: post.slug,
    provider: asset.provider,
    model: asset.model,
    publicUrl: asset.publicUrl,
    mimeType: asset.mimeType,
  }));

  await closeDbPool();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  closeDbPool().catch(() => undefined).finally(() => process.exit(1));
});
