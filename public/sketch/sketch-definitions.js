/**
 * sketch-definitions.js
 * 8 Original Group Sketch & Paper Illustration Presets
 * Deterministic Non-AI Group Color Sketch Platform
 */
(function(exports) {
  'use strict';

  // Configured default matte sky-blue backdrop
  var DEFAULT_BACKDROP_HEX = '#8FCFE3';
  var DEFAULT_BACKDROP_RGB = [143, 207, 227]; // 8FCFE3 in 0..255

  // 8 Presets meeting Section 25 requirements
  var SKETCH_PRESETS = [
    {
      id: 'group-color-sketch',
      name: '그룹 컬러 스케치',
      label: '그룹 컬러 스케치',
      category: 'sketch',
      description: '선명한 연필 잉크 라인과 자연스러운 종이 수채 색감',
      lineStrength: 0.85,
      colorStrength: 0.80,
      paperStrength: 0.45,
      backgroundWashStrength: 0.25,
      inkColor: [54, 49, 48], // rgb(54, 49, 48)
      paletteSize: 28,
      dryBrushRadius: 2,
      edgeWeights: { fine: 0.20, medium: 0.45, coarse: 0.35 },
      paperTint: [247, 242, 230] // #F7F2E6
    },
    {
      id: 'group-watercolor',
      name: '그룹 수채화',
      label: '그룹 수채화',
      category: 'sketch',
      description: '부드러운 물감 번짐과 감성적인 수채화 일러스트',
      lineStrength: 0.65,
      colorStrength: 0.75,
      paperStrength: 0.60,
      backgroundWashStrength: 0.45,
      inkColor: [62, 54, 52],
      paletteSize: 28,
      dryBrushRadius: 3,
      edgeWeights: { fine: 0.15, medium: 0.40, coarse: 0.45 },
      paperTint: [248, 243, 232]
    },
    {
      id: 'group-ink-wash',
      name: '그룹 잉크 드로잉',
      label: '그룹 잉크 드로잉',
      category: 'sketch',
      description: '또렷하고 힘 있는 잉크 펜 터치와 미니멀한 명암',
      lineStrength: 0.95,
      colorStrength: 0.55,
      paperStrength: 0.50,
      backgroundWashStrength: 0.15,
      inkColor: [36, 32, 30],
      paletteSize: 20,
      dryBrushRadius: 1,
      edgeWeights: { fine: 0.30, medium: 0.45, coarse: 0.25 },
      paperTint: [246, 241, 231]
    },
    {
      id: 'group-pencil-color',
      name: '그룹 컬러 연필',
      label: '그룹 컬러 연필',
      category: 'sketch',
      description: '색연필의 따뜻한 사각사각 질감과 정교한 인물 스케치',
      lineStrength: 0.80,
      colorStrength: 0.70,
      paperStrength: 0.55,
      backgroundWashStrength: 0.20,
      inkColor: [70, 58, 52],
      paletteSize: 24,
      dryBrushRadius: 2,
      edgeWeights: { fine: 0.35, medium: 0.40, coarse: 0.25 },
      paperTint: [249, 245, 235]
    },
    {
      id: 'group-poster-sketch',
      name: '선명한 그룹 드로잉',
      label: '선명한 그룹 드로잉',
      category: 'sketch',
      description: '포스터 일러스트처럼 강렬한 실루엣과 또렷한 원색',
      lineStrength: 0.92,
      colorStrength: 0.95,
      paperStrength: 0.25,
      backgroundWashStrength: 0.10,
      inkColor: [40, 36, 36],
      paletteSize: 20,
      dryBrushRadius: 1,
      edgeWeights: { fine: 0.18, medium: 0.48, coarse: 0.34 },
      paperTint: [250, 248, 242]
    },
    {
      id: 'group-soft-pastel',
      name: '부드러운 그룹 파스텔',
      label: '부드러운 그룹 파스텔',
      category: 'sketch',
      description: '파스텔로 빚어낸 듯 몽환적이고 부드러운 단체화',
      lineStrength: 0.55,
      colorStrength: 0.72,
      paperStrength: 0.65,
      backgroundWashStrength: 0.35,
      inkColor: [82, 70, 68],
      paletteSize: 26,
      dryBrushRadius: 3,
      edgeWeights: { fine: 0.12, medium: 0.38, coarse: 0.50 },
      paperTint: [251, 246, 238]
    },
    {
      id: 'group-paper-memory',
      name: '종이 위의 우리',
      label: '종이 위의 우리',
      category: 'sketch',
      description: '오래 간직하고픈 한지 위의 따스한 추억 스케치',
      lineStrength: 0.78,
      colorStrength: 0.65,
      paperStrength: 0.75,
      backgroundWashStrength: 0.30,
      inkColor: [58, 48, 44],
      paletteSize: 24,
      dryBrushRadius: 2,
      edgeWeights: { fine: 0.22, medium: 0.43, coarse: 0.35 },
      paperTint: [244, 237, 222]
    },
    {
      id: 'group-travel-card',
      name: '그룹 여행 엽서',
      label: '그룹 여행 엽서',
      category: 'sketch',
      description: '여행지에서 보낸 손그림 엽서 같은 화사하고 경쾌한 드로잉',
      lineStrength: 0.88,
      colorStrength: 0.88,
      paperStrength: 0.40,
      backgroundWashStrength: 0.35,
      inkColor: [48, 42, 44],
      paletteSize: 30,
      dryBrushRadius: 2,
      edgeWeights: { fine: 0.25, medium: 0.45, coarse: 0.30 },
      paperTint: [252, 250, 245]
    }
  ];

  var DEFAULT_THRESHOLDS = {
    majorAreaRatio: 0.010,
    mediumAreaRatio: 0.003,
    smallCandidateAreaRatio: 0.0006,
    noiseAreaRatio: 0.0003,
    envelopeExpansionX: 0.08,
    envelopeExpansionY: 0.06,
    maxFeatherPx1200: 6,
    morphologyClosePx1200: 2,
    morphologyOpenPx1200: 1,
    morphologyDilationPx1200: 2
  };

  function getSketchPreset(id) {
    if (!id) return SKETCH_PRESETS[0];
    for (var i = 0; i < SKETCH_PRESETS.length; i++) {
      if (SKETCH_PRESETS[i].id === id) return SKETCH_PRESETS[i];
    }
    return SKETCH_PRESETS[0];
  }

  exports.DEFAULT_BACKDROP_HEX = DEFAULT_BACKDROP_HEX;
  exports.DEFAULT_BACKDROP_RGB = DEFAULT_BACKDROP_RGB;
  exports.SKETCH_PRESETS = SKETCH_PRESETS;
  exports.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;
  exports.getSketchPreset = getSketchPreset;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.SketchDefinitions = {}));
