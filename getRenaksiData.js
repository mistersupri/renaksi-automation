import { chromium } from "playwright";
import { login } from "./login.js";

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

    // buka dropdown perpage
    log("📂 Membuka dropdown limit data");

    await waitAndClick("#button-perpage");

    // klik item 100
    log("📌 Mengubah limit menjadi 100");

    const dropdownItems = await page
      .locator("#perpage-wrapper .dropdown-menu .dropdown-item")
      .all();

    let found100 = false;

    for (const item of dropdownItems) {
      const text = ((await item.textContent()) || "").trim();

      log(`🔍 Item dropdown: ${text}`);

      if (text.includes("100")) {
        found100 = true;

        // tunggu response setelah change limit
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

        await item.click();

        log("✅ Limit 100 dipilih");

        log("⏳ Menunggu response API");

        const response = await responsePromise;

        log("✅ Response API ditemukan");

        const json = await response.json();

        const rawData = json?.data || [];

        log(`📊 Total data diterima: ${rawData.length}`);

        // filter Draft / Diajukan
        const filteredData = rawData.filter((item) => {
          const statusLabel = item?.status?.label?.trim() || "";

          return statusLabel === "Draft";
        });

        log(`📌 Total data Draft/Diajukan: ${filteredData.length}`);

        // mapping
        const mappedData = filteredData.map((item) => ({
          nrk: item.nrk,
          nama: item.nama,
          jabatan: item.jabatan,
          unit_kerja: item.unit_kerja,
          status_label: item?.status?.label || null,
        }));

        const mappedFilteredData = filteredData
          .filter(
            (item) =>
              item.jabatan?.toUpperCase() === "KEPALA SUBBAGIAN TATA USAHA" ||
              item.jabatan?.toUpperCase() ===
                "KEPALA SATUAN PELAKSANA TATA USAHA SMP" ||
              item.jabatan
                ?.toUpperCase()
                .includes("KEPALA SATUAN PELAKSANA PENDIDIKAN KECAMATAN") ||
              item.unit_kerja ===
                "SUKU DINAS PENDIDIKAN WILAYAH II KOTA ADM. JAKARTA PUSAT" ||
              item.jabatan === "STAF",
          )
          .map((item) => ({
            nrk: item.nrk,
            nama: item.nama,
            jabatan: item.jabatan,
            unit_kerja: item.unit_kerja,
            status_label: item?.status?.label || null,
          }));

        log("✅ Mapping data selesai");

        console.log(`ALL: -------------- ${mappedData.length}`);
        console.log(
          mappedData.map((item) => Object.values(item).join(",")).join("\n"),
        );

        console.log(`FILTERED: -------------- ${mappedFilteredData.length}`);
        console.log(
          mappedFilteredData
            .map((item) => Object.values(item).join(","))
            .join("\n"),
        );

        return mappedFilteredData;
      }
    }

    if (!found100) {
      throw new Error("Dropdown item 100 tidak ditemukan");
    }
  } catch (err) {
    log("❌ Gagal mengambil data", err.message);

    throw err;
  }
};

(async function () {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await login(page);

  await getKinerjaBawahan(page);

  await browser.close();
})();
