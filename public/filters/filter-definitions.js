/**
 * 마음 네컷 포토부스 - First-Party Filter Catalog & Parameter Model
 * 39 Original Presets across 7 Categories (Recommended, Natural, Bright, Warm, Cool, Film, Monochrome)
 * Includes parameter interpolation, bounds checking, and live CSS filter approximation.
 */
(() => {
  'use strict';

  const DEFAULT_PARAMETERS = Object.freeze({
    exposure: 0.0,
    brightness: 0.0,
    contrast: 0.0,
    saturation: 0.0,

    temperature: 0.0,
    tint: 0.0,

    highlights: 0.0,
    shadows: 0.0,
    whites: 0.0,
    blacks: 0.0,

    fade: 0.0,
    grayscale: 0.0,
    sepia: 0.0,

    redMultiplier: 1.0,
    greenMultiplier: 1.0,
    blueMultiplier: 1.0,

    sharpen: 0.0,
    softness: 0.0,
    grain: 0.0,
    vignette: 0.0
  });

  const DEFAULT_ADJUSTMENTS = Object.freeze({
    exposure: 0.0,
    brightness: 0.0,
    contrast: 0.0,
    saturation: 0.0,
    temperature: 0.0,
    tint: 0.0
  });

  const PARAMETER_BOUNDS = Object.freeze({
    exposure: [-1.0, 1.0],
    brightness: [-1.0, 1.0],
    contrast: [-1.0, 1.0],
    saturation: [-1.0, 1.0],
    temperature: [-1.0, 1.0],
    tint: [-1.0, 1.0],
    highlights: [-1.0, 1.0],
    shadows: [-1.0, 1.0],
    whites: [-1.0, 1.0],
    blacks: [-1.0, 1.0],
    fade: [0.0, 1.0],
    grayscale: [0.0, 1.0],
    sepia: [0.0, 1.0],
    redMultiplier: [0.0, 2.0],
    greenMultiplier: [0.0, 2.0],
    blueMultiplier: [0.0, 2.0],
    sharpen: [0.0, 1.0],
    softness: [0.0, 1.0],
    grain: [0.0, 1.0],
    vignette: [0.0, 1.0]
  });

  const MANUAL_ADJUSTMENT_BOUNDS = Object.freeze({
    exposure: [-0.20, 0.20],
    brightness: [-0.20, 0.20],
    contrast: [-0.20, 0.20],
    saturation: [-0.30, 0.30],
    temperature: [-0.20, 0.20],
    tint: [-0.15, 0.15]
  });

  const FILTER_CATEGORIES = Object.freeze([
    { id: 'recommended', label: '추천 필터', desc: '이천시 20주년 베스트 포토부스 셀렉션' },
    { id: 'natural', label: '내추럴', desc: '피부결을 살린 자연스럽고 투명한 톤' },
    { id: 'bright', label: '밝은 톤', desc: '화사하고 생기 있는 부드러운 하이라이트' },
    { id: 'warm', label: '따뜻한', desc: '포근하고 아늑한 골든 앰버 톤' },
    { id: 'cool', label: '쿨톤', desc: '맑고 청량한 블루 & 라벤더 뉘앙스' },
    { id: 'film', label: '필름', desc: '아날로그 은염 감성의 은은한 입자와 페이드' },
    { id: 'monochrome', label: '흑백', desc: '깊이 있는 흑백 톤과 클래식 누아르' }
  ]);

  /**
   * Helper to build a clean preset object with parameter defaults
   */
  function makePreset(def) {
    const params = { ...DEFAULT_PARAMETERS, ...(def.parameters || {}) };
    return {
      id: def.id,
      name: def.label,
      label: def.label,
      category: def.category,
      description: def.description || '',
      previewPriority: def.previewPriority || 10,
      parameters: params,
      ...params,
      curves: {
        rgb: def.curves?.rgb || null,
        red: def.curves?.red || null,
        green: def.curves?.green || null,
        blue: def.curves?.blue || null
      },
      lut: def.lut || null
    };
  }

  /**
   * 39 Curated, Restrained First-Party Presets
   */
  const RAW_PRESETS = [
    // -------------------------------------------------------------
    // 1. RECOMMENDED (8 REQUIRED PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'original',
      label: '원본',
      category: 'recommended',
      description: '보정 없는 순수한 촬영 원본',
      previewPriority: 1,
      parameters: {}
    }),
    makePreset({
      id: 'maeum-warm',
      label: '마음 온기',
      category: 'recommended',
      description: '따스한 미소와 은은한 온기를 더하는 시그니처 톤',
      previewPriority: 2,
      parameters: {
        brightness: 0.04,
        contrast: 0.03,
        saturation: 0.05,
        temperature: 0.08,
        tint: 0.02,
        highlights: -0.04,
        shadows: 0.06,
        redMultiplier: 1.03,
        greenMultiplier: 1.01,
        blueMultiplier: 0.97,
        softness: 0.04
      },
      curves: {
        rgb: [[0, 0], [64, 68], [192, 194], [255, 255]]
      }
    }),
    makePreset({
      id: 'clear-today',
      label: '맑은 오늘',
      category: 'recommended',
      description: '투명하고 청명한 하늘빛의 깔끔한 스튜디오 톤',
      previewPriority: 3,
      parameters: {
        brightness: 0.06,
        contrast: 0.06,
        saturation: 0.02,
        temperature: -0.05,
        whites: 0.04,
        blacks: -0.02,
        redMultiplier: 0.98,
        greenMultiplier: 1.01,
        blueMultiplier: 1.04,
        sharpen: 0.05
      }
    }),
    makePreset({
      id: 'bright-smile',
      label: '화사한 미소',
      category: 'recommended',
      description: '피부를 맑고 화사하게 밝혀주는 뷰티 감성 톤',
      previewPriority: 4,
      parameters: {
        exposure: 0.05,
        brightness: 0.08,
        contrast: -0.03,
        saturation: 0.04,
        temperature: 0.03,
        tint: 0.03,
        highlights: -0.05,
        shadows: 0.10,
        softness: 0.08
      },
      curves: {
        rgb: [[0, 0], [48, 56], [128, 138], [255, 255]]
      }
    }),
    makePreset({
      id: 'peach-day',
      label: '복숭아빛 하루',
      category: 'recommended',
      description: '수줍은 복숭아빛 생기와 은은한 핑크 파스텔 무드',
      previewPriority: 5,
      parameters: {
        brightness: 0.05,
        contrast: 0.02,
        saturation: 0.08,
        temperature: 0.04,
        tint: 0.06,
        redMultiplier: 1.05,
        greenMultiplier: 0.99,
        blueMultiplier: 0.98,
        softness: 0.05
      }
    }),
    makePreset({
      id: 'soft-film',
      label: '소프트 필름',
      category: 'recommended',
      description: '부드러운 블랙 페이드와 미세한 입자의 아날로그 감성',
      previewPriority: 6,
      parameters: {
        brightness: 0.02,
        contrast: -0.04,
        saturation: -0.05,
        temperature: 0.04,
        fade: 0.10,
        grain: 0.12,
        vignette: 0.10
      },
      curves: {
        rgb: [[0, 18], [60, 68], [195, 192], [255, 248]]
      }
    }),
    makePreset({
      id: 'clean-mono',
      label: '깨끗한 흑백',
      category: 'recommended',
      description: '군더더기 없이 선명하고 단정한 스튜디오 모노크롬',
      previewPriority: 7,
      parameters: {
        grayscale: 1.0,
        brightness: 0.02,
        contrast: 0.10,
        whites: 0.04,
        blacks: -0.04,
        sharpen: 0.06
      },
      curves: {
        rgb: [[0, 0], [60, 52], [195, 204], [255, 255]]
      }
    }),
    makePreset({
      id: 'fresh-moment',
      label: '청량한 순간',
      category: 'recommended',
      description: '산뜻하고 경쾌한 민트 & 스카이블루의 생동감',
      previewPriority: 8,
      parameters: {
        exposure: 0.03,
        brightness: 0.04,
        contrast: 0.05,
        saturation: 0.06,
        temperature: -0.07,
        tint: -0.02,
        redMultiplier: 0.97,
        greenMultiplier: 1.03,
        blueMultiplier: 1.05
      }
    }),

    // -------------------------------------------------------------
    // 2. NATURAL (5 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'nat-daylight',
      label: '자연광',
      category: 'natural',
      description: '창가로 은은하게 비치는 자연스러운 주광빛',
      parameters: { brightness: 0.03, contrast: 0.02, saturation: 0.03, temperature: 0.02 }
    }),
    makePreset({
      id: 'nat-pure',
      label: '깨끗하게',
      category: 'natural',
      description: '잡티 없이 맑고 단정한 내추럴 클린 룩',
      parameters: { exposure: 0.04, contrast: 0.03, saturation: -0.02, highlights: -0.03, shadows: 0.05, sharpen: 0.04 }
    }),
    makePreset({
      id: 'nat-calm',
      label: '차분하게',
      category: 'natural',
      description: '채도를 살짝 덜어내 마음을 편안하게 해주는 톤',
      parameters: { contrast: -0.03, saturation: -0.10, fade: 0.05, shadows: 0.04 }
    }),
    makePreset({
      id: 'nat-vivid',
      label: '선명하게',
      category: 'natural',
      description: '또렷한 눈빛과 의상 색감을 살려주는 세련된 콘트라스트',
      parameters: { contrast: 0.09, saturation: 0.08, whites: 0.03, blacks: -0.03, sharpen: 0.08 }
    }),
    makePreset({
      id: 'nat-simple',
      label: '담백하게',
      category: 'natural',
      description: '기교 없이 본연의 인물 매력을 그대로 전하는 톤',
      parameters: { brightness: 0.01, contrast: 0.01, temperature: 0.01 }
    }),

    // -------------------------------------------------------------
    // 3. BRIGHT (5 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'brt-sunlight',
      label: '햇살',
      category: 'bright',
      description: '눈부신 정오의 양지바른 햇살을 머금은 하이키 톤',
      parameters: { exposure: 0.08, brightness: 0.06, contrast: -0.02, saturation: 0.04, temperature: 0.03, whites: 0.05 }
    }),
    makePreset({
      id: 'brt-cream',
      label: '크림',
      category: 'bright',
      description: '부드러운 크림 한 스푼을 얹은 듯 포근한 화이트',
      parameters: { exposure: 0.05, brightness: 0.07, contrast: -0.04, saturation: 0.02, temperature: 0.04, softness: 0.06 }
    }),
    makePreset({
      id: 'brt-pastel',
      label: '파스텔',
      category: 'bright',
      description: '솜사탕처럼 가볍고 몽환적인 파스텔 소프트 톤',
      parameters: { brightness: 0.06, contrast: -0.06, saturation: 0.09, tint: 0.03, fade: 0.08, softness: 0.08 }
    }),
    makePreset({
      id: 'brt-lively',
      label: '생기',
      category: 'bright',
      description: '발그레한 볼과 웃음을 한층 돋보이게 하는 바이탈 톤',
      parameters: { brightness: 0.05, contrast: 0.04, saturation: 0.12, tint: 0.04, redMultiplier: 1.04 }
    }),
    makePreset({
      id: 'brt-spring',
      label: '봄날',
      category: 'bright',
      description: '새봄의 설렘처럼 화사하고 은은한 꽃잎 무드',
      parameters: { exposure: 0.06, brightness: 0.05, contrast: 0.01, saturation: 0.07, temperature: 0.02, tint: 0.05 }
    }),

    // -------------------------------------------------------------
    // 4. WARM (5 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'wrm-memory',
      label: '포근한 기억',
      category: 'warm',
      description: '오래된 서랍 속 따뜻한 사진첩을 꺼내보는 감성',
      parameters: { brightness: 0.03, contrast: -0.02, saturation: 0.05, temperature: 0.11, tint: 0.02, sepia: 0.08 }
    }),
    makePreset({
      id: 'wrm-golden',
      label: '골든아워',
      category: 'warm',
      description: '해질녘 부드러운 황금빛 노을이 깃든 시네마틱 웜톤',
      parameters: { brightness: 0.03, contrast: 0.05, saturation: 0.08, temperature: 0.14, redMultiplier: 1.05, blueMultiplier: 0.94 }
    }),
    makePreset({
      id: 'wrm-cafe',
      label: '카페 무드',
      category: 'warm',
      description: '은은한 조명 아래 드립 커피 향이 맴도는 아늑한 분위기',
      parameters: { contrast: 0.03, saturation: -0.02, temperature: 0.09, fade: 0.06, shadows: 0.05 }
    }),
    makePreset({
      id: 'wrm-sunset',
      label: '노을',
      category: 'warm',
      description: '붉게 물드는 저녁 하늘의 로맨틱한 오렌지빛 뉘앙스',
      parameters: { brightness: 0.02, contrast: 0.06, saturation: 0.10, temperature: 0.12, tint: 0.05, redMultiplier: 1.06 }
    }),
    makePreset({
      id: 'wrm-autumn',
      label: '가을빛',
      category: 'warm',
      description: '바스락거리는 낙엽 길처럼 깊고 짙은 앰버 브라운',
      parameters: { contrast: 0.05, saturation: 0.04, temperature: 0.10, sepia: 0.10, blacks: -0.03 }
    }),

    // -------------------------------------------------------------
    // 5. COOL (5 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'col-crisp',
      label: '청량한 하루',
      category: 'cool',
      description: '탄산수처럼 톡 쏘는 청량감과 투명한 블루 톤',
      parameters: { brightness: 0.04, contrast: 0.05, saturation: 0.03, temperature: -0.10, blueMultiplier: 1.06 }
    }),
    makePreset({
      id: 'col-dawn',
      label: '새벽',
      category: 'cool',
      description: '고요한 새벽 공기처럼 차분하고 몽환적인 딥 쿨톤',
      parameters: { brightness: -0.02, contrast: 0.02, saturation: -0.06, temperature: -0.12, tint: 0.03, shadows: 0.04 }
    }),
    makePreset({
      id: 'col-lavender',
      label: '라벤더',
      category: 'cool',
      description: '보랏빛 라벤더 꽃밭을 연상시키는 유니크한 파스텔 쿨',
      parameters: { brightness: 0.04, contrast: 0.02, saturation: 0.06, temperature: -0.06, tint: 0.08, blueMultiplier: 1.04 }
    }),
    makePreset({
      id: 'col-coolwhite',
      label: '쿨화이트',
      category: 'cool',
      description: '티없이 맑은 설경처럼 서늘하고 단정한 미니멀 화이트',
      parameters: { exposure: 0.05, brightness: 0.05, contrast: 0.04, temperature: -0.08, whites: 0.06, blacks: -0.02 }
    }),
    makePreset({
      id: 'col-winter',
      label: '겨울빛',
      category: 'cool',
      description: '겨울 창가에 맺힌 서리꽃처럼 투명하고 맑은 감성',
      parameters: { brightness: 0.03, contrast: -0.01, saturation: -0.04, temperature: -0.11, fade: 0.04, sharpen: 0.05 }
    }),

    // -------------------------------------------------------------
    // 6. FILM (6 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'flm-classic',
      label: '클래식 필름',
      category: 'film',
      description: '정통 35mm 컬러 네거티브 필름의 풍부한 발색',
      parameters: { contrast: 0.06, saturation: 0.05, temperature: 0.04, fade: 0.07, grain: 0.14, vignette: 0.12 },
      curves: { rgb: [[0, 14], [55, 62], [195, 196], [255, 248]] }
    }),
    makePreset({
      id: 'flm-vintage',
      label: '빈티지',
      category: 'film',
      description: '시간이 멈춘 듯 바랜 색감과 아늑한 레트로 입자',
      parameters: { brightness: 0.02, contrast: -0.04, saturation: -0.08, temperature: 0.07, sepia: 0.12, fade: 0.12, grain: 0.16 }
    }),
    makePreset({
      id: 'flm-retro',
      label: '레트로',
      category: 'film',
      description: '90년대 하이틴 앨범처럼 톡톡 튀는 레트로 컬러',
      parameters: { contrast: 0.08, saturation: 0.10, temperature: 0.05, tint: -0.03, grain: 0.10, vignette: 0.15 }
    }),
    makePreset({
      id: 'flm-cinema',
      label: '시네마',
      category: 'film',
      description: '영화 속 한 장면처럼 드라마틱한 틸 & 오렌지 뉘앙스',
      parameters: { contrast: 0.09, saturation: 0.04, temperature: 0.05, redMultiplier: 1.04, greenMultiplier: 0.98, blueMultiplier: 1.02, vignette: 0.18 },
      curves: { rgb: [[0, 8], [65, 60], [190, 200], [255, 252]] }
    }),
    makePreset({
      id: 'flm-matte',
      label: '무광',
      category: 'film',
      description: '번들거림 없는 고급 무광 인화지(Matte Paper) 질감',
      parameters: { brightness: 0.02, contrast: -0.06, saturation: -0.03, fade: 0.15, whites: -0.04, grain: 0.08 }
    }),
    makePreset({
      id: 'flm-print',
      label: '인화사진',
      category: 'film',
      description: '암실에서 갓 건져 올린 아날로그 은염 인화사진',
      parameters: { contrast: 0.07, saturation: 0.03, temperature: 0.03, fade: 0.06, grain: 0.15, vignette: 0.14 }
    }),

    // -------------------------------------------------------------
    // 7. MONOCHROME (5 PRESETS)
    // -------------------------------------------------------------
    makePreset({
      id: 'mono-gentle',
      label: '잔잔한 흑백',
      category: 'monochrome',
      description: '부드러운 중간 톤이 살아있는 차분하고 고요한 흑백',
      parameters: { grayscale: 1.0, contrast: -0.04, brightness: 0.02, shadows: 0.06, fade: 0.05 }
    }),
    makePreset({
      id: 'mono-contrast',
      label: '대비 흑백',
      category: 'monochrome',
      description: '깊은 블랙과 명확한 하이라이트의 강렬한 흑백 대비',
      parameters: { grayscale: 1.0, contrast: 0.18, whites: 0.06, blacks: -0.06, sharpen: 0.08 },
      curves: { rgb: [[0, 0], [70, 50], [185, 205], [255, 255]] }
    }),
    makePreset({
      id: 'mono-silver',
      label: '실버',
      category: 'monochrome',
      description: '은빛 금속처럼 세련되고 투명한 하이키 실버 모노',
      parameters: { grayscale: 1.0, exposure: 0.06, brightness: 0.05, contrast: 0.08, whites: 0.08, sharpen: 0.06 }
    }),
    makePreset({
      id: 'mono-sepia',
      label: '세피아',
      category: 'monochrome',
      description: '따뜻한 갈색조가 은은하게 스며든 빈티지 브라운 모노',
      parameters: { grayscale: 1.0, sepia: 0.35, temperature: 0.08, contrast: 0.04, fade: 0.08, grain: 0.12 }
    }),
    makePreset({
      id: 'mono-noir',
      label: '누아르',
      category: 'monochrome',
      description: '묵직한 그림자와 짙은 분위기의 클래식 필름 누아르',
      parameters: { grayscale: 1.0, contrast: 0.14, brightness: -0.03, blacks: -0.08, vignette: 0.25, grain: 0.14 }
    })
  ];

  /**
   * Validate a single preset definition against schema and numeric bounds.
   * @param {object} preset
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validatePreset(preset) {
    const errors = [];
    if (!preset || typeof preset !== 'object') {
      return { valid: false, errors: ['Preset must be an object'] };
    }
    if (!preset.id || typeof preset.id !== 'string') errors.push('Missing or invalid id');
    if (!preset.label || typeof preset.label !== 'string') errors.push('Missing or invalid label');
    if (!preset.category || typeof preset.category !== 'string') errors.push('Missing or invalid category');

    const params = preset.parameters;
    if (!params || typeof params !== 'object') {
      errors.push('Missing parameters object');
    } else {
      for (const [key, [min, max]] of Object.entries(PARAMETER_BOUNDS)) {
        const val = params[key];
        if (typeof val !== 'undefined') {
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            errors.push(`Parameter ${key} must be a finite number`);
          } else if (val < min || val > max) {
            errors.push(`Parameter ${key} value ${val} out of range [${min}, ${max}]`);
          }
        }
      }
    }

    if (preset.curves && typeof preset.curves === 'object') {
      for (const ch of ['rgb', 'red', 'green', 'blue']) {
        const pts = preset.curves[ch];
        if (pts !== null && typeof pts !== 'undefined') {
          if (!Array.isArray(pts)) {
            errors.push(`Curve ${ch} must be an array of points or null`);
          } else {
            for (const pt of pts) {
              if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
                errors.push(`Curve ${ch} contains invalid control point: ${JSON.stringify(pt)}`);
              }
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validated catalog array with uniqueness and fallback safety.
   */
  function buildValidatedCatalog(rawList) {
    const seenIds = new Set();
    const validated = [];

    for (const item of rawList) {
      const v = validatePreset(item);
      if (!v.valid) {
        console.warn(`[FilterPlatform] Preset "${item?.id}" rejected:`, v.errors);
        continue;
      }
      if (seenIds.has(item.id)) {
        console.warn(`[FilterPlatform] Duplicate preset id "${item.id}" rejected`);
        continue;
      }
      seenIds.add(item.id);
      validated.push(Object.freeze(item));
    }

    // Ensure 'original' preset always exists
    if (!seenIds.has('original')) {
      validated.unshift(Object.freeze(makePreset({
        id: 'original',
        label: '원본',
        category: 'recommended',
        description: '보정 없는 순수한 원본',
        previewPriority: 1
      })));
    }

    return Object.freeze(validated);
  }

  const PRESETS = buildValidatedCatalog(RAW_PRESETS);
  const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

  function getPreset(id) {
    return PRESET_MAP.get(id) || PRESET_MAP.get('original');
  }

  /**
   * Interpolate preset parameters with neutral defaults based on intensity (0..100)
   * and apply manual adjustments.
   * At intensity 0.0, output matches neutral defaults + manual adjustments.
   * @param {object} preset
   * @param {number} intensity - 0 to 100
   * @param {object} [manualAdjustments]
   * @returns {object} effective clamped parameters
   */
  function interpolateParameters(preset, intensity, manualAdjustments = {}) {
    const rawIntensity = intensity ?? 100;
    const factor = (typeof rawIntensity === 'number' && rawIntensity <= 1.0)
      ? Math.max(0.0, Math.min(1.0, rawIntensity))
      : Math.max(0.0, Math.min(1.0, rawIntensity / 100));

    const p = preset?.parameters || preset || DEFAULT_PARAMETERS;
    const adj = { ...DEFAULT_ADJUSTMENTS, ...(manualAdjustments || {}) };

    const effective = {};
    for (const key of Object.keys(DEFAULT_PARAMETERS)) {
      const defaultVal = DEFAULT_PARAMETERS[key];
      const presetVal = typeof p[key] === 'number' ? p[key] : defaultVal;

      // Linear interpolation from default toward preset
      let val = defaultVal + (presetVal - defaultVal) * factor;

      // Add manual adjustments if applicable
      if (key in adj && typeof adj[key] === 'number') {
        const [minAdj, maxAdj] = MANUAL_ADJUSTMENT_BOUNDS[key] || [-1, 1];
        const clampedAdj = Math.max(minAdj, Math.min(maxAdj, adj[key]));
        val += clampedAdj;
      }

      // Clamp to global parameter bounds
      const [minB, maxB] = PARAMETER_BOUNDS[key];
      effective[key] = Math.max(minB, Math.min(maxB, val));
    }

    effective.curves = preset?.curves || null;
    effective.lut = preset?.lut || null;

    return effective;
  }

  /**
   * Fast CSS filter string approximation for live camera video.
   * Inexpensive for mobile iPad Safari GPU.
   * @param {object} preset
   * @param {number} intensity - 0 to 100
   * @returns {string} CSS filter expression
   */
  function generateLiveCSSFilter(preset, intensity = 100) {
    if (!preset || preset.id === 'original' || intensity <= 0) {
      return 'none';
    }

    const factor = Math.max(0, Math.min(1, intensity / 100));
    const p = preset.parameters || DEFAULT_PARAMETERS;

    // Approximations
    const brightness = 1 + (p.brightness + p.exposure * 0.5) * factor;
    const contrast = 1 + p.contrast * factor;
    const saturate = Math.max(0, 1 + p.saturation * factor);
    const grayscale = Math.max(0, Math.min(1, p.grayscale * factor));
    const sepia = Math.max(0, Math.min(1, p.sepia * factor));

    // Subtle hue rotate for temperature/tint in CSS
    const hueDeg = (p.tint * 20 - p.temperature * 15) * factor;

    const parts = [];
    if (Math.abs(brightness - 1) > 0.005) parts.push(`brightness(${brightness.toFixed(3)})`);
    if (Math.abs(contrast - 1) > 0.005) parts.push(`contrast(${contrast.toFixed(3)})`);
    if (Math.abs(saturate - 1) > 0.005) parts.push(`saturate(${saturate.toFixed(3)})`);
    if (grayscale > 0.005) parts.push(`grayscale(${grayscale.toFixed(3)})`);
    if (sepia > 0.005) parts.push(`sepia(${sepia.toFixed(3)})`);
    if (Math.abs(hueDeg) > 0.5) parts.push(`hue-rotate(${hueDeg.toFixed(1)}deg)`);

    return parts.length > 0 ? parts.join(' ') : 'none';
  }

  const RECOMMENDED_FILTERS = Object.freeze([
    'original', 'maeum-warm', 'clear-today', 'bright-smile',
    'peach-day', 'soft-film', 'clean-mono', 'fresh-moment'
  ]);

  const FilterDefinitions = {
    DEFAULT_PARAMETERS,
    DEFAULT_ADJUSTMENTS,
    PARAMETER_BOUNDS,
    MANUAL_ADJUSTMENT_BOUNDS,
    FILTER_CATEGORIES,
    RECOMMENDED_FILTERS,
    PRESETS,
    FILTER_PRESETS: PRESETS,
    PRESET_MAP,
    getPreset,
    getFilterPreset: getPreset,
    validatePreset,
    interpolateParameters,
    generateLiveCSSFilter
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterDefinitions;
  }
  if (typeof window !== 'undefined') {
    window.FilterDefinitions = FilterDefinitions;
  }
  if (typeof self !== 'undefined') {
    self.FilterDefinitions = FilterDefinitions;
  }
})();
