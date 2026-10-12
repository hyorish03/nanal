export type TemplateQuestion = { key: string; text: string };
export type TemplateDef = { id: string; name: string; builtin: boolean; questions: TemplateQuestion[] };

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'lethargy', name: '무기력했던 날', builtin: true,
    questions: [
      { key: 'cause', text: '무기력의 원인으로 짐작되는 것은?' },
      { key: 'recovery', text: '오늘을 회복의 시간으로 본다면 무엇을 채웠나요?' },
    ],
  },
  { id: 'gratitude', name: '감사한 날', builtin: true, questions: [{ key: 'good', text: '오늘 좋았던 일 3가지와 그 이유' }] },
  { id: 'free', name: '자유 일지', builtin: true, questions: [{ key: 'body', text: '자유롭게 쓰기' }] },
];

// 더 이상 고를 수 없지만 지난 회고를 읽을 때 쓰는 템플릿
export const LEGACY_TEMPLATES: TemplateDef[] = [
  {
    id: 'perfectionism', name: '완벽주의가 올라온 날', builtin: true,
    questions: [
      { key: 'want', text: '무엇을 완벽하게 하고 싶었나요?' },
      { key: 'reframe', text: '"지금 완벽주의 반응이 올라온 것뿐"이라고 보면 무엇이 달라지나요?' },
    ],
  },
];

export const MAX_TEMPLATE_QUESTIONS = 3;
