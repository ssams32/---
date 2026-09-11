/**
 * 마음 네컷 포토부스 - Configuration & Design Tokens
 * 72종 오리지널 마음 너우리 & 이천시 정신건강복지센터 20주년 기념 스티커
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

  eventMode: {
    mode: "fast-lane",

    workflow: {
      captureCount: 6,
      selectionCount: 4,
      enableParticipantFilterStep: false,
      enableParticipantStickerStep: false,
      enableFrameSelectionStep: false,
      enableConfirmationStep: false,
      proceedImmediatelyAfterSelection: true
    },

    fixedDesign: {
      framePresetId: "event-black",
      stickerPresetId: "event-fixed-decoration",
      colorFilterPresetId: "original",
      sketchEffectPresetId: null,

      applyFrameAutomatically: true,
      applyFixedStickersAutomatically: true,
      applyFilterAutomatically: false,
      applySketchAutomatically: false
    },

    timing: {
      countdownSeconds: 3,
      betweenShotsMs: 700,
      selectionIdleWarningMs: 45000,
      selectionAutoResetMs: 60000,
      completionAutoResetMs: 45000,
      finalResetWarningSeconds: 10
    }
  },

  frames: {
    defaultId: "event-black",

    presets: [
      {
        id: "event-black",
        label: "행사 블랙 프레임",

        colors: {
          background: "#0B0B0D",
          photoBorder: "#2A2A2F",
          primaryText: "#FFFFFF",
          secondaryText: "#CFCFD4",
          accent: "#FF4F87"
        },

        header: {
          enabled: true,
          text: "오늘의 마음 네컷",
          heightRatio: 0.060,
          fontWeight: 900
        },

        footer: {
          enabled: true,
          text: "당신의 오늘을 응원합니다",
          heightRatio: 0.075,
          fontWeight: 700
        },

        photo: {
          cornerRadiusRatio: 0.012,
          borderWidthRatio: 0.003,
          gapRatio: 0.010
        }
      }
    ]
  },

  fixedStickerPresets: {
    defaultId: "event-fixed-decoration",

    presets: [
      {
        id: "event-fixed-decoration",
        label: "행사 기본 꾸미기",

        placements: [
          {
            id: "top-sparkle",
            type: "emoji",
            value: "✨",
            target: "card",
            x: 0.90,
            y: 0.045,
            scale: 0.040,
            rotation: -0.12,
            opacity: 0.85
          },
          {
            id: "bottom-heart",
            type: "emoji",
            value: "💜",
            target: "card",
            x: 0.08,
            y: 0.952,
            scale: 0.034,
            rotation: 0.10,
            opacity: 0.90
          }
        ]
      }
    ]
  },

  printLayout: {
    printerProfile: "canon-selphy-cp1200-postcard-4up",

    sheet: {
      width: 1200,
      height: 1776,
      physicalWidthMm: 100,
      physicalHeightMm: 148,
      orientation: "portrait",
      backgroundColor: "#FFFFFF"
    },

    grid: {
      columns: 2,
      rows: 2,
      verticalGutter: 12,
      horizontalGutter: 12,
      outerSafeMargin: 18
    },

    card: {
      copies: 4,
      photoCount: 4,
      photoDirection: "vertical",
      innerPadding: 18,
      photoGap: 8,
      headerRatio: 0.060,
      footerRatio: 0.075,
      framePresetId: "event-black",
      fixedStickerPresetId: "event-fixed-decoration"
    },

    cutGuide: {
      visible: true,
      color: "#B8B8B8",
      opacity: 0.55,
      width: 1,
      dash: [8, 8]
    },

    export: {
      mimeType: "image/jpeg",
      quality: 0.95,
      digitalFilename: "maeum-fourcuts-digital.jpg",
      printFilename: "maeum-fourcuts-print-4up.jpg"
    }
  },

  capture: {
    count: 6,
    selectionCount: 4,
    countdownSeconds: 3,
    betweenShotsMs: 700,
    slotAspectRatioMode: "explicit",
    explicitSlotAspectRatio: 1.5,
    sensorRequestAspectRatio: 4 / 3,
    overscanHorizontal: 0.07,
    overscanVertical: 0.10
  },

  timeouts: {
    idleResetMs: 60000,
    completionResetMs: 45000,
    finalWarningSeconds: 10
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
      { id: 'cloud_emotion', label: '너우리 표정' },
      { id: 'cloud_costume', label: '너우리 코스튬' },
      { id: 'cloud_action', label: '너우리 응원' },
      { id: 'cloud_special', label: '너우리 스페셜' },
      { id: 'decorations', label: '러블리 데코' }
    ],
    items: [
      // 0. 이천시 정신건강복지센터 20주년 기념 스티커 (12종)
      { id: 'ic_01', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_01.png', label: '이천센터 20주년 황금엠블럼' },
      { id: 'ic_02', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_02.png', label: '함께한 20년 늘 곁에 리본' },
      { id: 'ic_03', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_03.png', label: '20주년 축하 2단 케이크' },
      { id: 'ic_04', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_04.png', label: '20th 축하해 고깔 너우리' },
      { id: 'ic_05', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_05.png', label: '20주년 최고 엄지척 너우리' },
      { id: 'ic_06', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_06.png', label: '20th 이천센터 골든 트로피' },
      { id: 'ic_07', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_07.png', label: '마음건강 20년 핑크 하트' },
      { id: 'ic_08', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_08.png', label: '20 숫자 하트풍선 너우리' },
      { id: 'ic_09', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_09.png', label: '20th 축하 파티 폭죽' },
      { id: 'ic_10', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_10.png', label: '꽃다발 & 20th 메달 너우리' },
      { id: 'ic_11', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_11.png', label: '20년 축하해요 손하트 너우리' },
      { id: 'ic_12', category: 'icheon_20th', type: 'image', value: '/stickers/icheon_20th_12.png', label: '20th 선물상자 너우리' },

      // 1. 마음 너우리 표정 (16종)
      { id: 'ce_01', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_01.png', label: '너우리 미소' },
      { id: 'ce_02', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_02.png', label: '너우리 하트눈' },
      { id: 'ce_03', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_03.png', label: '너우리 윙크' },
      { id: 'ce_04', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_04.png', label: '너우리 기쁨눈물' },
      { id: 'ce_05', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_05.png', label: '너우리 선글라스' },
      { id: 'ce_06', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_06.png', label: '너우리 수줍음' },
      { id: 'ce_07', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_07.png', label: '너우리 놀람' },
      { id: 'ce_08', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_08.png', label: '너우리 볼빵빵' },
      { id: 'ce_09', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_09.png', label: '너우리 눈웃음' },
      { id: 'ce_10', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_10.png', label: '너우리 수면모자' },
      { id: 'ce_11', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_11.png', label: '너우리 불타는열정' },
      { id: 'ce_12', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_12.png', label: '너우리 냠냠' },
      { id: 'ce_13', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_13.png', label: '너우리 갸우뚱' },
      { id: 'ce_14', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_14.png', label: '너우리 뽀뽀' },
      { id: 'ce_15', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_15.png', label: '너우리 대폭소' },
      { id: 'ce_16', category: 'cloud_emotion', type: 'image', value: '/stickers/cloud_emotion_16.png', label: '너우리 반짝이' },

      // 2. 마음 너우리 코스튬 (16종)
      { id: 'cc_01', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_01.png', label: '파티고깔 너우리' },
      { id: 'cc_02', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_02.png', label: '황금왕관 너우리' },
      { id: 'cc_03', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_03.png', label: '학사모 너우리' },
      { id: 'cc_04', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_04.png', label: '산타 너우리' },
      { id: 'cc_05', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_05.png', label: '의사 너우리' },
      { id: 'cc_06', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_06.png', label: '요리사 너우리' },
      { id: 'cc_07', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_07.png', label: '요리사 너우리' },
      { id: 'cc_08', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_08.png', label: '화가 너우리' },
      { id: 'cc_09', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_09.png', label: '운동선수 너우리' },
      { id: 'cc_10', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_10.png', label: 'DJ헤드폰 너우리' },
      { id: 'cc_11', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_11.png', label: '노랑우비 너우리' },
      { id: 'cc_12', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_12.png', label: '꽃화관 너우리' },
      { id: 'cc_13', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_13.png', label: '토끼귀 너우리' },
      { id: 'cc_14', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_14.png', label: '마술사 너우리' },
      { id: 'cc_15', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_15.png', label: '천사 너우리' },
      { id: 'cc_16', category: 'cloud_costume', type: 'image', value: '/stickers/cloud_costume_16.png', label: '포근담요 너우리' },

      // 3. 마음 너우리 응원 & 액션 (16종)
      { id: 'ca_01', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_01.png', label: '큰하트 너우리' },
      { id: 'ca_02', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_02.png', label: '최고야 너우리' },
      { id: 'ca_03', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_03.png', label: '더블브이 너우리' },
      { id: 'ca_04', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_04.png', label: '응원폼폼 너우리' },
      { id: 'ca_05', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_05.png', label: '네잎클로버 너우리' },
      { id: 'ca_06', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_06.png', label: '선물상자 너우리' },
      { id: 'ca_07', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_07.png', label: '카메라찰칵 너우리' },
      { id: 'ca_08', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_08.png', label: '따뜻한커피 너우리' },
      { id: 'ca_09', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_09.png', label: '마음편지 너우리' },
      { id: 'ca_10', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_10.png', label: '꽃다발 너우리' },
      { id: 'ca_11', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_11.png', label: '풍선둥둥 너우리' },
      { id: 'ca_12', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_12.png', label: '안녕손흔들기 너우리' },
      { id: 'ca_13', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_13.png', label: '마이크사회자 너우리' },
      { id: 'ca_14', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_14.png', label: '금메달 너우리' },
      { id: 'ca_15', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_15.png', label: '토닥토닥 너우리' },
      { id: 'ca_16', category: 'cloud_action', type: 'image', value: '/stickers/cloud_action_16.png', label: '하트날리기 너우리' },

      // 4. 마음 너우리 스페셜 (12종)
      { id: 'cs_01', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_01.png', label: '볼하트 너우리' },
      { id: 'cs_02', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_02.png', label: '스파클러 너우리' },
      { id: 'cs_03', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_03.png', label: '무지개라이딩 너우리' },
      { id: 'cs_04', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_04.png', label: '요정날개 너우리' },
      { id: 'cs_05', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_05.png', label: '팝콘냠냠 너우리' },
      { id: 'cs_06', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_06.png', label: '셀카봉 너우리' },
      { id: 'cs_07', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_07.png', label: '칭찬도장 너우리' },
      { id: 'cs_08', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_08.png', label: '힐링독서 너우리' },
      { id: 'cs_09', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_09.png', label: '우쿨렐레 너우리' },
      { id: 'cs_10', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_10.png', label: '클로버핀 너우리' },
      { id: 'cs_11', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_11.png', label: '반짝리본 너우리' },
      { id: 'cs_12', category: 'cloud_special', type: 'image', value: '/stickers/cloud_special_12.png', label: '쿨쿨꿀잠 너우리' },

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
  // Color Theme Frames for customization (Authentic Studio Presets)
  themes: {
    classic_light: {
      id: 'classic_light',
      name: '내추럴 크림',
      backgroundColor: '#FAF7F2',
      headerColor: '#1F1B24',
      footerColor: '#726A7C',
      borderColor: '#E8E1D7',
      swatch: '#FAF7F2'
    },
    chic_dark: {
      id: 'chic_dark',
      name: '모던 딥블랙',
      backgroundColor: '#110F14',
      headerColor: '#FFFFFF',
      footerColor: '#9892A2',
      borderColor: '#26222C',
      swatch: '#110F14'
    },
    brand_pink: {
      id: 'brand_pink',
      name: '마음 핑크',
      backgroundColor: '#FDECEF',
      headerColor: '#361520',
      footerColor: '#8C4D61',
      borderColor: '#F8D1DB',
      swatch: '#E85A7E'
    },
    soft_navy: {
      id: 'soft_navy',
      name: '클래식 네이비',
      backgroundColor: '#162238',
      headerColor: '#FFFFFF',
      footerColor: '#8DA4C4',
      borderColor: '#2B3D5B',
      swatch: '#162238'
    },
    sage_green: {
      id: 'sage_green',
      name: '세이지 그린',
      backgroundColor: '#EFF5F1',
      headerColor: '#1A3324',
      footerColor: '#587363',
      borderColor: '#D2E3D8',
      swatch: '#4A7A5D'
    },
    warm_butter: {
      id: 'warm_butter',
      name: '소프트 버터',
      backgroundColor: '#FFF8E7',
      headerColor: '#3A2E12',
      footerColor: '#8C7748',
      borderColor: '#F5E4B8',
      swatch: '#F2CD6B'
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

// Slot Aspect Ratio Derivation Helper (Canon SELPHY CP1200 Geometry)
window.deriveSlotAspectRatio = function (layout) {
  const p = layout || window.PHOTO_BOOTH_CONFIG?.printLayout;
  if (!p) return 4 / 3;
  const grid = p.grid || { columns: 2, rows: 2, verticalGutter: 12, horizontalGutter: 12, outerSafeMargin: 18 };
  const sheet = p.sheet || { width: 1200, height: 1776 };
  const card = p.card || { innerPadding: 18, photoGap: 8, headerRatio: 0.060, footerRatio: 0.075, photoCount: 4 };

  const masterCardWidth = (sheet.width - (grid.outerSafeMargin * 2) - ((grid.columns - 1) * grid.verticalGutter)) / grid.columns;
  const masterCardHeight = (sheet.height - (grid.outerSafeMargin * 2) - ((grid.rows - 1) * grid.horizontalGutter)) / grid.rows;

  const headerHeight = masterCardHeight * (card.headerRatio || 0.060);
  const footerHeight = masterCardHeight * (card.footerRatio || 0.075);
  const innerPadding = card.innerPadding || 18;
  const photoGap = card.photoGap || 8;
  const photoCount = card.photoCount || 4;

  const photoContentHeight = masterCardHeight - headerHeight - footerHeight - (innerPadding * 2) - ((photoCount - 1) * photoGap);
  const photoSlotHeight = photoContentHeight / photoCount;
  const photoSlotWidth = masterCardWidth - (innerPadding * 2);

  return photoSlotWidth / photoSlotHeight;
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

  // FAST-LANE Validation
  if (cfg.eventMode) {
    const validModes = ['fast-lane', 'standard'];
    if (!validModes.includes(cfg.eventMode.mode)) {
      errors.push('eventMode.mode must be "fast-lane" or "standard"');
    }
    const wf = cfg.eventMode.workflow;
    if (!wf || typeof wf.captureCount !== 'number' || wf.captureCount < 4) {
      errors.push('eventMode.workflow.captureCount must be a number >= 4');
    }
    if (!wf || typeof wf.selectionCount !== 'number' || wf.selectionCount !== 4) {
      errors.push('eventMode.workflow.selectionCount must be 4');
    }
  }

  // Frames validation
  if (cfg.frames) {
    if (!cfg.frames.defaultId) errors.push('frames.defaultId is required');
    if (!Array.isArray(cfg.frames.presets) || cfg.frames.presets.length === 0) {
      errors.push('frames.presets must be a non-empty array');
    } else {
      const hasBlack = cfg.frames.presets.some((f) => f.id === 'event-black');
      if (!hasBlack) errors.push('frames.presets must contain "event-black"');
    }
  }

  // Fixed Stickers validation
  if (cfg.fixedStickerPresets) {
    if (!cfg.fixedStickerPresets.defaultId) errors.push('fixedStickerPresets.defaultId is required');
    if (!Array.isArray(cfg.fixedStickerPresets.presets) || cfg.fixedStickerPresets.presets.length === 0) {
      errors.push('fixedStickerPresets.presets must be a non-empty array');
    } else {
      const hasDeco = cfg.fixedStickerPresets.presets.some((s) => s.id === 'event-fixed-decoration');
      if (!hasDeco) errors.push('fixedStickerPresets.presets must contain "event-fixed-decoration"');
    }
  }

  // Print layout validation
  if (cfg.printLayout) {
    const pl = cfg.printLayout;
    if (!pl.sheet?.width || !pl.sheet?.height) errors.push('printLayout.sheet dimensions required');
    if (pl.sheet?.width !== 1200 || pl.sheet?.height !== 1776) {
      errors.push('printLayout.sheet must be 1200x1776 for Canon SELPHY CP1200 postcard profile');
    }
    if (pl.grid?.columns !== 2 || pl.grid?.rows !== 2) {
      errors.push('printLayout.grid must be 2x2 for 4-up postcard');
    }
    if (pl.card?.copies !== 4 || pl.card?.photoCount !== 4) {
      errors.push('printLayout.card must define 4 copies of 4 photos');
    }
  }

  return { valid: errors.length === 0, errors };
};
