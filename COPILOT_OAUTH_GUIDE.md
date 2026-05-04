# GitHub Copilot OAuth Device Flow 구현 가이드

이 문서는 GitHub App 이나 별도의 API 키 발급 없이, 사용자의 GitHub Copilot 구독을 활용하여 AI 기능을 구현할 수 있는 **OAuth Device Flow** 인증 및 토큰 교환 방식을 설명합니다.

---

## 1. 개요 (Overview)

GitHub Copilot은 전용 API 키를 제공하지 않지만, VS Code와 같은 IDE에서 사용하는 인증 방식을 역이용하면 일반 애플리케이션에서도 Copilot 모델(GPT-4o 등)을 사용할 수 있습니다.

이 방식의 핵심 특징은 다음과 같습니다:
- **Client ID**: VS Code Copilot 전용 ID(`Iv1.b507a08c87ecfe98`)를 사용합니다.
- **Workflow**: 
    1. Device Code 요청 (앱)
    2. 사용자 인증 (웹 브라우저)
    3. Access Token 획득 (앱)
    4. Copilot 전용 Token으로 교환 (앱)

---

## 2. 세부 구현 단계

### Phase 1: Device Code 요청
사용자가 브라우저에서 입력할 8자리 코드와 인증 URL을 가져옵니다.

- **Endpoint**: `POST https://github.com/login/device/code`
- **Headers**: `Accept: application/json`
- **Payload**:
  - `client_id`: `Iv1.b507a08c87ecfe98`
  - `scope`: `read:user` (최소 권한)

**반환값 형식:**
```json
{
  "device_code": "df7...4a",
  "user_code": "ABCD-1234",
  "verification_uri": "https://github.com/login/device",
  "interval": 5,
  "expires_in": 900
}
```

### Phase 2: 사용자 인증 폴링 (Polling)
사용자가 브라우저에서 코드를 입력할 때까지 대기하며 상태를 확인합니다.

- **Endpoint**: `POST https://github.com/login/oauth/access_token`
- **Headers**: `Accept: application/json`
- **Payload**:
  - `client_id`: `Iv1.b507a08c87ecfe98`
  - `device_code`: (Phase 1에서 받은 값)
  - `grant_type`: `urn:ietf:params:oauth:grant-type:device_code`

**로직:**
- `interval` 초마다 한 번씩 요청을 보냅니다.
- 응답에 `access_token`이 포함될 때까지 반복합니다.
- 사용자가 아직 승인 전이면 `error: "authorization_pending"`이 반환됩니다.

### Phase 3: Copilot 토큰 교환 (Token Exchange)
획득한 GitHub Access Token을 Copilot 내부용 단기 토큰으로 교환합니다. **이 단계에서 헤더 설정이 가장 중요합니다.**

- **Endpoint**: `GET https://api.github.com/copilot_internal/v2/token`
- **Headers**:
  - `Authorization`: `Bearer <GITHUB_ACCESS_TOKEN>`
  - `User-Agent`: `GitHubCopilotChat/0.23.2`
  - `Editor-Version`: `vscode/1.96.2`
  - `Editor-Plugin-Version`: `copilot-chat/0.23.2`
  - `Copilot-Integration-Id`: `vscode-chat`

**반환값 형식:**
```json
{
  "token": "tid=...", 
  "expires_at": 17130xxx,
  "refresh_in": 1500
}
```
*참고: 반환된 토큰은 `tid=`으로 시작하는 매우 긴 문자열입니다.*

---

## 3. Python 구현 예제

```python
import httpx
import time

CLIENT_ID = "Iv1.b507a08c87ecfe98"

def get_copilot_token():
    # 1. Device Code 요청
    with httpx.Client() as client:
        res = client.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={"client_id": CLIENT_ID, "scope": "read:user"},
        ).json()
    
    device_code = res["device_code"]
    print(f"인증 URL: {res['verification_uri']}")
    print(f"인증 코드: {res['user_code']}")

    # 2. 폴링 (사용자 승인 대기)
    access_token = None
    while not access_token:
        time.sleep(res["interval"])
        token_res = httpx.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": CLIENT_ID,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        ).json()

        if "access_token" in token_res:
            access_token = token_res["access_token"]
        elif token_res.get("error") != "authorization_pending":
            raise Exception(f"인증 실패: {token_res}")

    # 3. Copilot 토큰 교환
    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "GitHubCopilotChat/0.23.2",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.23.2",
        "Copilot-Integration-Id": "vscode-chat",
    }
    
    copilot_res = httpx.get(
        "https://api.github.com/copilot_internal/v2/token",
        headers=headers
    ).json()

    return copilot_res["token"]
```

---

## 4. 토큰 사용 방법 (Usage)

획득한 토큰(`tid=...`)은 OpenAI 호환 API 엔드포인트에서 사용할 수 있습니다.

- **Base URL**: `https://api.githubcopilot.com`
- **Endpoint**: `/chat/completions` (Chat), `/models` (모델 목록)
- **Headers**:
    - `Authorization`: `Bearer tid=...`
    - `Content-Type`: `application/json`

**사용 가능 모델 예시:**
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `meta/llama-3.3-70b-instruct`
- `anthropic/claude-3-5-sonnet` (권한에 따라 다름)

---

## 5. 주의사항 및 유지보수
1. **토큰 갱신**: Copilot 토큰은 약 25~30분 정도의 짧은 유효 기간을 가집니다. `expires_at`을 확인하여 만료 전 `Phase 3` 과정을 다시 수행해야 합니다.
2. **헤더 업데이트**: GitHub에서 IDE 버전을 체크할 수 있으므로, 주기적으로 `User-Agent`나 `Editor-Version`을 최신 VS Code 버전으로 업데이트해주는 것이 좋습니다.
3. **보안**: `access_token`과 `copilot_token`은 로컬 캐시(`.json`)에 보안을 유지하며 저장하십시오.
