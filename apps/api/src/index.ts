import {
  createDatabase,
  purgeExpiredPayments,
} from "@nepal-payment-lab/database";
import { createApp } from "./app";
import { loadEnvironment } from "./env";
import { logger } from "./observability/logger";

const env = loadEnvironment();
const database = createDatabase({ url: env.DATABASE_URL });

const server = createApp({
  db: database.db,
  webOrigin: env.WEB_ORIGIN,
}).listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
    },
    "API listening",
  );
});

const purge = () =>
  purgeExpiredPayments({ db: database.db }).catch(() =>
    logger.error("Payment retention failed"),
  );
void purge();

const retentionTimer = setInterval(() => {
  void purge();
}, 3600000);
retentionTimer.unref();

function shutdown() {
  clearInterval(retentionTimer);
  logger.info("API shutting down");
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(() => {
    void database
      .close()
      .then(() => {
        clearTimeout(deadline);
        process.exit(0);
      })
      .catch(() => process.exit(1));
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
