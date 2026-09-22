(function exposeEpisodes(root) {
  const lifetime = {
    id: 'lifetime',
    title: '한 번은, 내 삶의 지도를 펼쳐보고 싶었다',
    description: '흩어진 선택을 한 장의 인생 지도로 바라보는 이야기',
    midCtaAfter: 10,
    midCta: { href: '#cut-11', label: '인생 전체의 흐름은 어떻게 이어질까' },
    cta: {
      href: '/lifetime-report.html?from=lifetime-webtoon',
      label: '내 삶의 지도 펼쳐보기',
      price: '14,900원'
    },
    subCta: { href: '/services.html#free', label: '무료 리딩 5종 먼저 보기' },
    cuts: [
      { src: '/webtoon/lifetime/cut-01.webp', width: 1080, height: 1350, alt: '이사 상자에서 오래된 수첩을 꺼내는 지호', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '이 수첩을 펼치면 늘 비슷한 문장이 나온다.' }] },
      { src: '/webtoon/lifetime/cut-02.webp', width: 1080, height: 900, alt: '여러 해에 같은 고민이 적힌 수첩', gap: 'md', texts: [{ type: 'thought', position: 'bottom-left', body: '이직할까. 버틸까. 다시 시작할까.' }] },
      { src: '/webtoon/lifetime/cut-03.webp', width: 1080, height: 1350, alt: '수첩 앞에서 생각에 잠긴 지호', gap: 'lg', texts: [{ type: 'thought', position: 'top-right', body: '왜 나는 중요한 순간마다 같은 자리로 돌아올까.' }] },
      { src: '/webtoon/lifetime/cut-04.webp', width: 1080, height: 900, alt: '휴대폰으로 올해 운세를 넘기는 손', gap: 'sm', texts: [] },
      { src: '/webtoon/lifetime/cut-05.webp', width: 1080, height: 1350, alt: '서로 다른 결과 화면 사이에서 혼란스러운 지호', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '올해의 답은 매번 달랐다.' }] },
      { src: '/webtoon/lifetime/cut-06.webp', width: 1080, height: 900, alt: '휴대폰을 엎고 책상에 기대어 있는 지호', gap: 'xl', texts: [] },
      { src: '/webtoon/lifetime/cut-07.webp', width: 1080, height: 1350, alt: '아침 책상 위에 조용히 앉아 있는 수달', gap: 'md', texts: [{ type: 'talk', position: 'top-left', body: '올해 하나만 떼어 보면 더 헷갈릴 수 있어요.' }] },
      { src: '/webtoon/lifetime/cut-08.webp', width: 1080, height: 1350, alt: '수달에게 오래된 수첩을 건네는 지호', gap: 'md', texts: [{ type: 'talk', position: 'top-right', body: '태어난 날부터 같이 펼쳐 볼까요.' }] },
      { src: '/webtoon/lifetime/cut-09.webp', width: 1080, height: 1350, alt: '종이 위 만세력 여덟 자리가 놓이는 장면', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '태어난 순간의 구조가 먼저 자리를 잡았다.' }] },
      { src: '/webtoon/lifetime/cut-10.webp', width: 1080, height: 1350, alt: '오행과 인생 주제가 한 흐름으로 이어지는 지도', gap: 'lg', texts: [{ type: 'narration', position: 'bottom-left', body: '따로 보였던 일들이 같은 흐름 위에 놓였다.' }] },
      { src: '/webtoon/lifetime/cut-11.webp', width: 1080, height: 1350, alt: '과거의 선택 장면들이 한 흐름선 위에 포개진 모습', gap: 'xl', texts: [] },
      { src: '/webtoon/lifetime/cut-12.webp', width: 1080, height: 1600, alt: '펼쳐진 인생 지도를 바라보는 지호의 얼굴', gap: 'xl', texts: [{ type: 'key', position: 'top-left', body: '한 해씩 답을 찾는 대신, 내 삶 전체의 지도를 한 번 펴보는 편이 빠릅니다.' }] },
      { src: '/webtoon/lifetime/cut-13.webp', width: 1080, height: 1350, alt: '인생 지도에서 반복 지점을 손가락으로 짚는 지호', gap: 'md', texts: [{ type: 'thought', position: 'bottom-left', body: '비슷한 때마다 같은 방식으로 버텼던 거구나.' }] },
      { src: '/webtoon/lifetime/cut-14.webp', width: 1080, height: 1350, alt: '인생 지도의 끝에서 앞으로의 길이 이어지는 모습', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '앞으로의 시기는 준비할 순서를 보여 줬다.' }] },
      { src: '/webtoon/lifetime/cut-15.webp', width: 1080, height: 1350, alt: '수달이 독자 쪽으로 금색 나침반을 내미는 모습', gap: 'md', texts: [{ type: 'talk', position: 'top-left', body: '이번에는 당신의 지도를 펼쳐 볼 차례입니다.' }] },
      { src: '/webtoon/lifetime/cut-16.webp', width: 1080, height: 1600, alt: '아침 창가에서 지호와 수달이 펼쳐진 지도를 바라보는 모습', gap: 'md', texts: [] }
    ]
  };

  const episodes = { lifetime };
  root.WEBTOON_EPISODES = episodes;
  if (typeof module !== 'undefined' && module.exports) module.exports = episodes;
})(typeof window !== 'undefined' ? window : globalThis);
