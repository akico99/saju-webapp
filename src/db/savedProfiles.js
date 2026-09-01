'use strict';
/* 로그인 계정에 여러 명(나, 배우자, 자녀 등)의 생년월일시를 저장해두고, 궁합·인생그래프
   같은 각 서비스에서 매번 다시 입력하지 않고 "불러오기"로 바로 쓸 수 있게 하는 저장소.
   이 중 하나는 "내 정보"(is_primary)로 지정할 수 있고, "오늘의 운세"는 그 인물을 쓴다 —
   예전엔 마이페이지에 별도의 "생년월일시 저장" 필드가 계정에 하나 더 있어서 저장하는
   곳이 두 군데로 나뉘어 있었는데, 그걸 없애고 여기 하나로 합쳤다. */
const db = require('./index');

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    gender: row.gender,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    birthDay: row.birth_day,
    birthHour: row.birth_hour,
    birthMinute: row.birth_minute,
    isLunar: !!row.is_lunar,
    isLeap: !!row.is_leap,
    city: row.city,
    isPrimary: !!row.is_primary
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO saved_profiles (user_id, label, name, gender, birth_year, birth_month, birth_day,
                                 birth_hour, birth_minute, is_lunar, is_leap, city, is_primary)
    VALUES (@userId, @label, @name, @gender, @birthYear, @birthMonth, @birthDay,
            @birthHour, @birthMinute, @isLunar, @isLeap, @city, @isPrimary)
  `),
  update: db.prepare(`
    UPDATE saved_profiles SET label=@label, name=@name, gender=@gender, birth_year=@birthYear,
      birth_month=@birthMonth, birth_day=@birthDay, birth_hour=@birthHour, birth_minute=@birthMinute,
      is_lunar=@isLunar, is_leap=@isLeap, city=@city
    WHERE id=@id AND user_id=@userId
  `),
  remove: db.prepare('DELETE FROM saved_profiles WHERE id = ? AND user_id = ?'),
  findById: db.prepare('SELECT * FROM saved_profiles WHERE id = ? AND user_id = ?'),
  listByUser: db.prepare('SELECT * FROM saved_profiles WHERE user_id = ? ORDER BY id ASC'),
  findPrimary: db.prepare('SELECT * FROM saved_profiles WHERE user_id = ? AND is_primary = 1 LIMIT 1'),
  clearPrimary: db.prepare('UPDATE saved_profiles SET is_primary = 0 WHERE user_id = ?'),
  setPrimaryFlag: db.prepare('UPDATE saved_profiles SET is_primary = 1 WHERE id = ? AND user_id = ?')
};

const MAX_PROFILES_PER_USER = 12;

function listMine(userId) {
  return stmts.listByUser.all(userId).map(toPublic);
}

function findPrimary(userId) {
  return toPublic(stmts.findPrimary.get(userId));
}

function setPrimary(userId, id) {
  const row = stmts.findById.get(id, userId);
  if (!row) throw new Error('해당 인물 정보를 찾을 수 없습니다.');
  const tx = db.transaction(() => {
    stmts.clearPrimary.run(userId);
    stmts.setPrimaryFlag.run(id, userId);
  });
  tx();
  return toPublic(stmts.findById.get(id, userId));
}

function create(userId, data) {
  const existing = stmts.listByUser.all(userId);
  if (existing.length >= MAX_PROFILES_PER_USER) {
    const err = new Error(`저장할 수 있는 인물은 최대 ${MAX_PROFILES_PER_USER}명입니다.`);
    err.code = 'limit_exceeded';
    throw err;
  }
  // 계정에 저장된 인물이 하나도 없었다면, 첫 번째로 추가하는 인물을 자동으로 "내 정보"로
  // 지정한다 — 대부분 처음 추가하는 게 본인이고, 오늘의 운세를 쓰려면 어차피 하나는
  // 지정해야 하니 매번 별도로 누르게 하지 않는다.
  const makePrimary = existing.length === 0;
  const info = stmts.insert.run({
    userId,
    label: String(data.label || '').slice(0, 20) || '이름 없음',
    name: data.name ? String(data.name).slice(0, 30) : null,
    gender: data.gender === '여' || data.gender === '남' ? data.gender : null,
    birthYear: Number(data.birthYear),
    birthMonth: Number(data.birthMonth),
    birthDay: Number(data.birthDay),
    birthHour: data.birthHour != null && data.birthHour !== '' ? Number(data.birthHour) : null,
    birthMinute: data.birthMinute != null && data.birthMinute !== '' ? Number(data.birthMinute) : 0,
    isLunar: data.isLunar ? 1 : 0,
    isLeap: data.isLeap ? 1 : 0,
    city: data.city || null,
    isPrimary: makePrimary ? 1 : 0
  });
  return toPublic(stmts.findById.get(info.lastInsertRowid, userId));
}

function update(userId, id, data) {
  const row = stmts.findById.get(id, userId);
  if (!row) throw new Error('해당 인물 정보를 찾을 수 없습니다.');
  stmts.update.run({
    id, userId,
    label: String(data.label || '').slice(0, 20) || '이름 없음',
    name: data.name ? String(data.name).slice(0, 30) : null,
    gender: data.gender === '여' || data.gender === '남' ? data.gender : null,
    birthYear: Number(data.birthYear),
    birthMonth: Number(data.birthMonth),
    birthDay: Number(data.birthDay),
    birthHour: data.birthHour != null && data.birthHour !== '' ? Number(data.birthHour) : null,
    birthMinute: data.birthMinute != null && data.birthMinute !== '' ? Number(data.birthMinute) : 0,
    isLunar: data.isLunar ? 1 : 0,
    isLeap: data.isLeap ? 1 : 0,
    city: data.city || null
  });
  return toPublic(stmts.findById.get(id, userId));
}

function remove(userId, id) {
  const info = stmts.remove.run(id, userId);
  if (info.changes === 0) throw new Error('해당 인물 정보를 찾을 수 없습니다.');
}

/** 예전 마이페이지 "생년월일시 저장" 폼(users 테이블 컬럼)에 이미 값이 있는데 저장된
 *  인물이 하나도 없는 계정은, 그 값을 "나"라는 이름의 내 정보(primary)로 한 번만 옮겨준다.
 *  데이터를 잃지 않으면서 저장 창구를 하나로 합치기 위한 1회성 이관. */
function migrateLegacyBirthIfNeeded(userId, legacyUser) {
  const existing = stmts.listByUser.all(userId);
  if (existing.length > 0) return findPrimary(userId);
  if (!legacyUser || !legacyUser.birth_year) return null;
  return create(userId, {
    label: '나',
    gender: legacyUser.gender,
    birthYear: legacyUser.birth_year,
    birthMonth: legacyUser.birth_month,
    birthDay: legacyUser.birth_day,
    birthHour: legacyUser.birth_hour,
    birthMinute: legacyUser.birth_minute,
    isLunar: !!legacyUser.is_lunar,
    isLeap: !!legacyUser.is_leap,
    city: legacyUser.city
  });
}

module.exports = { listMine, create, update, remove, findPrimary, setPrimary, migrateLegacyBirthIfNeeded, MAX_PROFILES_PER_USER };
