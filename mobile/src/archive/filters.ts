export type ReflectionFilter = { id: string; name: string; count: number };

// 회고 모아보기의 템플릿 필터. 지운 템플릿도 회고가 남아 있으면 보인다.
export function reflectionFilters(entries: { template: string; templateName: string }[]): ReflectionFilter[] {
  const byId = new Map<string, ReflectionFilter>();
  for (const e of entries) {
    const f = byId.get(e.template);
    if (f) f.count += 1;
    else byId.set(e.template, { id: e.template, name: e.templateName, count: 1 });
  }
  return [...byId.values()];
}
