/**
 * 마음 네컷 포토부스 - Configuration & Design Tokens
 * 72종 오리지널 마음구름이 & 이천시 정신건강복지센터 20주년 기념 스티커
 */
window.PHOTO_BOOTH_CONFIG = {
  brand: {
    centerName: '이천시정신건강복지센터 20주년',
    eventName: '20th Anniversary 마음 네컷',
    title: '오늘의 마음을\n네 컷에 담아요',
    subtitle: '6장을 찍고 마음에 드는 4장을 골라\n나만의 마음 네컷을 완성해 보세요.',
    completionTitle: '마음 네컷 완성!',
    completionMessage: '이천시민의 마음건강 20년, 언제나 함께합니다 ✨',
    privacyNotice: '이름·전화번호를 받지 않아요',
    privacyDetail: '촬영된 사진은 QR 다운로드를 위해 안전하게 보관된 후 자동 삭제됩니다.'
  },

  colors: {
    brandPrimary: '#FF4F87',
    brandPrimaryHover: '#EA3C73',
    brandPrimarySoft: '#FFE3EC',
    brandSecondary: '#FFC93C',
    brandSecondarySoft: '#FFF3C4',
    brandMint: '#5ED6B3',
    brandLilac: '#8E72D8',
    surfaceDark: '#17141D',
    surfaceDarkElevated: '#24202C',
    surfaceLight: '#FFFDF9',
    surfaceMuted: '#F5F1F7',
    textPrimary: '#211C29',
    textSecondary: '#6E6875',
    textInverse: '#FFFFFF',
    success: '#28B886',
    warning: '#F5A623',
    error: '#D93F64',
    border: '#E5DEE9',
    focus: '#FFD43B'
  },

  capture: {
    count: 6,
    selectionCount: 4,
    countdownSeconds: 3,
    betweenShotsMs: 750
  },

  timeouts: {
    idleResetMs: 120000,
    completionResetMs: 90000,
    finalWarningSeconds: 15
  },

  frame: {
    width: 1200,
    height: 1420,
    headerHeight: 120,
    footerHeight: 100,
    padding: 40,
    gap: 20,
    photoRadius: 16,
    backgroundColor: '#FFFDF9',
    headerColor: '#211C29',
    footerColor: '#6E6875',
    borderColor: '#E5DEE9'
  },

  stickers: {
    categories: [
      { id: 'icheon_20th', label: '🎉 이천 20주년' },
      { id: 'cloud_emotion', label: '구름이 표정' },
      { id: 'cloud_costume', label: '구름이 코스튬' },
      { id: 'cloud_action', label: '구름이 응원' },
      { id: 'cloud_special', label: '구름이 스페셜' },
      { id: 'decorations', label: '러블리 데코' }
    ],
    items: [
      // 0. 이천시 정신건강복지센터 20주년 기념 스티커 (12종)
      { id: 'ic_01', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_01.png', label: '이천센터 20주년 황금엠블럼' },
      { id: 'ic_02', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_02.png', label: '함께한 20년 늘 곁에 리본' },
      { id: 'ic_03', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_03.png', label: '20주년 축하 2단 케이크' },
      { id: 'ic_04', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_04.png', label: '20th 축하해 고깔 구름이' },
      { id: 'ic_05', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_05.png', label: '20주년 최고 엄지척 구름이' },
      { id: 'ic_06', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_06.png', label: '20th 이천센터 골든 트로피' },
      { id: 'ic_07', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_07.png', label: '마음건강 20년 핑크 하트' },
      { id: 'ic_08', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_08.png', label: '20 숫자 하트풍선 구름이' },
      { id: 'ic_09', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_09.png', label: '20th 축하 파티 폭죽' },
      { id: 'ic_10', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_10.png', label: '꽃다발 & 20th 메달 구름이' },
      { id: 'ic_11', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_11.png', label: '20년 축하해요 손하트 구름이' },
      { id: 'ic_12', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_12.png', label: '20th 선물상자 구름이' },

      // 1. 마음구름이 표정 (16종)
      { id: 'ce_01', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_01.png', label: '구름이 미소' },
      { id: 'ce_02', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_02.png', label: '구름이 하트눈' },
      { id: 'ce_03', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_03.png', label: '구름이 윙크' },
      { id: 'ce_04', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_04.png', label: '구름이 기쁨눈물' },
      { id: 'ce_05', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_05.png', label: '구름이 선글라스' },
      { id: 'ce_06', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_06.png', label: '구름이 수줍음' },
      { id: 'ce_07', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_07.png', label: '구름이 놀람' },
      { id: 'ce_08', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_08.png', label: '구름이 볼빵빵' },
      { id: 'ce_09', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_09.png', label: '구름이 눈웃음' },
      { id: 'ce_10', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_10.png', label: '구름이 수면모자' },
      { id: 'ce_11', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_11.png', label: '구름이 불타는열정' },
      { id: 'ce_12', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_12.png', label: '구름이 냠냠' },
      { id: 'ce_13', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_13.png', label: '구름이 갸우뚱' },
      { id: 'ce_14', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_14.png', label: '구름이 뽀뽀' },
      { id: 'ce_15', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_15.png', label: '구름이 대폭소' },
      { id: 'ce_16', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_16.png', label: '구름이 반짝이' },

      // 2. 마음구름이 코스튬 (16종)
      { id: 'cc_01', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_01.png', label: '파티고깔 구름이' },
      { id: 'cc_02', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_02.png', label: '황금왕관 구름이' },
      { id: 'cc_03', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_03.png', label: '학사모 구름이' },
      { id: 'cc_04', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_04.png', label: '산타 구름이' },
      { id: 'cc_05', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_05.png', label: '의사 구름이' },
      { id: 'cc_06', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_06.png', label: '요리사 구름이' },
      { id: 'cc_07', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_07.png', label: '요리사 구름이' },
      { id: 'cc_08', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_08.png', label: '화가 구름이' },
      { id: 'cc_09', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_09.png', label: '운동선수 구름이' },
      { id: 'cc_10', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_10.png', label: 'DJ헤드폰 구름이' },
      { id: 'cc_11', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_11.png', label: '노랑우비 구름이' },
      { id: 'cc_12', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_12.png', label: '꽃화관 구름이' },
      { id: 'cc_13', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_13.png', label: '토끼귀 구름이' },
      { id: 'cc_14', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_14.png', label: '마술사 구름이' },
      { id: 'cc_15', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_15.png', label: '천사 구름이' },
      { id: 'cc_16', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_16.png', label: '포근담요 구름이' },

      // 3. 마음구름이 응원 & 액션 (16종)
      { id: 'ca_01', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_01.png', label: '큰하트 구름이' },
      { id: 'ca_02', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_02.png', label: '최고야 구름이' },
      { id: 'ca_03', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_03.png', label: '더블브이 구름이' },
      { id: 'ca_04', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_04.png', label: '응원폼폼 구름이' },
      { id: 'ca_05', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_05.png', label: '네잎클로버 구름이' },
      { id: 'ca_06', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_06.png', label: '선물상자 구름이' },
      { id: 'ca_07', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_07.png', label: '카메라찰칵 구름이' },
      { id: 'ca_08', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_08.png', label: '따뜻한커피 구름이' },
      { id: 'ca_09', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_09.png', label: '마음편지 구름이' },
      { id: 'ca_10', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_10.png', label: '꽃다발 구름이' },
      { id: 'ca_11', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_11.png', label: '풍선둥둥 구름이' },
      { id: 'ca_12', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_12.png', label: '안녕손흔들기 구름이' },
      { id: 'ca_13', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_13.png', label: '마이크사회자 구름이' },
      { id: 'ca_14', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_14.png', label: '금메달 구름이' },
      { id: 'ca_15', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_15.png', label: '토닥토닥 구름이' },
      { id: 'ca_16', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_16.png', label: '하트날리기 구름이' },

      // 4. 마음구름이 스페셜 (12종)
      { id: 'cs_01', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_01.png', label: '볼하트 구름이' },
      { id: 'cs_02', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_02.png', label: '스파클러 구름이' },
      { id: 'cs_03', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_03.png', label: '무지개라이딩 구름이' },
      { id: 'cs_04', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_04.png', label: '요정날개 구름이' },
      { id: 'cs_05', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_05.png', label: '팝콘냠냠 구름이' },
      { id: 'cs_06', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_06.png', label: '셀카봉 구름이' },
      { id: 'cs_07', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_07.png', label: '칭찬도장 구름이' },
      { id: 'cs_08', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_08.png', label: '힐링독서 구름이' },
      { id: 'cs_09', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_09.png', label: '우쿨렐레 구름이' },
      { id: 'cs_10', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_10.png', label: '클로버핀 구름이' },
      { id: 'cs_11', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_11.png', label: '반짝리본 구름이' },
      { id: 'cs_12', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_12.png', label: '쿨쿨꿀잠 구름이' },

      // 5. 러블리 데코 (10종)
      { id: 'd_heart', category: 'decorations', type: 'emoji', value: '💖', label: '스파클 하트' },
      { id: 'd_sparkle', category: 'decorations', type: 'emoji', value: '✨', label: '반짝이' },
      { id: 'd_clover', category: 'decorations', type: 'emoji', value: '🍀', label: '행운 클로버' },
      { id: 'd_ribbon', category: 'decorations', type: 'emoji', value: '🎀', label: '핑크 리본' },
      { id: 'd_star', category: 'decorations', type: 'emoji', value: '⭐', label: '별' },
      { id: 'd_rainbow', category: 'decorations', type: 'emoji', value: '🌈', label: '무지개' },
      { id: 'd_cherry', category: 'decorations', type: 'emoji', value: '🌸', label: '벚꽃' },
      { id: 'd_tulip', category: 'decorations', type: 'emoji', value: '🌷', label: '튤립' },
      { id: 'd_balloon', category: 'decorations', type: 'emoji', value: '🎈', label: '풍선' },
      { id: 'd_crown', category: 'decorations', type: 'emoji', value: '👑', label: '왕관' }
    ]
  },

  // Color Theme Frames for customization
  themes: {
    classic_light: {
      id: 'classic_light',
      name: '내추럴 크림',
      backgroundColor: '#FFFDF9',
      headerColor: '#211C29',
      footerColor: '#6E6875',
      borderColor: '#E5DEE9',
      swatch: '#FFFDF9'
    },
    chic_dark: {
      id: 'chic_dark',
      name: '모던 차콜',
      backgroundColor: '#17141D',
      headerColor: '#FFFFFF',
      footerColor: '#A29DB1',
      borderColor: '#24202C',
      swatch: '#17141D'
    },
    brand_pink: {
      id: 'brand_pink',
      name: '로즈 핑크',
      backgroundColor: '#FFE3EC',
      headerColor: '#8E1D4A',
      footerColor: '#B0356A',
      borderColor: '#FFC5D8',
      swatch: '#FF4F87'
    },
    soft_yellow: {
      id: 'soft_yellow',
      name: '선샤인 옐로우',
      backgroundColor: '#FFF3C4',
      headerColor: '#6E4E00',
      footerColor: '#8C6500',
      borderColor: '#FFE28A',
      swatch: '#FFC93C'
    },
    mint_breeze: {
      id: 'mint_breeze',
      name: '민트 브리즈',
      backgroundColor: '#E0FAF1',
      headerColor: '#0E5944',
      footerColor: '#177A5E',
      borderColor: '#BAF2E1',
      swatch: '#5ED6B3'
    },
    lilac_dream: {
      id: 'lilac_dream',
      name: '라일락 드림',
      backgroundColor: '#EFEAFF',
      headerColor: '#412B7D',
      footerColor: '#5E41A8',
      borderColor: '#D8CCFF',
      swatch: '#8E72D8'
    }
  },

  filters: [
    { id: 'normal', name: 'Original', desc: '자연스러운 원본', filterStr: 'none' },
    { id: 'bright', name: 'Bright', desc: '화사하고 맑은 톤', filterStr: 'brightness(1.07) contrast(1.02) saturate(1.1)' },
    { id: 'warm', name: 'Warm', desc: '따뜻한 감성 톤', filterStr: 'sepia(0.12) saturate(1.15) brightness(1.03)' },
    { id: 'mono', name: 'Mono B&W', desc: '클래식 흑백', filterStr: 'grayscale(1) contrast(1.18)' },
    { id: 'soft_cool', name: 'Cool', desc: '깨끗하고 시원한 톤', filterStr: 'hue-rotate(180deg) saturate(0.9) brightness(1.04)' }
  ],

  customBackgrounds: []
};

// Config validation helper
window.validateBoothConfig = function (cfg) {
  const errors = [];
  if (!cfg) return { valid: false, errors: ['Configuration object is missing'] };
  if (!cfg.brand?.title) errors.push('brand.title is required');
  if (!cfg.colors?.brandPrimary) errors.push('colors.brandPrimary is required');
  if (typeof cfg.capture?.count !== 'number' || cfg.capture.count < 4) {
    errors.push('capture.count must be a number >= 4');
  }
  if (typeof cfg.capture?.selectionCount !== 'number' || cfg.capture.selectionCount !== 4) {
    errors.push('capture.selectionCount must be 4');
  }
  if (!cfg.frame?.width || !cfg.frame?.height) errors.push('frame dimensions are required');
  if (!Array.isArray(cfg.stickers?.items) || cfg.stickers.items.length === 0) {
    errors.push('stickers.items must be a non-empty array');
  }
  return { valid: errors.length === 0, errors };
};
