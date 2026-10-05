// Environnement de test : base SQLite dédiée + secrets déterministes.
// Doit s'exécuter AVANT tout import des modules applicatifs.
process.env.DATABASE_URL = `file:${__dirname.replace("/tests", "")}/tests/test.db`;
process.env.HELM_QR_SECRET = "test-qr-secret";
process.env.HELM_SESSION_SECRET = "test-session-secret";
process.env.HELM_DEMO = "1";
process.env.HELM_LOG = "0";
