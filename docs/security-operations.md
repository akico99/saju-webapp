# 보안 운영 절차

## 운영 시작 전 설정

- `NODE_ENV=production`에서는 `SESSION_SECRET`에 최소 32바이트, 최대 512바이트의 암호학적 난수 값을 설정합니다. 예를 들어 `openssl rand -base64 48`로 생성하고, 값을 로그·메신저·저장소에 남기지 말고 호스팅 서비스의 비밀값 저장소에 직접 입력합니다. 시작 검사는 전체 반복 주기와 관측 엔트로피 같은 명백한 약한 값을 거부하지만, 직접 생성 방식을 증명하지는 못합니다.
- `OUTPUT_DIR`은 이미 존재하고 쓰기 가능한 절대 경로여야 합니다. 경로가 쓰기 가능한지만 확인해 영구 저장소라고 판단할 수는 없습니다. 결과 파일을 재배포 후에도 보존하려면 호스팅 플랫폼에서 해당 경로에 영구 디스크를 직접 연결하고, 재배포 뒤 파일 유지 여부를 확인합니다.
- `BACKUP_ENCRYPTION_KEY`에는 32바이트 키를 64자리 16진수 또는 Base64 형식으로 설정합니다. `openssl rand -hex 32` 또는 `openssl rand -base64 32`로 생성할 수 있습니다. `SESSION_SECRET`과 다른 값을 사용합니다.
- Resend에는 `BACKUP_EMAIL_TO`로 지정된 수신함에만 백업을 전송합니다. 기본 수신 주소는 운영자 Gmail입니다. 메일에는 압축·암호화된 DB 첨부만 들어가며, 앱은 키가 없거나 형식이 잘못되면 메일을 보내지 않습니다.

## 탈퇴 파일 정리 예외

관리자 카드 결제 화면의 **탈퇴 파일 정리** 탭에서 미해결 예외를 확인합니다. 안전한 작업 폴더명은 `OUTPUT_DIR` 아래 경로와 링크 여부를 다시 검사한 뒤 재시도합니다. 검사에 걸리는 대상은 삭제하지 않습니다. 위치를 확인할 수 없는 기존 예외는 작업 ID와 사유만 보고하며, 파일시스템에서 위치와 잔존 여부를 조사하고 필요한 조치를 마친 뒤 운영 티켓 또는 PG 확인 번호를 입력해야 수동 종결할 수 있습니다. 이 작업은 파일을 삭제하지 않으며, 처리 근거는 데이터베이스에 남습니다.

## 백업 복원

첨부 파일은 `app-db-YYYY-MM-DD.db.enc` 이름의 버전 1 envelope입니다. envelope에는 `aes-256-gcm`, gzip, IV, 인증 태그와 암호문이 포함됩니다. 복호화에는 백업을 만들 때 사용한 원래 키가 필요합니다.

첨부 파일을 제한된 접근 권한의 임시 경로에 저장하고, 앱 저장소 루트에서 다음 스크립트를 실행합니다. 키를 명령행 인자나 셸 기록에 넣지 말고 프로세스 환경으로 안전하게 전달합니다.

```js
const fs = require('node:fs');
const { decryptBackupAttachment } = require('./src/jobs/backupDb');

const encryptedFile = process.argv[2];
const destination = process.argv[3];
const encodedEnvelope = fs.readFileSync(encryptedFile).toString('base64');
const sqliteBytes = decryptBackupAttachment(encodedEnvelope, process.env.BACKUP_ENCRYPTION_KEY);
fs.writeFileSync(destination, sqliteBytes, { flag: 'wx', mode: 0o600 });
```

운영 DB에 복원하기 전 별도 사본에서 SQLite 무결성을 확인합니다. 계정 탈퇴 후 만든 백업에도 탈퇴 전 데이터가 포함될 수 있으므로, 삭제 대상과 결과물을 정리하는 운영 검토가 끝나기 전에는 복원 DB를 서비스에 연결하지 않습니다. 현재 앱은 백업 메일함의 파일을 자동 삭제하거나, 복원 뒤 탈퇴 계정을 자동으로 다시 삭제하지 않습니다.

## 키 교체와 메일 보존

키를 바꾸면 이후 백업은 새 키로 암호화되며, 기존 백업은 이전 키가 있어야 복호화됩니다. 새 키를 적용한 뒤 복원 시험을 마칠 때까지 이전 키를 접근 제한된 비밀값 저장소에 보관하고, 각 키의 적용 기간을 기록합니다. 교체된 키를 분실하면 해당 기간의 백업은 복구할 수 없습니다.

백업 메일과 첨부의 보존 기간은 Resend가 아닌 수신 메일함 설정에 달려 있습니다. 앱에는 메일함 백업을 자동 삭제하는 기능이 없습니다. 운영자는 수신 메일함에 보존 기간과 접근 권한을 별도로 설정하고, 백업 보존 기간을 넘긴 메일을 삭제해야 합니다. 이 설정이 확인되기 전까지는 오래된 백업에 개인정보가 남을 수 있으므로 계정 탈퇴 안내에 백업 데이터가 즉시 제거된다고 표시하지 않습니다.

## 테스트와 배포 전 확인

- `npm test`는 `test/**/*.test.js` 회귀 테스트만 직렬 실행합니다. `manual-*.js` 파일은 자동 실행 대상이 아닙니다.
- 배포 전 `node test/manual-visual-samples.js`로 Puppeteer/PDF 흐름을, `node --test test/webtoon.test.js`로 Sharp 이미지 처리를 확인합니다.
- 이 코드 검사는 `OUTPUT_DIR`이 존재하고 쓰기 가능한지만 확인합니다. 영구 디스크 마운트, 운영 환경변수, 백업 수신함의 보존 규칙은 호스팅 대시보드와 메일 제공자 설정에서 별도로 확인해야 합니다.
