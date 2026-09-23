(function exposeEpisodes(root) {
  // 컷 간격은 연출이다. 기본은 0 — 한 장면 안의 컷은 붙여서 한 호흡으로 읽힌다.
  // 'beat'는 장면 전환, 'breath'는 독자가 멈춰야 하는 두 지점에만 쓴다.
  const lifetime = {
    id: 'lifetime',
    title: '올해 운세만 다섯 번 봤다',
    description: '1년치 답을 다섯 번 사는 대신, 평생치 지도를 한 번 펼친 이야기',
    midCtaAfter: 12,
    midCta: {
      href: '/lifetime-report.html?from=lifetime-webtoon-mid',
      label: '내 지도부터 펼쳐보기 · 14,900원'
    },
    cta: {
      href: '/lifetime-report.html?from=lifetime-webtoon',
      label: '내 평생사주 펼쳐보기',
      price: '14,900원',
      spec: '명식·격국·용신·대운 18장 · 약 100쪽 PDF\n결제 후 10분 내 자동 생성 · 3초 요약 카드 포함'
    },
    subCta: { href: '/services.html#free', label: '무료 리딩 5종 먼저 보기' },
    cuts: [
      { src: '/webtoon/lifetime/cut-01.webp', width: 1080, height: 1350, alt: '이사 상자에서 오래된 수첩을 꺼내는 지호', gap: 'none', texts: [{ type: 'narration', position: 'top-left', body: '이사할 때마다 이 수첩이 나온다.' }] },
      { src: '/webtoon/lifetime/cut-02.webp', width: 1080, height: 900, alt: '여러 해에 같은 고민이 적힌 수첩', gap: 'none', texts: [{ type: 'narration', position: 'top-left', body: '3년째 같은 문장이 적혀 있었다.' }] },
      { src: '/webtoon/lifetime/cut-03.webp', width: 1080, height: 1350, alt: '수첩 앞에서 생각에 잠긴 지호', gap: 'beat', texts: [{ type: 'thought', position: 'top-left', body: '이직할까. 버틸까. 다시 시작할까.' }] },
      { src: '/webtoon/lifetime/cut-04.webp', width: 1080, height: 900, alt: '휴대폰으로 올해 운세를 넘기는 손', gap: 'none', texts: [{ type: 'narration', position: 'top-left', body: '그래서 올해 운세를 봤다. 다섯 번.' }] },
      { src: '/webtoon/lifetime/cut-05.webp', width: 1080, height: 1350, alt: '서로 다른 결과 화면 사이에서 혼란스러운 지호', gap: 'none', texts: [{ type: 'thought', position: 'top-left', body: '다섯 군데서 다섯 개의 답이 나왔다.' }] },
      { src: '/webtoon/lifetime/cut-06.webp', width: 1080, height: 900, alt: '휴대폰을 엎고 책상에 기대어 있는 지호', gap: 'breath', texts: [{ type: 'thought', position: 'top-left', body: '그래서 나는, 뭘 하면 되는데?' }] },
      { src: '/webtoon/lifetime/cut-07.webp', width: 1080, height: 1350, alt: '아침 책상 위에 조용히 앉아 있는 수달', gap: 'none', texts: [{ type: 'talk', position: 'top-right', body: "올해 운세는 '올해 날씨'예요." }] },
      { src: '/webtoon/lifetime/cut-08.webp', width: 1080, height: 1350, alt: '수달에게 오래된 수첩을 건네는 지호', gap: 'beat', texts: [{ type: 'talk', position: 'top-right', body: '날씨만 보면 어디로 갈지는 안 나와요.' }] },
      { src: '/webtoon/lifetime/cut-09.webp', width: 1080, height: 1350, alt: '종이 위 만세력 여덟 자리가 놓이는 장면', gap: 'none', texts: [{ type: 'narration', position: 'top-left', body: '먼저, 태어난 순간을 여덟 칸에 옮겼다.' }] },
      { src: '/webtoon/lifetime/cut-10.webp', width: 1080, height: 1350, alt: '오행과 인생 주제가 한 흐름으로 이어지는 지도', gap: 'none', texts: [{ type: 'narration', position: 'bottom-left', body: '10년 단위로 길이 갈라지기 시작했다.' }] },
      { src: '/webtoon/lifetime/cut-11.webp', width: 1080, height: 1350, alt: '과거의 선택 장면들이 한 흐름선 위에 포개진 모습', gap: 'beat', texts: [] },
      { src: '/webtoon/lifetime/cut-12.webp', width: 1080, height: 1600, alt: '펼쳐진 인생 지도를 바라보는 지호의 얼굴', gap: 'breath', texts: [{ type: 'key', position: 'bottom-center', body: '운세는 1년짜리 날씨,\n사주는 평생짜리 지도.' }] },
      { src: '/webtoon/lifetime/cut-13.webp', width: 1080, height: 1350, alt: '인생 지도에서 반복 지점을 손가락으로 짚는 지호', gap: 'none', texts: [{ type: 'thought', position: 'top-right', body: '나 매번 여기서 똑같이 버텼구나.' }] },
      { src: '/webtoon/lifetime/cut-14.webp', width: 1080, height: 1350, alt: '인생 지도의 끝에서 앞으로의 길이 이어지는 모습', gap: 'beat', texts: [{ type: 'narration', position: 'top-left', body: '다음 고비와 준비할 순서까지 적혀 있었다.' }] },
      { src: '/webtoon/lifetime/cut-15.webp', width: 1080, height: 1350, alt: '수달이 독자 쪽으로 금색 나침반을 내미는 모습', gap: 'none', texts: [{ type: 'talk', position: 'top-center', body: '이제 당신 지도를 펼칠 차례예요.' }] },
      { src: '/webtoon/lifetime/cut-16.webp', width: 1080, height: 1600, alt: '아침 창가에서 지호와 수달이 펼쳐진 지도를 바라보는 모습', gap: 'none', texts: [] }
    ]
  };

  const episodes = { lifetime };
  root.WEBTOON_EPISODES = episodes;
  if (typeof module !== 'undefined' && module.exports) module.exports = episodes;
})(typeof window !== 'undefined' ? window : globalThis);
