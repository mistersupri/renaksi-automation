import { chromium } from "playwright";
import { login } from "./login.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const intervensiMap = {};

export const getKinerjaBawahan = async (page) => {
  const TARGET_URL =
    "https://etpp.jakarta.go.id/list-kinerja-bawahan?tahun=2026";

  const API_PATTERN = "/mankin/daftar-kinerja-bawahan";

  const log = (message, data = "") => {
    const time = new Date().toLocaleTimeString();

    console.log(`[${time}] ${message}`, data || "");
  };

  const waitAndClick = async (selector, timeout = 10000) => {
    log(`🖱️ Klik selector: ${selector}`);

    await page.waitForSelector(selector, {
      state: "visible",
      timeout,
    });

    await page.click(selector);
  };

  try {
    log("🌐 Membuka halaman list kinerja bawahan");

    await page.goto(TARGET_URL, {
      waitUntil: "networkidle",
    });

    log("✅ Halaman berhasil dibuka");

    // =========================
    // UBAH LIMIT KE 100
    // =========================

    log("📂 Membuka dropdown limit");

    await waitAndClick("#button-perpage");

    // langsung pakai has-text
    const limit100Item = page.locator(
      '#perpage-wrapper .dropdown-menu .dropdown-item:has-text("100")',
    );

    if (!(await limit100Item.count())) {
      throw new Error("Dropdown item 100 tidak ditemukan");
    }

    const responsePromise = page.waitForResponse(
      (response) => {
        return (
          response.url().includes(API_PATTERN) &&
          response.request().method() === "GET"
        );
      },
      {
        timeout: 30000,
      },
    );

    log("📌 Memilih limit 100");

    await limit100Item.first().click();

    log("⏳ Menunggu response API");

    const response = await responsePromise;

    log("✅ Response API ditemukan");

    const json = await response.json();

    const rawData = json?.data || [];

    log(`📊 Total data diterima: ${rawData.length}`);

    // =========================
    // FILTER DATA
    // =========================

    const filteredData = rawData.filter((item) => {
      const statusLabel = item?.status?.label?.trim() || "";

      return ["Diajukan", "Disetujui", "Proses Verval"].includes(statusLabel);
    });

    log(`📌 Total data terfilter: ${filteredData.length}`);

    const mappedData = filteredData.map((item) => ({
      nrk: item.nrk,
      nama: item.nama,
      jabatan: item.jabatan,
      unit_kerja: item.unit_kerja,
      status_label: item?.status?.label || null,
    }));

    console.table(mappedData);

    // =========================
    // ITERASI DATA
    // =========================

    for (const [idx, item] of mappedData.entries()) {
      try {
        log(
          `➡️ [${idx + 1}/${mappedData.length}] Memproses ${item.nama} - ${item.jabatan} ${item.unit_kerja} (${item.nrk})`,
        );

        await page.waitForSelector("#data-kinerja-bawahan tbody tr");

        await delay(2000);

        // =========================
        // CARI ROW BERDASARKAN NRK
        // =========================

        const row = page
          .locator(
            `#data-kinerja-bawahan tbody tr:has(td:has-text("${item.nrk}"))`,
          )
          .first();

        if (!(await row.count())) {
          log(`⚠️ Row NRK ${item.nrk} tidak ditemukan`);

          continue;
        }

        log("✅ Row ditemukan");

        // =========================
        // KLIK DETAIL
        // =========================

        const detailButton = row.locator('button:has-text("Detil")');

        if (!(await detailButton.count())) {
          log(`⚠️ Tombol Detil tidak ditemukan (${item.nama})`);

          continue;
        }

        log("🖱️ Klik tombol Detil");

        await detailButton.click();

        // =========================
        // HALAMAN VALIDASI
        // =========================

        log("⏳ Menunggu halaman Validasi");

        await page.waitForSelector('.subheader-title:has-text("Validasi")', {
          timeout: 30000,
        });

        log("✅ Halaman Validasi terbuka");

        // =========================
        // AMBIL DATA PEGAWAI
        // =========================

        await delay(2000);

        const intervensiList = await page.evaluate(() => {
          return [
            ...document.querySelectorAll(
              ".data-kinerja-pegawai table tbody tr td[aria-colindex='2']",
            ),
          ].map((el) => el.textContent);
        });

        for (const intervensi of intervensiList) {
          intervensiMap[intervensi] = `${item.nrk}`;
        }
        console.log(intervensiList);

        log(`👥 Total Intervensi ditemukan: ${intervensiList.length}`);

        await page.goto(TARGET_URL, {
          waitUntil: "networkidle",
        });

        log("✅ Halaman berhasil dibuka");

        // =========================
        // UBAH LIMIT KE 100
        // =========================

        log("📂 Membuka dropdown limit");

        await waitAndClick("#button-perpage");

        // langsung pakai has-text
        const limit100Item = page.locator(
          '#perpage-wrapper .dropdown-menu .dropdown-item:has-text("100")',
        );

        if (!(await limit100Item.count())) {
          throw new Error("Dropdown item 100 tidak ditemukan");
        }

        await limit100Item.first().click();

        await page.waitForResponse(
          (response) => {
            return (
              response.url().includes(API_PATTERN) &&
              response.request().method() === "GET"
            );
          },
          {
            timeout: 30000,
          },
        );

        await delay(2000);
      } catch (err) {
        log(`❌ Gagal memproses ${item.nama}`, err.message);
      }
    }

    log(JSON.stringify(intervensiMap, null, 2));

    log("🎉 Semua proses selesai");
  } catch (err) {
    log("❌ Gagal mengambil data", err.message);

    throw err;
  }
};

(async function () {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);

  await getKinerjaBawahan(page);

  await browser.close();
})();
