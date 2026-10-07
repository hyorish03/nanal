export const TEMPLATES = {
  perfectionism: {
    label: '완벽주의가 올라온 날',
    questions: [
      { key: 'want', text: '무엇을 완벽하게 하고 싶었나요?' },
      { key: 'reframe', text: '"지금 완벽주의 반응이 올라온 것뿐"이라고 보면 무엇이 달라지나요?' },
    ],
  },
  lethargy: {
    label: '무기력했던 날',
    questions: [
      { key: 'cause', text: '무기력의 원인으로 짐작되는 것은?' },
      { key: 'recovery', text: '오늘을 회복의 시간으로 본다면 무엇을 채웠나요?' },
    ],
  },
  gratitude: {
    label: '감사한 날',
    questions: [{ key: 'good', text: '오늘 좋았던 일 3가지와 그 이유' }],
  },
  free: {
    label: '자유 일지',
    questions: [{ key: 'body', text: '자유롭게 쓰기' }],
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
