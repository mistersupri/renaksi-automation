import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { login } from "./login.js";
import { encodeParams } from "./encodeParams.js";

const tahun = 2025;
const maxTriwulan = 4;
const bawahanLangsung = true;

let triwulan = 4;

// ==============================
// HASHID CONFIG
// ==============================

// ==============================
// LOG FILE
// ==============================

const TIMESTAMP = Date.now();

const RESULT_LOG_PATH = path.join(
  process.cwd(),
  `hasil-validasi-${TIMESTAMP}.json`,
);

const RESULT_CSV_PATH = path.join(
  process.cwd(),
  `hasil-validasi-${TIMESTAMP}.csv`,
);

const validationResults = [];

// ==============================
// HELPERS
// ==============================

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message, data = "") => {
  const time = new Date().toLocaleTimeString();

  console.log(`[${time}] ${message}`, data || "");
};

const saveLogFile = () => {
  fs.writeFileSync(RESULT_LOG_PATH, JSON.stringify(validationResults, null, 2));

  log(`💾 Log berhasil disimpan: ${RESULT_LOG_PATH}`);
};

const saveCsvFile = () => {
  const csvContent = [
    [
      "Timestamp",
      "NRK",
      "Nama",
      "Jabatan",
      "Unit Kerja",
      "Renaksi",
      "Target",
      "Realisasi",
      "Target Compact",
      "Realisasi Compact",
      "Realisasi Kurang dari Target",
      "Realisasi Lebih dari Target",
    ],
    ...validationResults.map((result) => [
      result.timestamp,
      result.nrk,
      result.nama,
      result.jabatan,
      result.unit_kerja,
      result.renaksi,
      result.target,
      result.realisasi,
      result.target_compact,
      result.realisasi_compact,
      result.realisasi_kurang_dari_target,
      result.realisasi_lebih_dari_target,
    ]),
  ]
    .map((row) => row.join(";"))
    .join("\n");

  fs.writeFileSync(RESULT_CSV_PATH, csvContent);

  log(`💾 CSV berhasil disimpan: ${RESULT_CSV_PATH}`);
};

const waitAndClick = async (page, selector, options = {}) => {
  const { timeout = 10000 } = options;

  log(`🖱️ Klik selector: ${selector}`);

  await page.waitForSelector(selector, {
    state: "visible",
    timeout,
  });

  await page.locator(selector).first().click();
};

const getTableId = () => {
  return bawahanLangsung
    ? "table-bawahan-langsung"
    : "table-bawahan-tidak-langsung";
};

const openValidationPage = async (page) => {
  log("🌐 Membuka halaman validasi realisasi");

  await page.goto("https://etpp.jakarta.go.id/validasi-realisasi-renaksi", {
    waitUntil: "networkidle",
  });

  log("✅ Halaman berhasil dibuka");
};

const selectPeriode = async (page, triwulan) => {
  log(`📅 Memilih Tahun ${tahun} Triwulan ${triwulan}`);

  await waitAndClick(page, ".group-date span.input-group-text");

  await waitAndClick(page, `.datepicker-years .year:has-text("${tahun}")`);

  await delay(1000);

  await page.selectOption(".custom-select.custom-select-sm", {
    label: `Triwulan ${triwulan}`,
  });

  await delay(1000);

  await waitAndClick(page, 'button:has-text("Tampilkan")');

  log("⏳ Menunggu data tampil");

  await delay(10000);
};

const getPendingValidationData = async (page, tableId) => {
  await page.waitForSelector(`table#${tableId} tbody tr`);

  await delay(2000);

  const rows = await page.locator(`#${tableId} tbody tr`).all();

  const results = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = page.locator(`table#${tableId} tbody tr`).nth(idx);

    const nrkValue =
      (await row.locator("td:nth-child(2)").textContent())?.trim() || "";

    const namaValue =
      (await row.locator("td:nth-child(3)").textContent())?.trim() || "";

    const jabatanValue =
      (
        await row.locator("td:nth-child(4) .jabatan div.fs-nano").textContent()
      )?.trim() || "";

    const lokasiValue =
      (
        await row.locator("td:nth-child(4) .lokasi div.fs-nano").textContent()
      )?.trim() || "";

    const sudahRealisasiValue =
      (await row.locator("td:nth-child(6)").textContent())?.trim() || "0";

    const sudahDivalidasiValue =
      (await row.locator("td:nth-child(7)").textContent())?.trim() || "0";

    results.push({
      idx,
      nrkValue,
      namaValue,
      jabatanValue,
      lokasiValue,
      sudahRealisasiValue,
      sudahDivalidasiValue,
      belumDivalidasiValue,
    });
  }

  return results;
};

const isValidTarget = ({ jabatanValue, lokasiValue, sudahRealisasiValue }) => {
  return (
    parseInt(sudahRealisasiValue) > 0 &&
    (jabatanValue?.toUpperCase() === "KEPALA SUBBAGIAN TATA USAHA" ||
      jabatanValue?.toUpperCase() ===
        "KEPALA SATUAN PELAKSANA TATA USAHA SMP" ||
      jabatanValue
        ?.toUpperCase()
        .includes("KEPALA SATUAN PELAKSANA PENDIDIKAN KECAMATAN") ||
      lokasiValue
        ?.toUpperCase()
        .includes("SUKU DINAS PENDIDIKAN WILAYAH II KOTA ADM. JAKARTA PUSAT") ||
      jabatanValue?.toUpperCase() === "STAF")
  );
};

const openEmployeeDetailPage = async (page, nrk) => {
  const encodedId = encodeParams(String(nrk));

  const detailUrl = `https://etpp.jakarta.go.id/${encodedId}/lihat-validasi-realisasi-renaksi?tahun=${tahun}&triwulan=${triwulan}&shown=1`;

  log(`🌐 Membuka detail NRK ${nrk}`);
  log(`🔗 ${detailUrl}`);

  await page.goto(detailUrl, {
    waitUntil: "networkidle",
  });

  await page.waitForSelector(".bg-white.rounded-2xl.border.border-slate-200", {
    timeout: 30000,
  });

  log("✅ Halaman detail berhasil dibuka");
};

const processOutputValidation = async (page, employeeData, renaksiData) => {
  const totalData = await page.evaluate(() => {
    const el = document.querySelector(
      ".grid.grid-cols-2.md\\:grid-cols-4.gap-4.w-full.md\\:max-w-\\[480px\\] .text-2xl.mt-1.font-bold.text-slate-800.leading-none",
    );

    return parseInt(el?.textContent || "0");
  });

  log(`📊 Total data keseluruhan: ${totalData}`);

  const listKualitasMutu = await page
    .locator(
      ".bg-white.rounded-2xl.border.border-slate-200.group span.text-sm.font-bold.text-blue-700:has-text('%')",
    )
    .allTextContents();
  const listKetercapaianOutput = await page
    .locator(
      ".bg-white.rounded-2xl.border.border-slate-200.group div.text-xs.text-slate-500:has-text('Ketercapaian Output')",
    )
    .allTextContents();

  log(
    `📋 Kualitas mutu pada halaman ini: ${listKualitasMutu.map((text) => text.trim().replace("%", "")).join(", ")}`,
  );
  log(
    `📋 Ketercapaian output pada halaman ini: ${listKetercapaianOutput.map((text) => text.trim().replace("Ketercapaian Output: ", "")).join(", ")}`,
  );
};

const processTableRows = async (page, pendingRows) => {
  for (const data of pendingRows) {
    try {
      console.log("\n----------------------------------------\n");
      log(
        `🔍 ${data.namaValue} | Realisasi=${data.sudahRealisasiValue} | Sudah=${data.sudahDivalidasiValue} | Belum=${data.belumDivalidasiValue}`,
      );

      if (!isValidTarget(data)) {
        log("⏭️ Skip row");

        continue;
      }

      const response = page.waitForResponse((response) => {
        return (
          response.url().includes("/mankin/realisasi/") &&
          response.url().includes("/cari-target-output") &&
          response.request().method() === "GET"
        );
      });

      await openEmployeeDetailPage(page, data.nrkValue);

      const json = await (await response).json();

      const renaksiData = json?.data || [];

      await processOutputValidation(page, data, renaksiData);

      log(`🎉 Validasi ${data.namaValue} selesai`);
    } catch (err) {
      log(`❌ Error ${data.namaValue}`, err.message);
    }
  }
};

export const validasiRealisasi = async (page) => {
  await openValidationPage(page);

  while (true) {
    try {
      if (triwulan > maxTriwulan) {
        break;
      }

      log(`🚀 Memulai Triwulan ${triwulan}`);

      await selectPeriode(page, triwulan);

      const tableId = getTableId();

      const pendingRows = await getPendingValidationData(page, tableId);

      log(`📌 Total pending: ${pendingRows.length}`);

      await processTableRows(page, pendingRows);

      triwulan++;

      await delay(2000);
    } catch (err) {
      log("❌ Fatal error", err.message);

      await delay(5000);
    }
  }

  saveLogFile();

  log("🎉 Semua proses selesai");
};

(async function () {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);

  await validasiRealisasi(page);

  await browser.close();
})();
