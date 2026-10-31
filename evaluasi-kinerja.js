import axios from "axios";
import { chromium } from "playwright";
import { login } from "./login.js";

const tahun = 2026;
const triwulan = 3;

const STATUS = "Draft";

const JABATAN_LIST = [
  "STAF",
  "KEPALA SUBBAGIAN TATA USAHA",
  "KEPALA SATUAN PELAKSANA PENDIDIKAN KECAMATAN KEMAYORAN",
  "KEPALA SATUAN PELAKSANA PENDIDIKAN KECAMATAN CEMPAKA PUTIH",
  "KEPALA SATUAN PELAKSANA TATA USAHA SMP",
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (...args) => {
  const time = new Date().toLocaleTimeString();

  console.log(`[${time}]`, ...args);
};

const PERILAKU_FEEDBACK_MAP = {
  "BERORIENTASI PELAYANAN": "mudah dipahami dan sabar",

  AKUNTABEL: "mengakui kesalahan dan terbuka",

  KOMPETEN: "siap membantu",

  HARMONIS: "Tidak diskriminatif",

  LOYAL: "mengikuti arahan pimpinan",

  ADAPTIF: "memberikan masukan",

  KOLABORATIF: "Tidak membedakan antara satu pegawai",
};

const ENDPOINTS = [
  {
    tipe: "Bawahan Langsung",
    url: "https://etpp.jakarta.go.id/evaluasi-kinerja/search-get-evaluasi-bawahan",
  },
  {
    tipe: "Bawahan Tidak Langsung",
    url: "https://etpp.jakarta.go.id/evaluasi-kinerja/search-get-evaluasi-bawahan-tidak-langsung",
  },
];

function getTahunBulan(tahun, triwulan) {
  const bulanMap = {
    1: "03",
    2: "06",
    3: "09",
    4: "12",
  };

  return `${tahun}${bulanMap[triwulan]}`;
}

const waitAndClick = async (page, selector, timeout = 30000) => {
  await page.waitForSelector(selector, {
    state: "visible",
    timeout,
  });

  await page.locator(selector).first().click();
};

const confirmSwal = async (page) => {
  await waitAndClick(page, '.swal2-modal button:has-text("Setuju")', 120000);

  await delay(2000);
};

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);

  await page.goto("https://etpp.jakarta.go.id/evaluasi-kinerja/bawahan", {
    waitUntil: "networkidle",
  });

  await delay(3000);

  const cookies = await page.context().cookies();

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const csrfToken = await page
    .locator('meta[name="csrf-token"]')
    .getAttribute("content");

  const axiosConfig = {
    headers: {
      Cookie: cookieHeader,
      "X-CSRF-TOKEN": csrfToken,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  };

  const uniqueNRK = new Map();

  // ====================================
  // AMBIL DAFTAR PEGAWAI
  // ====================================

  for (const endpoint of ENDPOINTS) {
    let pageNumber = 1;
    let lastPage = 1;

    do {
      const response = await axios.get(
        `${endpoint.url}?tahun=${tahun}&periode=${triwulan}&status=&page=${pageNumber}&limit=100`,
        axiosConfig,
      );

      const data = response.data;

      lastPage = data.last_page || 1;

      for (const item of data.data || []) {
        if (!uniqueNRK.has(item.v_nrk)) {
          uniqueNRK.set(item.v_nrk, item);
        }
      }

      pageNumber++;
    } while (pageNumber <= lastPage);
  }

  const tahunBulan = getTahunBulan(tahun, triwulan);

  const employees = [...uniqueNRK.values()].filter(
    (item) => item.status === STATUS,
  );

  log(`Total Pegawai: ${employees.length}`);

  // ====================================
  // PROCESS PEGAWAI
  // ====================================

  for (const employee of employees) {
    try {
      log(`\n=== ${employee.v_nrk} - ${employee.v_nama} ===`);

      const cocok = JABATAN_LIST.some((j) =>
        employee.najabl?.toUpperCase().includes(j),
      );
      if (!cocok) {
        log("Jabatan tidak termasuk daftar, dilewati");
        continue;
      }

      // ====================================
      // GET DATA EVALUASI
      // ====================================

      const evaluasiResponse = await axios.get(
        `https://etpp.jakarta.go.id/evaluasi-kinerja/get-data-evaluasi?tahun_bulan=${tahunBulan}&nrk=${employee.v_nrk}&periode=${triwulan}`,
        axiosConfig,
      );

      const evaluasi = evaluasiResponse.data?.data?.[0];

      if (!evaluasi) {
        log("Data evaluasi tidak ditemukan");
        continue;
      }

      const indikatorUtama = evaluasi.evaluasi_indikator_utama || [];

      if (!indikatorUtama.length) {
        log("Tidak ada indikator utama");
        continue;
      }

      // ====================================
      // OPEN PAGE
      // ====================================

      const inputUrl = `https://etpp.jakarta.go.id/evaluasi-kinerja/${employee.v_nrk}/${tahunBulan}/${triwulan}/input-umpan-balik`;

      await page.goto(inputUrl, {
        waitUntil: "networkidle",
      });

      const nilai_hasil_kerja = await page.evaluate(() => {
        const element = document.querySelector(
          "table.table-pengurang tfoot th[colspan='2'] b.ml-2.text-dark",
        );
        return element ? element.textContent : null;
      });

      if (nilai_hasil_kerja !== "100 %") {
        log("Nilai hasil kerja kurang dari 100, dilewati");
        continue;
      }

      await delay(2000);

      log(`📋 Memulai feedback indikator utama (${employee.v_nama})`);

      const rows = await page
        .locator("#table-hasil-kerja-utama tbody tr")
        .count();

      log(`📊 Total indikator utama: ${rows}`);

      // ====================================
      // ITERASI INDIKATOR
      // ====================================

      for (
        let indikatorIndex = 0;
        indikatorIndex < Math.min(rows, indikatorUtama.length);
        indikatorIndex++
      ) {
        try {
          const indikator = indikatorUtama[indikatorIndex];

          const realisasi = indikator.f_realisasi || 100;

          log(`🔍 Indikator ${indikatorIndex + 1}: Realisasi ${realisasi}%`);

          // ====================================
          // GET FEEDBACK TEMPLATE
          // ====================================

          // const feedbackResponse = await axios.get(
          //   `https://etpp.jakarta.go.id/evaluasi-kinerja/get-data-umpan-balik?realisasi=${realisasi}&jenis_penilaian=hasil_kerja`,
          //   axiosConfig,
          // );

          // const feedbackList = feedbackResponse.data || [];

          // if (!feedbackList.length) {
          //   log("Tidak ada template umpan balik");
          //   continue;
          // }

          // const randomFeedback =
          //   feedbackList[Math.floor(Math.random() * 2)]
          //     ?.tx_umpan_balik;

          // log(
          //   `💬 Feedback terpilih: ${randomFeedback || "Tidak ada"}`,
          // );

          // if (!randomFeedback) {
          //   continue;
          // }

          const row = page
            .locator("#table-hasil-kerja-utama tbody tr")
            .nth(indikatorIndex);

          await page.evaluate(() => {
            [
              ...document.querySelectorAll(
                "#table-hasil-kerja-utama tbody tr button[title='Ubah']",
              ),
            ].forEach((e) => (e.style.display = "block"));
          });

          const editButton = row.locator('button[title="Ubah Umpan Balik"]');

          if (!(await editButton.count())) {
            continue;
          }

          await editButton.click();

          await delay(1000);

          await page.evaluate(() => {
            document.querySelector(
              "#form-umpan-balik .multiselect .multiselect__content-wrapper",
            ).style.display = "block";
          });

          await delay(2000);

          await page.evaluate(() => {
            [
              ...document.querySelectorAll(
                "#form-umpan-balik .multiselect__element span",
              ),
            ]
              .find((e) => e.textContent.includes("Pilih Umpan Balik"))
              .click();
          });

          await delay(2000);

          await page.evaluate(() => {
            [
              ...document.querySelectorAll(
                "#form-umpan-balik .multiselect__element span",
              ),
            ]
              .find((e) => e.textContent.includes("memenuhi ekspektasi dasar"))
              .click();
          });

          await delay(2000);

          await page.evaluate(() => {
            document.querySelector(
              "#form-umpan-balik .multiselect .multiselect__content-wrapper",
            ).style.display = "none";
          });
          await page.click('#form-umpan-balik button:has-text("Simpan")');

          await confirmSwal(page);

          log(`✓ Feedback indikator ${indikatorIndex + 1}`);

          await delay(1000);
        } catch (err) {
          console.error(`Indikator ${indikatorIndex + 1}`, err.message);
        }
      }

      // ====================================
      // PERILAKU KERJA
      // ====================================

      const perilakuKerja = evaluasi.perilaku_kerja || [];

      if (perilakuKerja.length) {
        log(`Total perilaku kerja: ${perilakuKerja.length}`);

        log(`📋 Memulai feedback perilaku kerja (${employee.v_nama})`);

        const perilakuRows = await page
          .locator("table.tbl-perilaku tbody tr")
          .count();

        log(`📊 Total perilaku kerja: ${perilakuRows}`);

        for (let idx = 0; idx < perilakuRows; idx++) {
          try {
            const row = await page
              .locator("table.tbl-perilaku tbody tr")
              .nth(idx);

            console.log(row);

            const perilakuName = (
              await row.locator(".nilai-perilaku").innerText({ timeout: 5000 })
            )
              .replace(/\s+/g, " ")
              .trim()
              .toUpperCase();

            const feedback = PERILAKU_FEEDBACK_MAP[perilakuName];

            log(`🔍 Perilaku ${idx + 1}: ${perilakuName}`);

            if (!feedback) {
              log(`⚠️ Mapping tidak ditemukan untuk "${perilakuName}"`);

              continue;
            }

            log(`💬 Feedback: ${feedback}`);

            await page.evaluate(() => {
              [
                ...document.querySelectorAll(
                  "table.tbl-perilaku tbody tr button[title='Ubah']",
                ),
              ].forEach((e) => (e.style.display = "block"));
            });

            const editButton = row.locator('button[title="Ubah"]');

            if (!(await editButton.count())) {
              log(`⚠️ Tombol ubah tidak ditemukan (${perilakuName})`);

              continue;
            }

            log(`🖱️ Klik ubah (${perilakuName})`);

            await editButton.click();

            await delay(1000);

            await page.evaluate(() => {
              document.querySelector(
                "#modal-umpan-balik-perilaku .multiselect .multiselect__content-wrapper",
              ).style.display = "block";
            });

            await delay(2000);

            await page.evaluate(() => {
              [
                ...document.querySelectorAll(
                  "#modal-umpan-balik-perilaku .multiselect__element span",
                ),
              ]
                .find((e) => e.textContent.includes("Pilih Umpan Balik"))
                .click();
            });

            await delay(2000);

            await page.evaluate((feedback) => {
              [
                ...document.querySelectorAll(
                  "#modal-umpan-balik-perilaku .multiselect__element span",
                ),
              ]
                .find((e) => e.textContent.includes(feedback))
                .click();
            }, feedback);

            await delay(2000);

            await page.evaluate(() => {
              document.querySelector(
                "#modal-umpan-balik-perilaku .multiselect .multiselect__content-wrapper",
              ).style.display = "none";
            });

            log(`✍️ Mengisi feedback (${perilakuName})`);

            await page.click(
              '#modal-umpan-balik-perilaku button:has-text("Simpan")',
            );

            log(`💾 Menyimpan feedback (${perilakuName})`);

            await confirmSwal(page);

            log(`✅ Berhasil feedback perilaku: ${perilakuName}`);

            await delay(1000);
          } catch (err) {
            log(`❌ Gagal feedback perilaku row ${idx + 1}`, err.message);
          }
        }
      }

      const rekomendasiButton = await page.locator(
        ".rekomendasi-item button[title='Ubah']",
      );

      if (!(await rekomendasiButton.count())) {
        log("⚠️ Tombol rekomendasi tidak ditemukan");
        continue;
      }

      await rekomendasiButton.click();

      await page.evaluate(() => {
        [
          ...document.querySelectorAll(
            "#modal-rekomendasi .multiselect__element span",
          ),
        ]
          .find((e) => e.textContent.includes("Coaching"))
          .click();
      });

      await page.click("button:has-text('Simpan')");

      await confirmSwal(page);

      const catatanButton = await page.locator(
        ".catatan-item button[title='Ubah']",
      );

      if (!(await catatanButton.count())) {
        log("⚠️ Tombol catatan tidak ditemukan");
        continue;
      }

      await catatanButton.click();

      await page.fill(
        "[placeholder='Tuliskan catatan...']",
        "Pegawai menunjukkan kinerja yang baik dan sesuai ekspektasi. Diharapkan agar pegawai mempertahankan kinerja yang telah dicapai dan meningkatkan kompetensi teknis untuk mendukung efektivitas pelaksanaan tugas.",
      );

      await page.click("button:has-text('Simpan')");

      await confirmSwal(page);

      await page.click("button:has-text('Kirim Hasil Evaluasi')");

      await confirmSwal(page);

      log(`Selesai ${employee.v_nrk} - ${employee.v_nama}`);
    } catch (err) {
      console.error(employee.v_nrk, employee.v_nama, err.message);
    }
  }

  await browser.close();
})();
