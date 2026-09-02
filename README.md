# 마음 네컷 포토부스 Secure v4.5 (이천시정신건강복지센터 20주년 에디션)

iPad Safari 및 키오스크 브라우저용 고감성 포토부스 웹 애플리케이션입니다.  
Express 기반 Vercel Serverless Function, Supabase Private Storage, HMAC 보안 토큰, 72종 고화질 감성 스티커 엔진을 탑재하고 있습니다.

---

## 🌟 주요 기능 및 리뉴얼 (v4.5)

1. **오리지널 '마음구름이' 캐릭터 스티커 60종**:
   - 구름이 표정 (16종), 구름이 코스튬 (16종), 구름이 응원 & 액션 (16종), 구름이 스페셜 (12종)
2. **이천시 정신건강복지센터 20주년 기념 스티커 12종**:
   - 한글 타이포그래피 및 축하 엠블럼 (`이천센터 20주년`, `함께한 20년, 늘 곁에`, `마음건강 20년`, `20주년 최고`, `20년 축하해요` 등)
3. **직관적인 아이패드 키오스크 UI & 터치 스티커 에디터**:
   - 스티커 4-코너 조작 핸들 (삭제 `✕`, 회전 `↻`, 크기 조절 `⤡`) 및 하단 툴바
   - 6가지 프레임 테마 컬러 칩 실시간 전환 (`내추럴 크림`, `모던 차콜`, `로즈 핑크`, `선샤인 옐로우`, `민트 브리즈`, `라일락 드림`)
4. **1200×1420 인화지 무손실 Canvas 합성 & QR 다운로드**:
   - 6컷 촬영 후 마음에 드는 4컷 선택 ➔ 스티커 꾸미기 ➔ 3단계 정직한 업로드 ➔ QR 모바일 다운로드
5. **엔터프라이즈 보안 및 무결성 보증**:
   - 10,000회 암호화 검증, 1,000회 분산 락, 1,000회 라이프사이클 및 Sharp 이미지 정규화 100% 무결점 통과

---

## 🚀 로컬 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 코드 검사 및 테스트
npm run check
npm test

# 3. 로컬 서버 실행
npm run dev
```

- 메인 키오스크: [http://localhost:3000](http://localhost:3000)
- 관리자 센터: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📦 GitHub 원격 저장소 업로드 가이드

```bash
# 1. GitHub에서 새 Repository 생성 (예: maeum-fourcuts-20th)
# 2. 로컬 저장소에 GitHub 원격 주소 연결
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git

# 3. 기본 브랜치를 main으로 설정 후 푸시
git branch -M main
git push -u origin main
```
