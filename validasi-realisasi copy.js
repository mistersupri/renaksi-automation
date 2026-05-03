import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { login } from "./login.js";

const tahun = 2026;
const maxTriwulan = 4;
const bawahanLangsung = true;

let triwulan = 1;

const isNeedValidateAll = true;

// ==============================
// LOG FILE
// ==============================

const RESULT_LOG_PATH = path.join(
  process.cwd(),
  `hasil-validasi-${Date.now()}.json`,
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

const waitAndClick = async (page, selector, options = {}) => {
  const { timeout = 10000 } = options;

  log(`🖱️ Klik selector: ${selector}`);

  await page.waitForSelector(selector, {
    state: "visible",
    timeout,
  });

  await page.locator(selector).first().click();
};

const confirmSwal = async (page) => {
  log("⚠️ Menunggu popup konfirmasi");

  await waitAndClick(page, 'button:has-text("Ya, saya sangat yakin")', {
    timeout: 100000,
  });

  await waitAndClick(page, '.swal2-modal button:has-text("OK")', {
    timeout: 100000,
  });

  log("✅ Popup konfirmasi selesai");
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

  await delay(5000);
};

const getPendingValidationData = async (page, tableId) => {
  await page.waitForSelector(`table#${tableId} tbody tr`);

  await delay(2000);

  const rows = await page.locator(`#${tableId} tbody tr`).all();

  const results = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = page.locator(`table#${tableId} tbody tr`).nth(idx);

    const belumDivalidasiValue =
      (await row.locator("td:nth-child(8)").textContent())?.trim() || "0";

    if (isNeedValidateAll || parseInt(belumDivalidasiValue) > 0) {
      results.push({
        idx,
      });
    }
  }

  return results;
};

const getRowData = async (row) => {
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

  const belumDivalidasiValue =
    (await row.locator("td:nth-child(8)").textContent())?.trim() || "0";

  return {
    nrkValue,
    namaValue,
    jabatanValue,
    lokasiValue,
    sudahRealisasiValue,
    sudahDivalidasiValue,
    belumDivalidasiValue,
  };
};

const isValidTarget = ({ jabatanValue, lokasiValue, sudahRealisasiValue }) => {
  return (
    sudahRealisasiValue > 0 &&
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

const fillValidationForm = async (page, idx, employeeData) => {
  log("📝 Mengisi form validasi");

  const targetValue = await page.evaluate(() => {
    const els = document.querySelectorAll(".grid.grid-cols-3 > div");

    return parseInt([...els][0]?.children?.[1]?.textContent || "0");
  });

  const realisasiValue = await page.evaluate(() => {
    const els = document.querySelectorAll(".grid.grid-cols-3 > div");

    return parseInt([...els][1]?.children?.[1]?.textContent || "0");
  });

  const targetCompactValue = await page.evaluate(() => {
    const els = document.querySelectorAll(
      ".target-output .grid.grid-cols-2 > div",
    );

    return parseInt([...els][0]?.children?.[1]?.textContent || "0");
  });

  const realisasiCompactValue = await page.evaluate(() => {
    const els = document.querySelectorAll(
      ".target-output .grid.grid-cols-2 > div",
    );

    return parseInt([...els][1]?.children?.[1]?.textContent || "0");
  });

  const isLessThanTarget =
    realisasiValue < targetValue || realisasiCompactValue < targetCompactValue;

  // ==============================
  // PUSH RESULT
  // ==============================

  validationResults.push({
    timestamp: new Date().toISOString(),
    nama: employeeData.namaValue,
    jabatan: employeeData.jabatanValue,
    unit_kerja: employeeData.lokasiValue,
    target: targetValue,
    realisasi: realisasiValue,
    target_compact: targetCompactValue,
    realisasi_compact: realisasiCompactValue,
    realisasi_kurang_dari_target: isLessThanTarget,
  });

  saveLogFile();

  log(`📌 Target=${targetValue} | Realisasi=${realisasiValue}`);

  log(
    `📌 Compact Target=${targetCompactValue} | Compact Realisasi=${realisasiCompactValue}`,
  );

  log(`📌 Kurang dari target: ${isLessThanTarget ? "YA" : "TIDAK"}`);

  await page.fill("#validasi", `${realisasiValue || 0}`);

  await page.fill("#nilai_kualitas", "100");

  await page.fill(
    "#keterangan",
    "Output terealisasi sesuai dengan rencana aksi.",
  );

  const validasiIndikator = await page.locator("#validasi-compact");

  if (await validasiIndikator.count()) {
    await page.fill(
      "#validasi-compact",
      `${realisasiCompactValue || realisasiValue || 0}`,
    );

    await page.fill(
      "#keterangan-compact",
      "Output terealisasi sesuai dengan rencana aksi.",
    );
  }

  await waitAndClick(page, 'button[type="submit"]:has-text("Simpan")');

  log("💾 Submit validasi");

  await confirmSwal(page);

  log(`✅ Output ke-${idx + 1} berhasil divalidasi`);
};

const processOutputValidation = async (page, employeeData) => {
  const cardSelector = ".bg-white.rounded-2xl.border.border-slate-200";

  const totalData = await page.evaluate(() => {
    const el = document.querySelector(
      ".grid.grid-cols-2.md\\:grid-cols-4.gap-4.w-full.md\\:max-w-\\[480px\\] .text-2xl.mt-1.font-bold.text-slate-800.leading-none",
    );

    return parseInt(el?.textContent || "0");
  });

  log(`📊 Total data keseluruhan: ${totalData}`);

  let counter = 0;

  while (true) {
    const cards = await page.locator(cardSelector).all();

    log(`📦 Total card halaman: ${cards.length}`);

    for (let idx = 0; idx < cards.length; idx++) {
      try {
        const card = page.locator(cardSelector).nth(idx);

        const cardText = (await card.textContent())?.trim() || "";

        if (!cardText.includes("Belum Validasi") && !isNeedValidateAll) {
          continue;
        }

        counter++;

        log(`➡️ Memproses output ke-${idx + 1}`);

        const pilihDataButton = card.locator('button:has-text("Pilih Data")');

        if (!(await pilihDataButton.count())) {
          continue;
        }

        await pilihDataButton.click();

        await delay(1000);

        await fillValidationForm(page, idx, employeeData);

        await delay(3000);
      } catch (err) {
        log(`❌ Gagal validasi output ke-${idx + 1}`, err.message);
      }
    }

    if (counter < totalData) {
      log("➡️ Pindah ke halaman berikutnya");

      const nextButton = page.locator('.page-item:has-text("›")');

      await nextButton.first().click();

      await delay(3000);

      continue;
    }

    log("✅ Semua output selesai divalidasi");

    break;
  }
};

const processTableRows = async (page, tableId, pendingRows) => {
  for (const rowData of pendingRows) {
    const { idx } = rowData;

    try {
      const row = page.locator(`table#${tableId} tbody tr`).nth(idx);

      const data = await getRowData(row);

      log(
        `🔍 ${data.namaValue} | Realisasi=${data.sudahRealisasiValue} | Sudah=${data.sudahDivalidasiValue} | Belum=${data.belumDivalidasiValue}`,
      );

      log(`📌 Jabatan: ${data.jabatanValue}`);
      log(`💼 Lokasi: ${data.lokasiValue}`);

      if (!isValidTarget(data)) {
        log("⏭️ Skip row");

        continue;
      }

      const buttonText = bawahanLangsung ? "Validasi" : "Lihat";

      const validationButton = row.locator(`button:has-text("${buttonText}")`);

      if (!(await validationButton.count())) {
        continue;
      }

      log(`➡️ Memulai validasi ${data.namaValue}`);

      await validationButton.click();

      await delay(2000);

      await processOutputValidation(page, data);

      log(`🎉 Validasi ${data.namaValue} selesai`);

      await openValidationPage(page);

      await selectPeriode(page, triwulan);
    } catch (err) {
      log(`❌ Error row ke-${idx + 1}`, err.message);
    }
  }
};

export const validasiRealisasi = async (page) => {
  await openValidationPage(page);

  while (true) {
    try {
      if (triwulan > maxTriwulan) {
        log("🏁 Semua triwulan selesai");

        break;
      }

      log(`🚀 Memulai Triwulan ${triwulan}`);

      await selectPeriode(page, triwulan);

      const tableId = getTableId();

      const pendingRows = await getPendingValidationData(page, tableId);

      log(`📌 Total pending: ${pendingRows.length}`);

      if (pendingRows.length === 0) {
        triwulan++;

        continue;
      }

      await processTableRows(page, tableId, pendingRows);

      triwulan++;

      await delay(2000);
    } catch (err) {
      log("❌ Fatal error", err.message);

      await delay(5000);
    }
  }

  saveLogFile();

  log("🎉 Semua proses validasi selesai");
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
