# 배포 서버 nginx 설정 (사본)

## ⚠️ 이 폴더는 사본입니다

여기 있는 파일은 **배포 서버(`i15e204.p.ssafy.io`)에 실제로 올라가 있는 nginx 설정의 사본**입니다.
이 폴더를 고쳐도 **서버에는 아무 일도 일어나지 않습니다.** 배포(Jenkins)와도 무관합니다.

기록·리뷰·복구를 위해 둡니다. 실제 적용은 아래 "적용 방법"대로 **수동**입니다.

## 왜 자동화하지 않는가

- nginx는 **호스트에 설치**되어 있고 컨테이너가 아니다. `docker compose`가 재시작돼도 이 설정은 그대로 남는다.
- 그래서 설정을 바꾸는 일은 **서버당 한 번**이고, 배포마다 반복할 필요가 없다.
- 배포 파이프라인에 넣으면 설정 오타 하나로 배포가 서비스를 죽일 수 있다. 변경 빈도가 낮은데 그 위험을 짊어질 이유가 없다.

**평상시 팀원이 할 일은 없습니다.** `git pull`을 받아도, 배포가 돌아도, 로컬에서 개발할 때도 아무것도 실행하지 않습니다(로컬은 호스트 nginx를 쓰지 않는다). 아래 절차는 **nginx 설정을 실제로 바꿀 때**와 **서버를 새로 만들 때**만 필요합니다.

## 파일 대응

| 이 레포 | 서버 경로 |
| --- | --- |
| `sites-available/i15e204` | `/etc/nginx/sites-available/i15e204` (`sites-enabled/i15e204`가 심볼릭 링크) |
| `conf.d/websocket-upgrade.conf` | `/etc/nginx/conf.d/websocket-upgrade.conf` |

`frontend/nginx.conf`는 **다른 파일**입니다. 그건 프론트 컨테이너 내부용(80포트)이고, 여기 있는 건 호스트 nginx입니다. 혼동하지 마세요.

## 구성 요약

```
브라우저 ──HTTPS 443──> 호스트 nginx ──┬── /       ─> 127.0.0.1:3000  (프론트 컨테이너)
                                      ├── /api/   ─> 127.0.0.1:8080  (백엔드 컨테이너)
                                      ├── /ws     ─> 127.0.0.1:8080  (WebSocket, 채팅)
                                      └── /files/ ─> 127.0.0.1:9000  (MinIO, 업로드된 이미지)
```

- HTTPS는 Certbot(Let's Encrypt)이 관리합니다. `listen 443 ssl;` 아래 `# managed by Certbot` 주석이 붙은 줄은 **건드리지 마세요.** 인증서 자동 갱신이 그 표시를 보고 동작합니다.
- 80 포트는 443으로 301 리다이렉트만 합니다.

### `/ws` (채팅 WebSocket)

`conf.d/websocket-upgrade.conf`의 `map`이 함께 있어야 동작합니다. `map`은 `http` 컨텍스트에만 쓸 수 있어서 `server` 블록 안에 넣지 못하고, Certbot이 관리하는 파일을 덜 건드리도록 별도 파일로 분리했습니다.

| 설정 | 없으면 생기는 일 |
| --- | --- |
| `proxy_http_version 1.1` | 기본값 1.0은 프로토콜 업그레이드를 지원하지 않아 **연결 자체가 실패**한다 |
| `Upgrade` / `Connection` 헤더 | 업그레이드 요청이 백엔드까지 전달되지 않는다 |
| `proxy_read_timeout 3600s` | 기본 60초. 사용자가 1분간 말을 안 하면 트래픽이 없어서 **조용히 끊긴다.** 가장 찾기 어려운 증상 |
| `proxy_buffering off` | 메시지가 버퍼에 갇혀 실시간성이 깨진다 |

### `/files/` (업로드된 이미지)

업로드는 백엔드(`POST /api/files`)가 처리하고, **조회는 nginx가 MinIO로 직접 넘긴다.** 이미지 트래픽이 앱을 지나지 않아 피드에서 이미지 수십 개를 받아도 백엔드에 부하가 없다.

```
/files/2026/08/x.png  →  http://127.0.0.1:9000/helloworld/2026/08/x.png
```

`proxy_pass` 끝의 `/helloworld/`가 버킷 이름이다(MinIO 객체 주소는 `/{버킷}/{키}`). 버킷은 **공개 읽기(`s3:GetObject`)만** 열려 있어 자격증명 없이 읽히고 쓰기는 불가하다. 버킷 생성·정책 적용은 백엔드가 기동 시 알아서 한다(멱등).

| 설정 | 없으면 생기는 일 |
| --- | --- |
| `client_max_body_size 20m` (`/api/`에) | 기본 1MB. **5MB 이미지가 nginx에서 413으로 막힌다** — 앱 설정만 올려도 소용없다. 앱 한도(5MB)보다 넉넉히 두는 이유는 아래 참고 |
| `Cache-Control immutable` | 같은 이미지를 매번 다시 받는다. 키가 uuid라 내용이 바뀔 수 없어 안전하다 |
| `proxy_intercept_errors` | 없는 파일에 MinIO의 XML 오류가 그대로 노출된다 |

⚠️ **nginx 한도는 앱 한도보다 넉넉해야 한다.** 둘을 같은 값(6m/5MB)으로 뒀다가, 초과 업로드에서 nginx가 먼저 잡아 **봉투 없는 413 HTML**을 반환했다. 프론트가 `FILE_TOO_LARGE`를 읽을 수 없어 "왜 실패했는지" 안내가 불가능했다. 지금은 nginx 20m / 앱 5MB로, **크기 판정을 앱이 하고 규약대로 400 + 코드**로 응답한다. nginx는 말도 안 되는 크기만 막는 마지막 방어선이다.

⚠️ **MinIO 주소(`:9000`)를 프론트에 직접 내려주면 안 된다.** HTTPS가 아니라 브라우저가 혼합 콘텐츠로 차단하고, 포트가 열려 있다는 사실도 드러난다. 백엔드는 `app.minio.public-base-url`(= `https://i15e204.p.ssafy.io/files`)만 응답에 담는다.

## 적용 방법 (서버에서)

```bash
# 0) 백업 먼저
sudo cp /etc/nginx/sites-available/i15e204 ~/i15e204.nginx.bak.$(date +%Y%m%d%H%M%S)

# 1) 파일 복사 (레포를 서버에 clone/pull 한 상태에서)
sudo cp infra/nginx/conf.d/websocket-upgrade.conf /etc/nginx/conf.d/websocket-upgrade.conf
sudo cp infra/nginx/sites-available/i15e204       /etc/nginx/sites-available/i15e204

# 2) 문법 검사 — 실패하면 reload 하지 말 것
sudo nginx -t

# 3) 무중단 리로드 (restart 아님. restart는 기존 연결이 끊긴다)
sudo nginx -s reload
```

### 되돌리기

```bash
sudo cp ~/i15e204.nginx.bak.<타임스탬프> /etc/nginx/sites-available/i15e204
sudo nginx -t && sudo nginx -s reload
```

## 확인

```bash
# 기존 기능 회귀 (이게 제일 중요)
curl -s -o /dev/null -w "%{http_code}\n" https://i15e204.p.ssafy.io/          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://i15e204.p.ssafy.io/api/tags  # 401 (인증 필요 엔드포인트라 정상)

# WebSocket 업그레이드
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     https://i15e204.p.ssafy.io/ws

# 파일 경로 (없는 키라 404가 정상. 502면 MinIO 연결 실패, 200이면 뭔가 잘못됨)
curl -s -o /dev/null -w "%{http_code}\n" https://i15e204.p.ssafy.io/files/no-such-file.png
```

`/ws` 응답 해석:

| 응답 | 의미 |
| --- | --- |
| `101 Switching Protocols` | 정상. nginx·백엔드 모두 OK |
| `401` + `AUTH_001` | nginx는 정상. 백엔드에 WebSocket 코드가 배포되기 전 상태 |
| `400 Bad Request` | ❌ 업그레이드 실패. `proxy_http_version` / Upgrade 헤더 확인 |
| `502 Bad Gateway` | ❌ 백엔드 컨테이너 연결 실패. `docker ps` 확인 |

## 변경 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-08-04 | `client_max_body_size` 6m → **20m**. 같은 값이면 초과 업로드에서 nginx가 먼저 잡아 봉투 없는 413 HTML이 나갔다(프론트가 사유를 읽을 수 없음). 백업: `~/i15e204.nginx.bak.20260804145243` |
| 2026-08-04 | `/files/` location(MinIO 프록시) + `/api/`에 `client_max_body_size` 추가 (파일 업로드). **적용 완료.** 백업: 서버 `~/i15e204.nginx.bak.20260804142622`. 확인: `/` 200 · `/api/tags` 401 · `/ws` **101**(채팅 회귀 없음) · `/files/no-such-file.png` **404**(502 아님 = MinIO 도달) · `/files/` 404(목록 차단) |
| 2026-08-03 | `/ws` location + `websocket-upgrade.conf` 추가 (채팅 WebSocket). 백업: 서버 `~/i15e204.nginx.bak.20260803005841` |
| 그 이전 | HTTPS(Certbot), `/` 프론트 프록시, `/api/` 백엔드 프록시 — 이 레포에 기록되기 전에 설정됨 |

## 앞으로 이 폴더를 고칠 때

1. 서버에 적용하고 동작을 확인한 뒤
2. 서버의 실제 파일을 여기로 복사해 커밋한다 (레포를 먼저 고치고 서버에 반영하면, 적용 실패 시 레포와 서버가 갈라진다)
3. 위 "변경 이력"에 한 줄 남긴다
