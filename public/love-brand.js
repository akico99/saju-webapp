'use strict';
// 공개 가능한 표현만 보관한다. 서버와 브라우저가 같은 상품 가격을 사용한다.
(function (root) {
  const brand = {
    operator: '사주보는 수달',
    character: {
      name: '여울',
      role: '관계의 흐름을 읽는 이야기 안내자',
      disclosure: '여울은 사주 풀이를 안내하는 창작 캐릭터입니다. 만세력 계산을 바탕으로 AI가 해석을 작성하며, 상담사의 대면 상담은 제공하지 않습니다.',
      // 이번 비공개 미리보기용 신규 원화. 별도 세션의 사용자 캐릭터 원본과는 구분한다.
      portrait: '/love-assets/yeoul-cover.png'
    },
    product: {
      title: '인연의 시기',
      subtitle: '나의 연애 패턴과 앞으로 12개월',
      priceKrw: 19900,
      chapters: ['인연의 흐름이 강한 세 달', '나에게 끌리는 사람과 내가 끌리는 사람', '만남이 생기기 쉬운 자리', '반복되기 쉬운 연애 패턴', '조심할 관계의 신호', '지금 상황에 맞는 행동 제안', '앞으로 12개월, 달마다 한 줄']
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = brand;
  else root.LoveBrand = brand;
})(typeof window === 'object' ? window : globalThis);
