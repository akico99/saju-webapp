'use strict';
/* 카카오톡 채널 상담 유입 랜딩페이지(consult.html)에서 들어오는 리드 —
   PG 결제 심사 전, 수동 상담·계좌이체로 진행하는 주문의 사전 접수 기록.
   카카오톡 채팅으로 들어온 사람이 누구인지 관리자가 대조할 수 있도록 남겨둔다. */
const db = require('./index');

const stmts = {
  insert: db.prepare(`
    INSERT INTO leads (name, gender, birth_year, birth_month, birth_day, birth_hour, birth_minute,
      hour_unknown, is_lunar, concern, contact)
    VALUES (@name, @gender, @birthYear, @birthMonth, @birthDay, @birthHour, @birthMinute,
      @hourUnknown, @isLunar, @concern, @contact)
  `),
  listRecent: db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT ? OFFSET ?'),
  setStatus: db.prepare("UPDATE leads SET status = @status WHERE id = @id")
};

function createLead({ name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, hourUnknown, isLunar, concern, contact }) {
  const info = stmts.insert.run({
    name: name || null, gender: gender || null,
    birthYear: birthYear || null, birthMonth: birthMonth || null, birthDay: birthDay || null,
    birthHour: hourUnknown ? null : (birthHour ?? null), birthMinute: hourUnknown ? null : (birthMinute ?? null),
    hourUnknown: hourUnknown ? 1 : 0, isLunar: isLunar ? 1 : 0,
    concern: concern || null, contact: contact || null
  });
  return info.lastInsertRowid;
}

function listRecent({ limit = 100, offset = 0 } = {}) {
  return stmts.listRecent.all(limit, offset);
}

function setStatus(id, status) {
  stmts.setStatus.run({ id, status });
}

module.exports = { createLead, listRecent, setStatus };
