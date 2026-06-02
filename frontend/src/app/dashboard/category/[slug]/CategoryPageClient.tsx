"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

interface CategoryPageClientProps {
  category: {
    name: string;
    slug: string;
    description: string;
    entities: { slug: string; name: string; type: string }[];
  };
}

export default function CategoryPageClient({ category }: CategoryPageClientProps) {
  const router = useRouter();

  return (
    <div className="p-6 max-w-5xl bg-white dark:bg-[#121212] min-h-screen text-[#202122] dark:text-[#eaecf0] font-sans transition-colors duration-200">
      <button onClick={() => router.back()} className="text-[#0645ad] dark:text-blue-400 hover:underline text-[13px] flex items-center mb-2">
        <ArrowLeft size={14} className="mr-1" /> 뒤로 가기
      </button>

      <div className="border-b border-[#a2a9b1] dark:border-zinc-800 mb-5 pb-2">
        <h1 className="text-3xl font-serif text-[#000000] dark:text-white mb-1">분류: {category.name}</h1>
      </div>

      {/* Classic Namuwiki category description notice */}
      <div className="bg-[#f8f9fa] dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 p-4 mb-6 text-[14px]">
        이 분류에 대한 설명은 <a className="text-[#0645ad] dark:text-blue-400 hover:underline font-bold cursor-pointer">{category.name}</a> 문서를 참고하십시오.
      </div>

      {/* Member entities */}
      <div className="border border-[#a2a9b1] dark:border-zinc-800 rounded-sm">
        <h3 className="bg-[#eaecf0] dark:bg-zinc-800 border-b border-[#a2a9b1] dark:border-zinc-700 p-2.5 font-bold text-sm text-black dark:text-white">
          「{category.name}」 분류에 속하는 문서 ({category.entities.length}건)
        </h3>
        <div className="divide-y divide-[#eaecf0] dark:divide-zinc-800">
          {category.entities.map((e) => (
            <div
              key={e.slug}
              className="p-3 hover:bg-[#f8f9fa] dark:hover:bg-zinc-800 cursor-pointer transition-colors flex items-center"
              onClick={() => router.push(`/dashboard/wiki/${e.slug}`)}
            >
              <FileText size={15} className="text-[#54595d] dark:text-gray-450 mr-2.5 shrink-0" />
              <div>
                <span className="text-[#0645ad] dark:text-blue-400 hover:underline font-medium text-[14px]">{e.name}</span>
                <span className="ml-2 text-[11px] bg-[#f8f9fa] dark:bg-zinc-800 border border-[#eaecf0] dark:border-zinc-700 px-1.5 text-[#54595d] dark:text-gray-300">{e.type}</span>
              </div>
            </div>
          ))}
          {category.entities.length === 0 && (
            <div className="p-6 text-center text-[#54595d] dark:text-gray-400 italic text-sm">
              이 분류에 속하는 문서가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
