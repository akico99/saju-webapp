'use strict';
/* 생성된 PDF/PNG가 저장되는 폴더 — 예전엔 각 라우트 파일(generate.js/compat.js/quick.js/
   dateSelect.js/lifeTopics.js)마다 따로
   `path.join(__dirname, '..', '..', '..', 'output')`를 정의해 완전히 같은 경로를
   5번 중복 계산했다.

   더 심각한 문제: Render 같은 PaaS의 기본 웹 서비스는 "영구 디스크(Persistent Disk)"를
   따로 붙이지 않으면 배포할 때마다(또는 컨테이너가 재시작될 때마다) 로컬 파일시스템이
   통째로 초기화된다. orders 테이블엔 "완료"로 남아있는데 실제 PDF 파일만 사라져서,
   결제하고 받았던 리포트를 나중에 마이페이지에서 다시 받을 수 없게 되는 사고가 실제로
   발생했다(2026-09-08).

   근본 해결은 이 폴더를 Render의 영구 디스크 마운트 경로로 옮기는 것 — 그러려면 배포
   환경마다 다른 절대경로를 코드 수정 없이 지정할 수 있어야 한다. OUTPUT_DIR 환경변수가
   있으면 그 경로를 쓰고, 없으면(로컬 개발) 기존과 동일한 프로젝트 내 output/ 폴더를 쓴다. */
const path = require('path');

const OUTPUT_ROOT = process.env.OUTPUT_DIR
  ? path.resolve(process.env.OUTPUT_DIR)
  : path.join(__dirname, '..', '..', 'output');

module.exports = { OUTPUT_ROOT };
