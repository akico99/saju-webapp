'use strict';
/* 장면형 읽기 화면(궁합 결과) 공개 스위치. 카드사 심사가 끝나기 전에는 운영 화면이 바뀌면 안 되므로
   환경변수로 켰을 때만 스크립트·스타일·그림이 열린다(app.js 게이트). 꺼져 있으면 궁합 페이지는 기존 렌더링만 쓴다. */
const enabled = /^(1|true|yes|on)$/i.test(String(process.env.SCENE_READER_ENABLED || '').trim());

module.exports = { enabled };
