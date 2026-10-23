RUSHSTARS Render 서버 배포용

1) 이 폴더의 파일 3개를 GitHub 새 저장소 루트에 업로드
   - server.py
   - render.yaml
   - README_RENDER_KO.txt

2) Render.com 로그인
3) New + > Blueprint
4) 방금 만든 GitHub 저장소 연결
5) render.yaml 감지 후 Apply
6) 배포 완료 후 생성된 주소 확인
   예: https://rushstars-server-xxxx.onrender.com
7) 브라우저에서 아래 주소를 열어
   https://...onrender.com/health
   {"ok":true,...} 가 뜨면 서버 정상

주의:
- Render Free Web Service는 15분간 요청이 없으면 잠듭니다.
- 다시 접속하면 약 1분 정도 켜지는 시간이 걸릴 수 있습니다.
- 무료 서비스의 로컬 파일은 재시작/슬립/재배포 시 유지되지 않아서,
  현재 SQLite 기반 친구 목록/계정 데이터는 초기화될 수 있습니다.
  실제 장기 운영용으로는 외부 DB 또는 유료 Persistent Disk 연결이 필요합니다.
