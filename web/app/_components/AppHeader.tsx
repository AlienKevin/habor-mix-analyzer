"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname() ?? "";
  // The tb3 corpus is independent of the harbor-index annotation pipeline,
  // so hide the "Annotate trials" + Docent links there.
  const isTb3 = pathname === "/tb3" || pathname.startsWith("/tb3/");
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-slate-900 no-underline">
          AFT audit viewer
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!isTb3 && (
            <>
              <Link
                href="/annotate/"
                className="text-indigo-700 font-medium no-underline hover:underline"
              >
                Annotate trials
              </Link>
              <Link
                href="/audit/"
                className="text-indigo-700 font-medium no-underline hover:underline"
              >
                Audits
              </Link>
              <Link
                href="/insightfulness/"
                className="text-indigo-700 font-medium no-underline hover:underline"
              >
                Insights
              </Link>
              <a
                href="https://docent.transluce.org/dashboard/fe6c312a-8470-4744-9162-742e36cda60e"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 font-medium no-underline hover:underline"
              >
                All trials on Docent →
              </a>
            </>
          )}
          <a
            href="https://github.com/AlienKevin/harbor-index-analyzer"
            className="text-slate-600 no-underline hover:underline"
          >
            github
          </a>
        </div>
      </div>
    </header>
  );
}
