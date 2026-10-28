'use strict';
/* 유료 풀이 검토 연결부 — 네 상품 생성기(love·newYear·reunion·couple)가 같은 방식으로 쓴다.
   1) 프롬프트에 EVIDENCE_RULE을 붙여 장마다 끝에 숨김 줄 <!-- 근거: ... -->를 받는다.
   2) 파싱 전에 splitEvidence로 그 줄을 본문에서 떼어 낸다. 화면·PDF·toPlainText에는 본문만 간다.
   3) 묶음을 받아들이기 직전 review.check로 factCheck를 돌린다. 틀린 진술이 있고 재시도가 남았으면 던져서
      생성기의 기존 재시도로 넘기고(재시도 횟수는 늘리지 않는다), 마지막 시도면 경고로 남긴다.
   근거 줄이 없는 응답(예전 프롬프트·모델이 빠뜨린 경우)도 그대로 동작한다 — evidence가 비어 있을 뿐이다. */
const { buildFacts, factCheck, correctionMessage } = require('./factCheck');

const EVIDENCE_RULE = '검토용 근거 줄: 각 장(### 소제목)의 본문이 끝나면 그 장 맨 끝에 한 줄로 \x60<!-- 근거: ... -->\x60를 쓰세요. ' +
  '그 장의 해석에 실제로 쓴 위 자료의 사실을 위 자료에 적힌 표현 그대로 쉼표로 짧게 나열합니다(예: \x60<!-- 근거: 배우자 자리에 든 기운, 2026년 11월에 들어오는 두 기운, 불(火) 3개 -->\x60). ' +
  '위 자료에 없는 사실이나 용어를 새로 만들지 마세요. 월별 상세 흐름은 12줄 목록이 끝난 뒤 한 줄로 씁니다. ' +
  '이 줄은 독자에게 보이지 않는 검토 기록이므로 본문 문장 안에는 넣지 마세요.';

const COMMENT_RE = /<!--([\s\S]*?)-->/g;
const HEADING_LINE = /^[ \t]*#{1,6}[ \t]*(.+?)[ \t]*#*[ \t]*$/gm;

/** 응답에서 숨김 줄을 떼어 낸다. @returns {{ text: string, notes: { heading: string|null, evidence: string }[] }} */
function splitEvidence(raw) {
  const s = String(raw || '');
  const headings = [...s.matchAll(HEADING_LINE)].map((m) => ({ at: m.index, title: m[1] }));
  const notes = [];
  for (const m of s.matchAll(COMMENT_RE)) {
    const body = m[1].trim();
    const label = /^근거\s*[:：]\s*/.exec(body);
    if (!label) continue;
    const evidence = body.slice(label[0].length).replace(/\s+/g, ' ').trim();
    if (!evidence) continue;
    const before = headings.filter((h) => h.at < m.index).pop();
    notes.push({ heading: before ? before.title : null, evidence });
  }
  const text = s.replace(COMMENT_RE, '')
    .replace(/^[ \t]*<!--.*$/gm, '') // 길이 제한으로 닫히지 않은 숨김 줄
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, notes };
}

const norm = (s) => String(s || '').replace(/\*\*/g, '').replace(/\(.*?\)|（.*?）/g, ' ').replace(/[^\p{L}\p{N}]/gu, '').replace(/^\d+/, '');
const MONTH_TITLES = ['월별상세흐름', '월별한줄', '앞으로12개월'];

/** 제목으로 장 key를 찾는다. 월별 흐름은 'months'. */
function evidenceByKey(notes, defs) {
  const out = {};
  for (const n of notes) {
    const h = norm(n.heading);
    let key = null;
    if (MONTH_TITLES.some((t) => h.startsWith(t))) key = 'months';
    else {
      const def = defs.find((d) => [d.title, ...(d.aliases || [])].some((t) => norm(t) && h.startsWith(norm(t))));
      if (def) key = def.key;
    }
    if (!key) continue;
    out[key] = out[key] ? out[key] + ' / ' + n.evidence : n.evidence;
  }
  return out;
}

/** 생성 한 건의 검토 기록을 모은다. */
function startReview(factSource, defs) {
  const facts = buildFacts(factSource);
  const evidence = {};
  const checks = [];
  return {
    facts,
    /** 묶음을 받아들이기 직전에 부른다. canRetry면 틀린 진술이 있을 때 던진다(생성기의 기존 catch가 재시도로 잇는다). */
    check(selected, notes, canRetry) {
      const result = factCheck(selected, facts);
      if (result.errors.length && canRetry) throw new Error(correctionMessage(result.errors));
      const keys = new Set([...selected.sections.map((s) => s.key), ...(selected.monthNotes && selected.monthNotes.length ? ['months'] : [])]);
      for (const [k, v] of Object.entries(evidenceByKey(notes || [], defs))) if (keys.has(k)) evidence[k] = v;
      for (const e of result.errors) checks.push({ level: 'error', ...e });
      for (const w of result.warnings) checks.push({ level: 'warning', ...w });
    },
    result() { return { evidence: { ...evidence }, checks: checks.slice() }; }
  };
}

module.exports = { EVIDENCE_RULE, splitEvidence, evidenceByKey, startReview };

