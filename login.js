import dotenv from "dotenv";

dotenv.config();

const log = (message, data = "") => {
  const time = new Date().toLocaleTimeString();

  console.log(`[${time}] ${message}`, data || "");
};

export const login = async (page) => {
  const username = process.env.ETPP_USERNAME;
  const password = process.env.ETPP_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Environment variable ETPP_USERNAME / ETPP_PASSWORD belum diset",
    );
  }

  try {
    log("🌐 Membuka halaman login");

    // 1. GO TO LOGIN PAGE
    await page.goto("https://etpp.jakarta.go.id/login", {
      waitUntil: "domcontentloaded",
    });

    log("✅ Halaman login berhasil dibuka");

    // 2. INPUT CREDENTIAL
    log("⌨️ Mengisi username");

    await page.fill("input#username", username);

    log("⌨️ Mengisi password");

    await page.fill("input#password", password);

    // 3. WAIT LOGIN SUCCESS
    await page.waitForSelector(".b-avatar", {
      state: "visible",
      timeout: 100000,
    });

    log("✅ Login berhasil");
  } catch (err) {
    log("❌ Login gagal", err.message);

    throw err;
  }
};
