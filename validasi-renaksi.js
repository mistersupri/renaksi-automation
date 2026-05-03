import { chromium } from "playwright";
import { login } from "./login.js";
import { asnValue } from "./variable.js";

const STATUS = "DIVERIFIKASI";

const statusMap = {
  DRAFT: 0,
  DIAJUKAN: 1,
  PROSES: 2,
  DISETUJUI: 3,
  DIVERIFIKASI: 4,
};

const VALIDATION_URL = `https://etpp.jakarta.go.id/list-kinerja-bawahan?tahun=2026&status=${statusMap[STATUS]}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message, data = "") => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${message}`, data || "");
};

const waitAndClick = async (page, selector, options = {}) => {
  const { timeout = 10000 } = options;

  log(`🖱️ Klik selector: ${selector}`);

  await page.waitForSelector(selector, {
    state: "visible",
    timeout,
  });

  await page.click(selector);
};

const confirmSwal = async (page) => {
  log("⚠️ Menunggu konfirmasi swal");

  await waitAndClick(page, '.swal2-modal button:has-text("yakin")');

  await waitAndClick(page, '.swal2-modal button:has-text("OK")');

  log("✅ Konfirmasi swal selesai");
};

const expandAllIndicators = async (page) => {
  log("📂 Expand semua indikator");

  const buttons = await page
    .locator(
      ".collapse.show .colapse-expand .dotted-bawah .fa-chevron-double-down",
    )
    .all();

  log(`📊 Total expand button: ${buttons.length}`);

  for (const [idx, button] of buttons.entries()) {
    try {
      await button.click();
      log(`✅ Expand indikator ${idx + 1}`);
      await delay(300);
    } catch (err) {
      log(`❌ Gagal expand indikator ${idx + 1}`);
    }
  }
};

const fillPerjanjian = async (page) => {
  log("📝 Mengisi perjanjian kualitas");

  await page.waitForSelector("#perjanjian-kualitas #perjanjian", {
    state: "visible",
  });

  await delay(3000);

  await page.fill(
    "#perjanjian-kualitas #perjanjian",
    "Dokumen pelaporan disusun sesuai dengan ketentuan yg ditetapkan dan relevan dan memuat data yang akurat serta terselesaikan dengan tepat waktu",
  );

  await delay(3000);

  await waitAndClick(page, '#perjanjian-kualitas button[type="submit"]');

  await confirmSwal(page);

  log("✅ Perjanjian kualitas berhasil disimpan");
};

const processEditButtons = async (page) => {
  const editButtons = await page.$$(".fa-edit");

  log(`✏️ Total edit button ditemukan: ${editButtons.length}`);

  for (const [idx, button] of editButtons.entries()) {
    try {
      log(`➡️ Proses edit ke-${idx + 1}`);

      await button.click();

      await fillPerjanjian(page);

      await delay(500);
    } catch (err) {
      log(`❌ Gagal edit button ke-${idx + 1}`, err.message);
    }
  }
};

const processValidationRows = async (page) => {
  const rows = await page.$$(".data-kinerja-pegawai table tbody tr");

  log(`📊 Total row validasi: ${rows.length}`);

  for (const [idx, row] of rows.entries()) {
    try {
      log(`🔍 Memeriksa row ke-${idx + 1}`);

      const badge = await row.$("td .badge");

      if (!badge) {
        log("⏭️ Badge status tidak ditemukan");
        continue;
      }

      const status = await badge.innerText();

      log(`📌 Status row: ${status}`);

      if (status.includes("Tervalidasi")) {
        log("⏭️ Row sudah divalidasi");
        continue;
      }

      const validateButtonSelector = `
        .data-kinerja-pegawai table tbody tr:nth-child(${idx + 1})
        td button:has-text("Validasi")
      `;

      await waitAndClick(page, validateButtonSelector);

      log("✅ Klik tombol Validasi");

      await delay(3000);

      await page.waitForSelector(
        ".collapse.show .colapse-expand .dotted-bawah .fa-chevron-double-down",
      );

      await expandAllIndicators(page);

      await processEditButtons(page);

      log("👍 Klik tombol Setuju");

      await waitAndClick(page, '.detail-pegawai button:has-text("Setuju")');

      await confirmSwal(page);

      log(`🎉 Validasi row ke-${idx + 1} selesai`);

      await delay(1000);
    } catch (err) {
      log(`❌ Error validasi row ke-${idx + 1}`, err.message);
    }
  }
};

const processEkspektasiKhusus = async (page) => {
  const rows = await page.$$(".ekspektasi-khusus table tbody tr");

  log(`📊 Total ekspektasi khusus: ${rows.length}`);

  for (const [idx, row] of rows.entries()) {
    try {
      log(`🔍 Memeriksa ekspektasi ke-${idx + 1}`);

      const expectValueEl = await row.$('td[aria-colindex="2"]');
      const expectContentEl = await row.$('td[aria-colindex="4"]');

      const expectValue = (await expectValueEl?.innerText())?.trim() || "";

      const expectContent = (await expectContentEl?.innerText())?.trim() || "";

      log("📌 Ekspektasi", expectValue);
      log("📌 Existing Content", expectContent);

      if (expectContent === expectValue) {
        log("⏭️ Ekspektasi sudah terisi");
        continue;
      }

      const addButton = await row.$(
        'td[aria-colindex="5"] button:has-text("Tambah")',
      );

      if (!addButton) {
        log("⏭️ Tombol tambah tidak ditemukan");
        continue;
      }

      await addButton.click();

      log("➕ Klik tombol Tambah");

      await page.waitForSelector("#ekspektasi_khusus", {
        state: "visible",
      });

      const value = asnValue[expectValue] || "";

      log("📝 Mengisi ekspektasi khusus");

      await page.fill("#ekspektasi_khusus", value);

      await waitAndClick(page, 'button[type="submit"]');

      await confirmSwal(page);

      log(`✅ Ekspektasi ke-${idx + 1} berhasil`);
    } catch (err) {
      log(`❌ Error ekspektasi ke-${idx + 1}`, err.message);
    }
  }
};

const getTargetRowIndex = async (page) => {
  log("🔍 Mencari jabatan yang sesuai");

  const rows = await page.locator("#data-kinerja-bawahan tbody tr").all();

  for (const [idx, row] of rows.entries()) {
    const jabatan = (
      await row
        .locator("td[aria-colindex='4'] .fs-sm.leading-tight")
        .textContent()
    )?.trim();

    const lokasi = (
      await row
        .locator("td[aria-colindex='4'] .fs-nanonano.text-muted.leading-tight")
        .textContent()
    )?.trim();

    log(`📌 Row ${idx + 1}: ${jabatan}`);

    if (
      jabatan?.toUpperCase() === "KEPALA SUBBAGIAN TATA USAHA" ||
      jabatan?.toUpperCase() === "KEPALA SATUAN PELAKSANA TATA USAHA SMP" ||
      jabatan?.toUpperCase() === "STAF" ||
      lokasi === "SUKU DINAS PENDIDIKAN WILAYAH II KOTA ADM. JAKARTA PUSAT"
    ) {
      log(`✅ Target ditemukan pada row ${idx + 1}`);

      return idx + 1;
    }
  }

  log("⚠️ Target tidak ditemukan");

  return -1;
};

const finishValidation = async (page) => {
  log("🏁 Menyelesaikan validasi");

  await waitAndClick(page, ".info-pegawai button:has-text('Selesai Validasi')");

  await waitAndClick(
    page,
    "#perjanjian-kualitas button:has-text('Selesaikan Validasi')",
  );

  await confirmSwal(page);

  log("🎉 Semua validasi selesai");
};

export const validasiRenaksi = async (page) => {
  while (true) {
    try {
      log("🌐 Membuka halaman validasi");

      await page.goto(VALIDATION_URL, {
        waitUntil: "networkidle",
      });

      await page.waitForSelector("#data-kinerja-bawahan tbody tr");

      log("✅ Halaman list berhasil dimuat");

      const targetRow = await getTargetRowIndex(page);

      if (targetRow < 0) break;

      log(`➡️ Membuka detail row ke-${targetRow}`);

      await waitAndClick(
        page,
        `#data-kinerja-bawahan tbody tr:nth-child(${targetRow}) button:has-text("Detil")`,
      );

      await page.waitForSelector(
        ".data-kinerja-pegawai table tbody tr button",
        {
          timeout: 15000,
        },
      );

      log("✅ Halaman detail terbuka");

      await processValidationRows(page);

      await delay(2000);

      await processEkspektasiKhusus(page);

      await finishValidation(page);

      log("🔄 Restart loop validasi");

      await delay(3000);
    } catch (err) {
      log("❌ Fatal error pada validasiRenaksi", err.message);

      await delay(5000);
    }
  }
};

(async function () {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await login(page);

  await validasiRenaksi(page);

  await browser.close();
})();
