import { WikiViewer } from "@/components/WikiViewer";
import { apiFetch } from "@/lib/api";


export default async function WikiPage(props: { 
  params: Promise<{ slug: string }>,
  searchParams: Promise<{ projectId?: string }>
}) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  const searchParams = await props.searchParams;
  const projectId = searchParams.projectId;

  let wikiData: any = {
    title: "로딩 중...",
    tags: ["로딩"],
    content: "지식 베이스에서 문서를 불러오는 중입니다.",
    categories: [],
  };

  try {
    const url = projectId ? `/api/wiki/${slug}?project_id=${projectId}` : `/api/wiki/${slug}`;
    const res = await apiFetch(url, { cache: "no-store" });
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
        projectId={searchParams.projectId}
        initialTitle={wikiData.title}
        initialTags={wikiData.tags}
        initialContent={(wikiData.content || "").trim()}
        categories={wikiData.categories || []}
      />
    </div>
  );
}
