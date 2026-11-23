# Local development with synthetic data

Use a fresh disposable MySQL 8.4 instance and test-only users. The commands below use Bash, Docker, OpenSSL, Java 21, and Node.js with npm. Next.js requires Node 20.9 or later. The verified local environment used Node 24.11.1. Use Python 3.11 if running the optional FastAPI checks.

Keep `bank-web`, `bank-core`, and optionally `bank-service` as separate checkouts. They communicate over HTTP. The examples assume you can open a terminal in each checkout.

## 1. Prepare demo configuration

Check that ports **43307** (MySQL), **41025/48025** (Mailpit), **48081** (Core), **43000** (web), and **48001** (optional KYC service) are free. If you change a port, update both sides of its connection. Use the same browser host throughout. The commands below use `127.0.0.1`.

Generate fresh local database, JWT, KYC service, and bootstrap credentials. Keep the terminal private and shell tracing off. The generated file is outside the repositories. Note its directory path for the other terminals.

```bash
umask 077
export BANK_DEMO_DIR="$(mktemp -d)"
(
  cat <<'ENV'
DB_URL='jdbc:mysql://127.0.0.1:43307/banking_demo?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC'
DB_USERNAME=banking_demo
MAIL_HOST=127.0.0.1
MAIL_PORT=41025
APP_BASE_URL=http://127.0.0.1:43000
APP_FRONTEND_URL=http://127.0.0.1:43000
APP_MAIL_FROM=no-reply@example.test
ML_BASE_URL=http://127.0.0.1:48001
PAYHERE_ENABLED=false
ENV
  for var in DB_PASSWORD JWT_SECRET BANK_SERVICE_AUTH_SECRET MYSQL_ROOT_PASSWORD; do
    printf '%s=%q\n' "$var" "$(openssl rand -hex 32)"
  done
  for role in ADMIN CUSTOMER TELLER MANAGER; do
    name="demo_${role,,}"
    printf 'DEFAULT_%s_USERNAME=%q\n' "$role" "$name"
    printf 'DEFAULT_%s_EMAIL=%q\n' "$role" "$name@example.test"
    printf 'DEFAULT_%s_PASSWORD=%q\n' "$role" "Aa1!$(openssl rand -hex 24)"
  done
  printf 'KYC_STORAGE_ROOT=%q\n' "$BANK_DEMO_DIR/kyc"
) > "$BANK_DEMO_DIR/demo.env"
set -a
source "$BANK_DEMO_DIR/demo.env"
set +a
printf 'Private demo directory %s\n' "$BANK_DEMO_DIR"
```

The `DEFAULT_*_USERNAME`, `DEFAULT_*_EMAIL`, and `DEFAULT_*_PASSWORD` variables are read when core seeds missing role logins. Use the generated Admin, Teller, and Manager logins for their respective workflows. Register separate customer logins through the web UI to demonstrate email verification and KYC. Read generated values privately from the local file.

## 2. Start isolated MySQL and Mailpit

Run in the terminal that loaded `demo.env`. Use unused container names. Continue after both `docker run` commands succeed and verify that the database container ID matches the one just created. The MySQL data directory is a temporary in-memory mount. Stopping the container discards the demo database.

```bash
export MYSQL_DATABASE=banking_demo MYSQL_USER="$DB_USERNAME" MYSQL_PASSWORD="$DB_PASSWORD"
docker run --rm -d --name bank-portfolio-mysql \
  --tmpfs /var/lib/mysql --publish 127.0.0.1:43307:3306 \
  -e MYSQL_DATABASE -e MYSQL_USER -e MYSQL_PASSWORD -e MYSQL_ROOT_PASSWORD \
  mysql:8.4 --skip-log-bin

docker run --rm -d --name bank-portfolio-mail \
  --publish 127.0.0.1:41025:1025 --publish 127.0.0.1:48025:8025 \
  axllent/mailpit

docker inspect --format '{{.Config.Image}} {{json .HostConfig.Tmpfs}}' bank-portfolio-mysql
docker exec bank-portfolio-mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -Nse "SELECT VERSION();"'
```

Wait until the last command succeeds. The Mailpit inbox is at `http://127.0.0.1:48025`. Use the local sink for verification and reset emails. Keep token-bearing links out of recordings and reports.

## 3. Start bank-service when showing automated KYC checks

In a separate terminal in `bank-service`, set `BANK_DEMO_DIR` to the private directory from step 1.

```bash
python3.11 -m venv "$BANK_DEMO_DIR/kyc-venv"
source "$BANK_DEMO_DIR/kyc-venv/bin/activate"
python -m pip install -r requirements-portable.txt
set -a
source "$BANK_DEMO_DIR/demo.env"
set +a
python -m uvicorn app.main:app --host 127.0.0.1 --port 48001
```

Check `http://127.0.0.1:48001/health`. The service and core require the same server-only `BANK_SERVICE_AUTH_SECRET` of at least 32 UTF-8 bytes. Use the portable defaults for local checks. The separate model backends require their own runtime and assets. Core still requires a valid shared secret if bank-service is offline. An unavailable automated check can send a case to human review. Start bank-service to reproduce the verified automated-check-plus-Admin flow.

## 4. Start bank-core

From the `bank-core` checkout, use Java 21 and load the same private file. The checked-in development example supplies the Spring profile configuration. Keep any existing local configuration file intact and use a clean checkout or verify which overrides Spring loads.

```bash
set -a
source "$BANK_DEMO_DIR/demo.env"
set +a
export SPRING_CONFIG_ADDITIONAL_LOCATION=classpath:/application-dev.example.yml
./gradlew bootRun --args='--spring.profiles.active=dev --server.address=127.0.0.1 --server.port=48081'
```

Flyway applies the checked-in migrations to the empty database and Hibernate validates the schema. Check for successful startup and a 200 response on the public probe below. The disabled PayHere return route should give 404.

```bash
curl -fsS 'http://127.0.0.1:48081/api/v1/auth/available?username=portfolio_startup_probe'
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:48081/api/v1/wallet/payhere/return'
```

## 5. Start bank-web

Run these commands in a separate terminal in the `bank-web` checkout.

```bash
npm ci
BANKING_API_BASE_URL=http://127.0.0.1:48081 npm run dev -- --hostname 127.0.0.1 --port 43000
```

Open `http://127.0.0.1:43000`. You can also put `BANKING_API_BASE_URL` in an ignored `.env.local` based on [the example](../.env.example). Keep it server-only without a `NEXT_PUBLIC_` prefix. The optional `BANKING_API_TIMEOUT_MS` defaults to 15,000 ms. Use `npm run dev` for local HTTP and verification-email testing. Its trace configuration avoids recording token-bearing development URLs. Production-mode cookie configuration is intended for HTTPS.

### Prepare demo accounts

- Register synthetic customers with `example.test` email addresses and open the verification messages in Mailpit.
- Upload four valid synthetic KYC images, one per requested type, up to 1 MiB each. Watermark the fixtures and use no real identity document, face photo, or address.
- In a separate Admin browser context, review an eligible case and approve it. Return to customer onboarding, refresh, and complete the customer record. Open one funded LKR account and one recipient account through the supported flows.
- Use the recipient **account UUID** from its history view. Use a funded source explicitly and keep every operation on the disposable stack. The [demo walkthrough](portfolio-presentation.md#demo-walkthrough) includes the role sequence and playback options for recovery.

## Tests and cleanup

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Run these in `bank-web` with dependencies installed. The Playwright suite starts its own Next.js server and mock core on loopback ports 3100 and 38080. Use a separate disposable test database when running the backend integration tests. [Bank-core build and test instructions](https://github.com/gimesha-adikari/bank-core#build-and-test)

Stop the Next.js, Spring, and optional FastAPI processes. Stop only the containers created for this demo with `docker stop bank-portfolio-mysql bank-portfolio-mail`. Remove the generated private directory once you no longer need its synthetic credentials, files, and virtual environment. Leave unrelated local services and databases untouched.
