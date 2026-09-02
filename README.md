# 마음 네컷 포토부스 Secure v4.5

iPad Safari용 Vanilla JS + Canvas 포토부스이며, Express 기반 Vercel Function, Supabase private Storage, Postgres 만료 레코드, Upstash Redis 기반 분산 rate limit과 잠금을 사용합니다.

## 주요 기능 & 신규 개선 (v4.5)

- **관리자 모드 (Admin Dashboard)**: `/admin` 또는 키오스크 시작화면 로고 롱프레스(3초)로 진입 가능.
  - 기본 테마 및 특별 커스텀 배경 이미지 업로드/관리
  - 부스 명칭, 메인 타이틀, 하단 응원 문구, 안내 문구 실시간 변경
  - 기본 레이아웃(2x2 사각 vs 1x4 세로 롱스트립), 카운트다운 초, 컷수, 스티커 세트 커스텀
  - 실시간 세션/스토리지 통계 모니터링 및 만료 데이터 수동 클린업 즉시 실행
- **다채로운 7종 감성 테마 & 커스텀 배경 시스템**:
  1. 💜 **마음 힐링 라벤더**: 시그니처 파스텔 라벤더 & 하트 데코
  2. 🌊 **청량 오션 & 스카이**: 푸른 바다와 하늘 감성의 블루 웨이브
  3. 🌅 **로맨틱 선셋**: 노을빛 골드-코랄 핑크와 스파클
  4. 🌌 **미드나잇 스타라이트**: 은하수와 밤하늘 별빛
  5. 🎞️ **빈티지 아날로그 필름**: 폴라로이드 감성 & 타임스탬프
  6. 🎉 **해피 페스티벌**: 신나는 색동 컨페티 & 파티 무드
  7. 🍀 **행운의 클로버**: 싱그러운 네잎클로버 힐링 무드
  8. 🖼️ **관리자 커스텀 배경**: 행사 전용 일러스트/포스터/로고 프레임 등록 지원
- **감성 사진 필터**: 원본, 화사하게, 따뜻한 노을, 빈티지 필름, 클래식 흑백, 청량 쿨톤
- **듀얼 레이아웃**: 클래식 2x2 정사각형 4컷 및 시그니처 1x4 롱스트립(2세트 나란히 인쇄/공유 규격)
- **1000회 고강도 시뮬레이션 검증 완료**: 암호화, 분산 락, 라이프사이클, Sharp 이미지 정규화, 관리자 동시성 무결성 보증

## 보안 설계

- `service_role`, Redis 토큰과 HMAC 비밀값은 서버 환경변수에서만 읽습니다.
- 업로드 전 15분짜리 HttpOnly, SameSite=Strict 세션 쿠키와 CSRF 토큰을 발급합니다.
- 관리자 세션은 HMAC 암호화 쿠키와 Brute-Force 방어 Rate Limiting(`adminLimit`)이 적용됩니다.
- 요청 Origin을 allowlist로 검증합니다.
- IP 단위와 세션 단위의 분산 rate limit을 적용합니다.
- 세션당 성공 업로드를 1회로 제한하고 중복 업로드 잠금을 적용합니다.
- multipart JPEG 및 배경 이미지 크기, 매직 바이트, 디코딩 검사를 Sharp 파이프라인에서 수행하며 EXIF 등 메타데이터를 제거합니다.
- 다운로드 URL은 UUID 외에 만료 시각과 결합된 HMAC 토큰이 있어야 합니다.
- 미리보기 Signed URL과 다운로드 Signed URL을 별도로 발급합니다.
- Cron 및 수동 클린업은 `CRON_SECRET`과 Redis 분산 잠금을 함께 검증합니다.
- 클라이언트는 Base64 대신 Blob과 Object URL을 사용하고, 초기화 시 URL과 Canvas 메모리를 해제합니다.
- 2분 동안 입력이 없거나 Safari가 백그라운드로 전환되면 이전 참가자 상태를 초기화합니다.

## 로컬 실행

```bash
cp .env.example .env
npm install
npm run check
npm test
npm run simulate
npm run dev
```

- 메인 키오스크: `http://localhost:3000/`
- 관리자 센터: `http://localhost:3000/admin`
- 기기 활성화: `http://localhost:3000/activate`

## 테스트 및 시뮬레이션

```bash
npm run check       # 자바스크립트 문법 및 비밀 변수 클라이언트 누출 스캔
npm test            # 암호화, 세션, 이미지 정규화, 분산 락 단위 테스트
npm run simulate    # 1,000회 암호화/동시성/라이프사이클/Sharp 테마 렌더링 스트레스 시뮬레이션
```

