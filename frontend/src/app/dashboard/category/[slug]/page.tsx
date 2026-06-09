import CategoryPageClient from "./CategoryPageClient";
import { apiFetch } from "@/lib/api";


export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  let categoryData: any = null;

  try {
    const res = await apiFetch(`/api/categories/${slug}`, { cache: "no-store" });
    if (res.ok) {
      categoryData = await res.json();
    }
  } catch {}

  if (!categoryData) {
    return (
      <div className="p-6 max-w-5xl bg-white dark:bg-[#121212] min-h-full text-[#202122] dark:text-[#eaecf0] font-sans transition-colors duration-200">
        <h1 className="text-2xl font-serif border-b border-[#a2a9b1] dark:border-zinc-800 pb-2 mb-4 text-black dark:text-white">분류를 찾을 수 없습니다</h1>
        <p className="text-[14px]">요청하신 분류 페이지가 존재하지 않습니다.</p>
      </div>
    );
  }

  return <CategoryPageClient category={categoryData} />;
}
