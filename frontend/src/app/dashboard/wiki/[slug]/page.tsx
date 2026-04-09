import { WikiViewer } from "@/components/WikiViewer";
import { apiFetch } from "@/lib/api";


export default async function WikiPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  let wikiData: any = {
    title: "로딩 중...",
    tags: ["로딩"],
    content: "지식 베이스에서 문서를 불러오는 중입니다.",
    categories: [],
  };

  try {
    const res = await apiFetch(`/api/wiki/${slug}`, { cache: "no-store" });
    if (res.ok) {
      wikiData = await res.json();
    } else {
      wikiData = {
        title: "문서를 찾을 수 없음",
        tags: ["오류"],
        content: `슬러그 '${slug}'에 해당하는 위키 문서를 찾을 수 없습니다.`,
        categories: [],
      };
    }
  } catch {
    wikiData = {
      title: "백엔드 연결 실패",
      tags: ["시스템 오류"],
      content: "AutoWiki 백엔드 서버에 연결할 수 없습니다.",
      categories: [],
    };
  }

  return (
    <div className="min-h-full flex flex-col">
      <WikiViewer
        slug={slug}
        initialTitle={wikiData.title}
        initialTags={wikiData.tags}
        initialContent={(wikiData.content || "").trim()}
        categories={wikiData.categories || []}
      />
    </div>
  );
}
