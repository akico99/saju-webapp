'use strict';
/* 로그인 계정에 여러 명(나, 배우자, 자녀 등)의 생년월일시를 저장해두고, 궁합·인생그래프
   같은 각 서비스에서 매번 다시 입력하지 않고 "불러오기"로 바로 쓸 수 있게 하는 저장소. */
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
    city: row.city
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO saved_profiles (user_id, label, name, gender, birth_year, birth_month, birth_day,
                                 birth_hour, birth_minute, is_lunar, is_leap, city)
    VALUES (@userId, @label, @name, @gender, @birthYear, @birthMonth, @birthDay,
            @birthHour, @birthMinute, @isLunar, @isLeap, @city)
  `),
  update: db.prepare(`
    UPDATE saved_profiles SET label=@label, name=@name, gender=@gender, birth_year=@birthYear,
      birth_month=@birthMonth, birth_day=@birthDay, birth_hour=@birthHour, birth_minute=@birthMinute,
      is_lunar=@isLunar, is_leap=@isLeap, city=@city
    WHERE id=@id AND user_id=@userId
  `),
  remove: db.prepare('DELETE FROM saved_profiles WHERE id = ? AND user_id = ?'),
  findById: db.prepare('SELECT * FROM saved_profiles WHERE id = ? AND user_id = ?'),
  listByUser: db.prepare('SELECT * FROM saved_profiles WHERE user_id = ? ORDER BY id ASC')
};

const MAX_PROFILES_PER_USER = 12;

function listMine(userId) {
  return stmts.listByUser.all(userId).map(toPublic);
}

function create(userId, data) {
  const existing = stmts.listByUser.all(userId);
  if (existing.length >= MAX_PROFILES_PER_USER) {
    const err = new Error(`저장할 수 있는 인물은 최대 ${MAX_PROFILES_PER_USER}명입니다.`);
    err.code = 'limit_exceeded';
    throw err;
  }
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
    city: data.city || null
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

module.exports = { listMine, create, update, remove, MAX_PROFILES_PER_USER };
