// 하루 마무리에서 쓰던 회고 답을 잠깐 보관한다. 앱이 닫혀도 같은 날 다시 열면 이어 쓴다.
export type DraftStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type Answers = Record<string, string>;
export type Draft = { template: string | null; answers: Record<string, Answers> }; // 템플릿 id → 질문 key → 답

export const draftKey = (date: string) => `nanal.draft.${date}`;

export const hasAnswer = (answers: Answers | undefined) => Object.values(answers ?? {}).some((v) => v.trim() !== '');

export function withoutTemplate(draft: Draft, templateId: string): Draft {
  const { [templateId]: _, ...rest } = draft.answers;
  return { template: draft.template === templateId ? null : draft.template, answers: rest };
}

function parse(text: string): Draft | null {
  try {
    const v = JSON.parse(text) as { template?: unknown; answers?: unknown };
    if (!v || typeof v !== 'object' || !v.answers || typeof v.answers !== 'object') return null;
    const answers: Record<string, Answers> = {};
    for (const [id, a] of Object.entries(v.answers as Record<string, unknown>)) {
      if (!a || typeof a !== 'object') continue;
      answers[id] = {};
      for (const [k, s] of Object.entries(a as Record<string, unknown>)) if (typeof s === 'string') answers[id][k] = s;
    }
    return { template: typeof v.template === 'string' ? v.template : null, answers };
  } catch {
    return null;
  }
}

// 못 읽으면 빈 칸으로 시작한다.
export async function readDraft(store: DraftStore, date: string): Promise<Draft | null> {
  try {
    const text = await store.getItem(draftKey(date));
    return text ? parse(text) : null;
  } catch {
    return null;
  }
}

// 적은 글이 하나도 없으면 지운다. 못 저장해도 쓰는 데는 지장이 없다.
export async function writeDraft(store: DraftStore, date: string, draft: Draft): Promise<void> {
  try {
    if (Object.values(draft.answers).some(hasAnswer)) await store.setItem(draftKey(date), JSON.stringify(draft));
    else await store.removeItem(draftKey(date));
  } catch {
    // 다음 글자를 칠 때 다시 시도한다.
  }
}
